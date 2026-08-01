// billing-portal.js -- hands a subscriber to Stripe's own billing portal.
//
// Update a card, download an invoice, cancel a plan. All of it is Stripe's
// hosted page, which means we never touch card details and there is no
// self-service billing UI here to keep correct.
//
// Cancellation is deliberately NOT special-cased. terms.html section 9.2
// commits to written notice before a subscribed site goes offline, and the
// customer.subscription.deleted webhook is what tells us to start that
// conversation -- the portal ends the billing, a human ends the hosting.
//
// POST /billing-portal            -> { url } for the caller's own subscription
// POST /billing-portal {orderId}  -> the portal for one specific order

const { readCookie, getSession, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, store } = require("./_lib/blob_store");
const { createBillingPortalSession } = require("./_lib/stripe_api");

function siteOrigin(event) {
  const host = (event.headers && (event.headers["x-forwarded-host"] || event.headers.host)) || "lit-solutions.tech";
  const proto = (event.headers && event.headers["x-forwarded-proto"]) || "https";
  return `${proto}://${host}`;
}

/** The most recent order of this customer's that Stripe knows a customer id for. */
async function findStripeCustomerId(customerId, getJSONFn, storeFn) {
  const s = storeFn("orders");
  const { blobs } = await s.list();
  let best = null;
  for (const b of blobs) {
    const o = await getJSONFn("orders", b.key);
    if (!o || o.customerId !== customerId || !o.stripeCustomerId) continue;
    if (!best || String(o.createdAt) > String(best.createdAt)) best = o;
  }
  return best ? best.stripeCustomerId : null;
}

exports.handler = async (event, context, deps = {}) => {
  const readCookieFn = deps.readCookie || readCookie;
  const getSessionFn = deps.getSession || getSession;
  const getJSONFn = deps.getJSON || getJSON;
  const storeFn = deps.store || store;

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  if (await rateLimited("billing-portal", session.userId, 10, 3600)) {
    return json(429, { error: "Too many attempts. Try again shortly." });
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* no body is fine */ }

  let stripeCustomerId = null;
  if (body.orderId) {
    const order = await getJSONFn("orders", String(body.orderId));
    if (!order) return json(404, { error: "Order not found." });
    if (order.customerId !== session.userId && session.role !== "admin") {
      return json(403, { error: "Not your order." });
    }
    stripeCustomerId = order.stripeCustomerId || null;
  } else {
    stripeCustomerId = await findStripeCustomerId(session.userId, getJSONFn, storeFn);
  }

  if (!stripeCustomerId) {
    return json(404, { error: "We don't have a billing record for you yet. That appears after your first payment." });
  }

  try {
    const portal = await (deps.createBillingPortalSession || createBillingPortalSession)({
      customerId: stripeCustomerId,
      returnUrl: `${siteOrigin(event)}/myaccount.html#dashboard`,
    });
    return json(200, { url: portal.url });
  } catch (err) {
    return json(502, { error: "Couldn't open billing just now. Call us on 804-309-0968 and we'll sort it." });
  }
};

module.exports.findStripeCustomerId = findStripeCustomerId;
