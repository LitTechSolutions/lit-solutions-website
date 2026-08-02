// A practical, admin-only operations feed for the account workspace. It
// aggregates the site's existing Blobs data without exposing password hashes,
// session tokens, IP addresses, Stripe ids, or private file-storage fields.

const { readCookie, getSession, json } = require("./_lib/auth_utils");
const { store, getJSON, setJSON } = require("./_lib/blob_store");
const { checkoutStatus } = require("./_lib/checkout_status");
const { resolveStripe } = require("./_lib/stripe_config");

const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost", "archived"];

async function listRecords(storeName, deps = {}) {
  const storeFn = deps.store || store;
  const s = storeFn(storeName);
  const listing = await s.list();
  const rows = [];
  for (const blob of (listing.blobs || [])) {
    const value = await s.get(blob.key, { type: "json" });
    if (value) rows.push({ key: blob.key, ...value });
  }
  return rows;
}

function timeValue(value) {
  if (typeof value === "number") return value;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeLead(record, source) {
  return {
    id: record.id || record.key,
    source,
    status: LEAD_STATUSES.includes(record.adminStatus) ? record.adminStatus : "new",
    name: record.customerName || record.fullName || record.name || "",
    businessName: record.businessName || "",
    email: record.email || "",
    phone: record.phone || "",
    service: record.serviceType || record.package || record.form || "",
    preferredContact: record.preferredContact || record.contactMethod || "",
    estimateTotal: Number(record.estimateTotal || 0),
    summary: record.reason || record.note || record.notes || record.customRequest || "",
    createdAt: record.createdAt || null,
    adminNote: record.adminNote || "",
  };
}

function safeOrder(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return {
    id: order.id || order.key,
    customerId: order.customerId || null,
    customerEmail: order.customerEmail || "",
    status: order.status || "unknown",
    summary: items.length
      ? items.map((item) => item.name || item.key).filter(Boolean).join(", ")
      : order.planName || order.planKey || "Order",
    amountPaidCents: Number(order.amountPaidCents || 0),
    chargedTodayCents: Number((order.pricing && order.pricing.chargedTodayCents) || 0),
    monthlyCents: Number((order.pricing && order.pricing.monthlyCents) || 0),
    amountRefundedCents: Number(order.amountRefundedCents || 0),
    createdAt: order.createdAt || null,
    paidAt: order.paidAt || null,
    needsBrief: items.some((item) => item.kind === "plan" || item.kind === "package") || !!order.planKey,
    briefSubmittedAt: order.briefSubmittedAt || null,
    receiptDocumentId: order.receiptDocumentId || null,
    hasSubscription: !!order.stripeSubscriptionId,
    subscriptionStatus: order.subscriptionStatus || null,
  };
}

async function loadAll(deps) {
  const listRecordsFn = deps.listRecords || listRecords;
  const names = ["users", "orders", "documents", "messages", "leads", "inquiries"];
  const values = await Promise.all(names.map((name) => listRecordsFn(name, deps)));
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
}

exports.handler = async (event, context, deps = {}) => {
  const readCookieFn = deps.readCookie || readCookie;
  const getSessionFn = deps.getSession || getSession;
  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });
  if (session.role !== "admin") return json(403, { error: "Admin access required." });

  if (event.httpMethod === "PATCH") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch (_) { return json(400, { error: "Invalid JSON" }); }
    if (body.action !== "update-lead") return json(400, { error: "Unknown action." });
    const source = body.source === "inquiries" ? "inquiries" : body.source === "leads" ? "leads" : null;
    const id = String(body.id || "").trim();
    if (!source || !id) return json(400, { error: "Lead source and id are required." });
    if (!LEAD_STATUSES.includes(body.status)) return json(400, { error: "Choose a valid lead status." });

    const getJSONFn = deps.getJSON || getJSON;
    const setJSONFn = deps.setJSON || setJSON;
    const record = await getJSONFn(source, id);
    if (!record) return json(404, { error: "Lead not found." });
    record.adminStatus = body.status;
    if (body.note !== undefined) record.adminNote = String(body.note || "").trim().slice(0, 2000);
    record.adminUpdatedAt = new Date().toISOString();
    record.adminUpdatedBy = session.userId;
    await setJSONFn(source, id, record);
    return json(200, { message: "Lead updated.", lead: safeLead({ key: id, ...record }, source) });
  }

  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const query = event.queryStringParameters || {};
  if (query.view === "system") {
    let stripe;
    const env = deps.env || process.env;
    try { stripe = (deps.resolveStripe || resolveStripe)(env); } catch (_) { stripe = { ok: false, mode: "unknown", available: {} }; }
    return json(200, {
      system: {
        checkout: (deps.checkoutStatus || checkoutStatus)(env),
        stripe: {
          ready: !!stripe.ok,
          mode: stripe.mode || "unknown",
          keyConfigured: !!(stripe.available && (stripe.available.STRIPE_SECRET_KEY || stripe.available.STRIPE_TEST_KEY)),
          webhookSecretConfigured: !!stripe.webhookSecret,
        },
        emailConfigured: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
        fileStorageConfigured: !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
      },
    });
  }

  const data = await loadAll(deps);
  const orders = data.orders.map(safeOrder).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));
  const leads = [
    ...data.leads.map((record) => safeLead(record, "leads")),
    ...data.inquiries.map((record) => safeLead(record, "inquiries")),
  ].sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt));

  const customerUsers = data.users.filter((u) => u.role === "customer");
  const customers = customerUsers.map((user) => {
    const customerOrders = data.orders.filter((o) => o.customerId === user.id || (o.customerEmail && o.customerEmail === user.email));
    const customerDocs = data.documents.filter((d) => d.customerId === user.id);
    const customerMessages = data.messages.filter((m) => m.customerId === user.id);
    const paid = customerOrders.reduce((sum, order) => sum + Number(order.amountPaidCents || 0) - Number(order.amountRefundedCents || 0), 0);
    const activity = [user.createdAt, ...customerOrders.map((o) => o.paidAt || o.createdAt), ...customerMessages.map((m) => m.createdAt), ...customerDocs.map((d) => d.uploadedAt)].map(timeValue);
    return {
      id: user.id,
      name: user.name || "",
      email: user.email || user.key,
      verified: !!user.verified,
      heroStatus: (user.heroStatus && user.heroStatus.state) || "none",
      createdAt: user.createdAt || null,
      lastActivityAt: Math.max(0, ...activity),
      orderCount: customerOrders.length,
      documentCount: customerDocs.length,
      messageCount: customerMessages.length,
      lifetimeValueCents: paid,
    };
  }).sort((a, b) => b.lastActivityAt - a.lastActivityAt);

  const unreadMessages = data.messages.filter((m) => m.from === "customer" && !m.readByStaff).length;
  const pendingHeroes = customerUsers.filter((u) => u.heroStatus && u.heroStatus.state === "pending").length;
  const paidOrders = orders.filter((o) => ["paid", "brief_submitted"].includes(o.status));
  const openOrders = orders.filter((o) => ["awaiting_payment", "payment_processing", "checkout_failed"].includes(o.status));
  const grossCents = paidOrders.reduce((sum, order) => sum + (order.amountPaidCents || order.chargedTodayCents) - order.amountRefundedCents, 0);
  const newLeads = leads.filter((lead) => lead.status === "new").length;

  return json(200, {
    metrics: {
      customers: customers.length,
      paidOrders: paidOrders.length,
      openOrders: openOrders.length,
      grossCents,
      newLeads,
      unreadMessages,
      pendingHeroes,
      documents: data.documents.length,
    },
    customers,
    orders,
    leads,
    recentMessages: data.messages
      .slice()
      .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))
      .slice(0, 12)
      .map((m) => ({ customerEmail: m.customerEmail || "", from: m.from, body: String(m.body || "").slice(0, 240), createdAt: m.createdAt, unread: m.from === "customer" && !m.readByStaff })),
  });
};

module.exports.safeLead = safeLead;
module.exports.safeOrder = safeOrder;
module.exports.LEAD_STATUSES = LEAD_STATUSES;
