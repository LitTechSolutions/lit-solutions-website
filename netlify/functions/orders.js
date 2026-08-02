// orders.js -- what a customer bought, and what step they're on.
//
// The spine of the purchase flow: cart -> account -> pay -> project brief.
// An order is the thing that survives all of it, so the dashboard always
// knows what was bought and what happens next.
//
// Status moves in one direction only:
//
//   awaiting_payment    created at checkout, nothing paid yet
//   payment_processing  a delayed method (some BNPL) is still settling
//   paid                confirmed by the Stripe webhook, or by an admin
//   brief_submitted     the project brief is in; this is a build we can start
//   checkout_failed     Stripe refused to open a session; nothing was charged
//
// Orders are NOT created here any more. checkout.js creates one before it
// opens the Stripe session, precisely so the order id can travel in the
// session metadata and come back on the webhook. That single fact removed
// three things this file used to need:
//
//   * POST /orders -- the cart no longer creates an order client-side.
//   * "payment_reported" -- Square payment links were static and shared, so
//     nothing in the redirect said WHICH order was paid, and the least-bad
//     option was to take the customer's word ("I've completed both payments")
//     and label it unconfirmed. Stripe tells us directly. The state is gone,
//     and so is the button.
//   * Two checkouts per purchase -- Square allowed one paid phase per link,
//     so a deposit and a monthly plan meant two trips. Stripe puts both in
//     one session.
//
// Legacy orders written by the Square flow still render: publicOrder() reads
// either shape. Their `depositLink`/`subscriptionLink` are passed through so
// an in-flight order from before the migration can still be completed, and
// an admin can still confirm one by hand.
//
// Routes:
//   GET    /orders                                  the caller's own orders
//   GET    /orders?all=true                         admin: every order
//   PATCH  /orders {id, action:"confirm-payment"}   admin: mark paid by hand
//   PATCH  /orders {id, action:"cancel"}            abandon an unpaid order

const { readCookie, getSession, json } = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");
const { getProduct } = require("./_lib/product_catalog");

function isAdmin(session) {
  return session.role === "admin";
}

function money(cents) {
  return `$${((cents || 0) / 100).toFixed(2).replace(/\.00$/, "")}`;
}

/**
 * One shape for the dashboard regardless of which era wrote the order.
 * New orders carry items[] + pricing; Square-era ones carry a single planKey.
 */
function publicOrder(o) {
  const legacyPlan = o.planKey ? { key: o.planKey, name: o.planName || o.planKey } : null;

  const items = Array.isArray(o.items) && o.items.length
    ? o.items.map((i) => {
        const p = getProduct(i.key);
        return {
          key: i.key,
          name: i.name || (p ? p.name : i.key),
          quantity: i.quantity || 1,
          kind: p ? p.kind : null,
          category: p ? p.category : null,
        };
      })
    : (legacyPlan ? [{ key: legacyPlan.key, name: legacyPlan.name, quantity: 1, kind: "plan", category: "Website subscription" }] : []);

  const pricing = o.pricing || null;

  return {
    id: o.id,
    provider: o.provider || (o.planKey ? "square" : null),
    items,
    // A one-line headline the dashboard can show without re-deriving it.
    summary: items.length
      ? items.map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name)).join(", ")
      : "Your order",
    chargedTodayCents: pricing ? pricing.chargedTodayCents : null,
    monthlyCents: pricing ? pricing.monthlyCents : null,
    balanceAtLaunchCents: pricing ? pricing.balanceAtLaunchCents : null,
    amountPaidCents: o.amountPaidCents != null ? o.amountPaidCents : null,
    currency: "USD",
    hero: !!o.hero,
    payInFull: !!o.payInFull,
    // Only a build needs a brief; a cart of one-off services does not.
    needsBrief: items.some((i) => i.kind === "plan" || i.kind === "package"),
    status: o.status,
    createdAt: o.createdAt,
    paidAt: o.paidAt || null,
    briefSubmittedAt: o.briefSubmittedAt || null,
    briefDocumentId: o.briefDocumentId || null,
    receiptDocumentId: o.receiptDocumentId || null,
    invoiceReference: o.invoice && o.invoice.reference ? o.invoice.reference : null,
    checkoutError: o.checkoutError || null,
    hasSubscription: !!o.stripeSubscriptionId,
    subscriptionStatus: o.subscriptionStatus || (o.stripeSubscriptionId ? "active" : null),
    subscriptionEndedAt: o.subscriptionEndedAt || null,
    refundStatus: o.refundStatus || null,
    amountRefundedCents: o.amountRefundedCents != null ? o.amountRefundedCents : null,
    // Square-era fields, passed through so an in-flight legacy order is still
    // completable. Null on everything created since the Stripe migration.
    depositLink: o.depositLink || null,
    subscriptionLink: o.subscriptionLink || null,
    paymentReportedAt: o.paymentReportedAt || null,
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
  const setJSONFn = deps.setJSON || setJSON;
  const getJSONFn = deps.getJSON || getJSON;

  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  if (event.httpMethod === "GET") {
    const wantsAll = event.queryStringParameters && event.queryStringParameters.all === "true";
    if (wantsAll) {
      if (!isAdmin(session)) return json(403, { error: "Admin access required." });
      const all = await (deps.listAllOrders || listAllOrders)();
      return json(200, {
        orders: all.map(publicOrder),
        raw: all.map((o) => ({ id: o.id, customerEmail: o.customerEmail })),
      });
    }
    const mine = await (deps.listOrdersFor || listOrdersFor)(session.userId);
    return json(200, { orders: mine.map(publicOrder) });
  }

  // Orders are created by checkout.js, which is the only place that can put
  // the order id into a Stripe session's metadata. Creating one here would
  // produce an order nothing can ever pay for.
  if (event.httpMethod === "POST") {
    return json(410, { error: "Orders are created at checkout. Start from your cart." });
  }

  if (event.httpMethod === "PATCH") {
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }
    if (!body.id || !body.action) return json(400, { error: "id and action are required." });

    const order = await getJSONFn("orders", body.id);
    if (!order) return json(404, { error: "Order not found." });

    if (body.action === "confirm-payment") {
      // Kept as a manual fallback for a webhook that never arrived, and for
      // an order paid by cash, card in person, or a Square invoice.
      if (!isAdmin(session)) return json(403, { error: "Admin access required." });
      if (order.status === "brief_submitted") return json(200, { order: publicOrder(order) });
      order.status = "paid";
      order.paidAt = (deps.now ? deps.now() : new Date()).toISOString();
      order.confirmedManuallyBy = session.userId;
      await setJSONFn("orders", order.id, order);
      return json(200, { order: publicOrder(order) });
    }

    if (body.action === "cancel") {
      if (order.customerId !== session.userId && !isAdmin(session)) {
        return json(403, { error: "Not your order." });
      }
      // Anything that has been paid for is a real commitment; cancelling it
      // is a conversation, not a button.
      if (order.status !== "awaiting_payment" && order.status !== "checkout_failed") {
        return json(400, { error: "That order has already been paid. Call us on 804-309-0968." });
      }
      order.status = "cancelled";
      order.cancelledAt = (deps.now ? deps.now() : new Date()).toISOString();
      await setJSONFn("orders", order.id, order);
      return json(200, { order: publicOrder(order) });
    }

    return json(400, { error: "Unknown action." });
  }

  return json(405, { error: "Method not allowed" });
};

module.exports.publicOrder = publicOrder;
module.exports.money = money;
