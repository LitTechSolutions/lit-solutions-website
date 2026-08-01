// orders.js -- website plan orders placed through the cart.
//
// The spine of the purchase flow: cart -> account -> pay -> project brief.
// An order is the thing that survives all of it, so the dashboard always
// knows what a customer bought and what step they're on.
//
// Status moves in one direction only:
//
//   awaiting_payment   created at checkout, nothing paid yet
//   payment_reported   the customer came back from Square saying they paid.
//                      Their claim, not proof -- see below.
//   paid               confirmed, by the Square webhook or by an admin
//   brief_submitted    the project brief is in; this is a build we can start
//
// Why payment_reported exists. Square payment links are static and shared by
// every customer, so nothing in the redirect identifies WHICH order was paid.
// The honest options were to make the customer wait for a human, or to accept
// their word and label it as such. This does the second: the brief unlocks
// immediately (so momentum isn't lost while they're keen), the dashboard says
// in plain words that payment is pending confirmation, and nothing is built
// until it reaches `paid`. Worst case someone fills in a form without paying,
// which costs nothing.
//
// Routes:
//   POST   /orders                       create from a plan key (signed-in)
//   GET    /orders                        the caller's own orders
//   PATCH  /orders {id, action:"report-payment"}   customer: I've paid
//   PATCH  /orders {id, action:"confirm-payment"}  admin only
//   GET    /orders?all=true               admin: every order

const crypto = require("node:crypto");
const { readCookie, getSession, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");
const { getPlan } = require("./_lib/plan_catalog");
const { sendEmail } = require("./_lib/email");

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "dylan@lit-solutions.tech";

function isAdmin(session) {
  return session.role === "admin";
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function publicOrder(o) {
  const plan = getPlan(o.planKey);
  return {
    id: o.id,
    planKey: o.planKey,
    planName: plan ? plan.name : o.planKey,
    deposit: plan ? plan.deposit : null,
    monthly: plan ? plan.monthly : null,
    depositLink: plan ? plan.depositLink : null,
    subscriptionLink: plan ? plan.subscriptionLink : null,
    status: o.status,
    createdAt: o.createdAt,
    paymentReportedAt: o.paymentReportedAt || null,
    paidAt: o.paidAt || null,
    briefSubmittedAt: o.briefSubmittedAt || null,
    briefDocumentId: o.briefDocumentId || null,
  };
}

async function listOrdersFor(customerId) {
  const s = store("orders");
  const { blobs } = await s.list();
  const out = [];
  for (const b of blobs) {
    const o = await getJSON("orders", b.key);
    if (o && o.customerId === customerId) out.push(o);
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function listAllOrders() {
  const s = store("orders");
  const { blobs } = await s.list();
  const out = [];
  for (const b of blobs) {
    const o = await getJSON("orders", b.key);
    if (o) out.push(o);
  }
  return out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

exports.handler = async (event, context, deps = {}) => {
  const readCookieFn = deps.readCookie || readCookie;
  const getSessionFn = deps.getSession || getSession;
  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  if (event.httpMethod === "GET") {
    const wantsAll = event.queryStringParameters && event.queryStringParameters.all === "true";
    if (wantsAll) {
      if (!isAdmin(session)) return json(403, { error: "Admin access required." });
      const all = await (deps.listAllOrders || listAllOrders)();
      return json(200, { orders: all.map(publicOrder), raw: all.map((o) => ({ id: o.id, customerEmail: o.customerEmail })) });
    }
    const mine = await (deps.listOrdersFor || listOrdersFor)(session.userId);
    return json(200, { orders: mine.map(publicOrder) });
  }

  if (event.httpMethod === "POST") {
    if (await rateLimited(event, "orders-create", 10, 3600)) {
      return json(429, { error: "Too many orders started. Try again shortly." });
    }
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }

    // The plan key is validated against the SERVER catalog, never taken on
    // trust from the cart -- a hand-edited localStorage value must not be
    // able to invent a plan or a price.
    const plan = getPlan(body.planKey);
    if (!plan) return json(400, { error: "Unknown plan." });

    // One live order at a time. Someone clicking checkout twice should land
    // back on the order they already have, not accumulate duplicates on
    // their dashboard.
    const existing = await (deps.listOrdersFor || listOrdersFor)(session.userId);
    const open = existing.find((o) => o.status !== "brief_submitted");
    if (open) return json(200, { order: publicOrder(open), existing: true });

    const order = {
      id: (deps.idGenerator || (() => crypto.randomUUID()))(),
      customerId: session.userId,
      customerEmail: session.email || null,
      planKey: plan.key,
      status: "awaiting_payment",
      createdAt: (deps.now ? deps.now() : new Date()).toISOString(),
    };
    await setJSON("orders", order.id, order);

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `New ${plan.name} order started — ${esc(order.customerEmail || "unknown")}`,
      html: `<p>A customer started a <strong>${esc(plan.name)}</strong> order (${esc(plan.deposit)} deposit, then ${esc(plan.monthly)}/month).</p>` +
        `<p>Account: ${esc(order.customerEmail || "unknown")}<br>Order: ${esc(order.id)}</p>` +
        `<p>They have not paid yet. You'll get another email when they report payment.</p>`,
    });

    return json(201, { order: publicOrder(order) });
  }

  if (event.httpMethod === "PATCH") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }
    if (!body.id || !body.action) return json(400, { error: "id and action are required." });

    const order = await getJSON("orders", body.id);
    if (!order) return json(404, { error: "Order not found." });

    if (body.action === "report-payment") {
      if (order.customerId !== session.userId && !isAdmin(session)) {
        return json(403, { error: "Not your order." });
      }
      if (order.status !== "awaiting_payment") return json(200, { order: publicOrder(order) });
      order.status = "payment_reported";
      order.paymentReportedAt = (deps.now ? deps.now() : new Date()).toISOString();
      await setJSON("orders", order.id, order);

      const plan = getPlan(order.planKey);
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `Payment reported — ${plan ? plan.name : order.planKey} — ${esc(order.customerEmail || "unknown")}`,
        html: `<p><strong>${esc(order.customerEmail || "unknown")}</strong> says they've paid the ${esc(plan ? plan.deposit : "")} deposit for <strong>${esc(plan ? plan.name : order.planKey)}</strong>.</p>` +
          `<p>This is their word, not Square's. Confirm it against Square before starting work — the dashboard shows them "pending confirmation" until you do.</p>` +
          `<p>Order: ${esc(order.id)}</p>`,
      });
      return json(200, { order: publicOrder(order) });
    }

    if (body.action === "confirm-payment") {
      if (!isAdmin(session)) return json(403, { error: "Admin access required." });
      if (order.status === "brief_submitted") return json(200, { order: publicOrder(order) });
      order.status = "paid";
      order.paidAt = (deps.now ? deps.now() : new Date()).toISOString();
      await setJSON("orders", order.id, order);
      return json(200, { order: publicOrder(order) });
    }

    return json(400, { error: "Unknown action." });
  }

  return json(405, { error: "Method not allowed" });
};

module.exports.publicOrder = publicOrder;
