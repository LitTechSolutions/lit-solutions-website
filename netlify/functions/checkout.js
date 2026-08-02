// checkout.js -- turns a cart into a Stripe Checkout Session.
//
// GET  /checkout?items=key:qty,key:qty   price a cart (what the cart page shows)
// POST /checkout {items, payInFull}      create the session and return its URL
//
// Everything about money is decided here, from the server catalog and the
// account's own hero status. The cart in localStorage supplies product KEYS
// and quantities and nothing else -- editing it can change what someone sees
// on the cart page, never what Stripe charges.
//
// Wallets: Apple Pay, Google Pay and Link appear automatically on hosted
// Checkout when the device supports them. There is nothing to enable here.
//
// Buy now, pay later: Klarna/Affirm/Afterpay are offered only when the cart
// is entirely one-time, because Stripe does not support BNPL in subscription
// mode. That restriction happens to match our own policy -- BNPL pays us in
// full immediately and the customer repays the provider, so there is no
// deposit to split and the cart is charged 100%.

const crypto = require("node:crypto");
const { readCookie, getSession, json, rateLimited } = require("./_lib/auth_utils");
const { getJSON, setJSON } = require("./_lib/blob_store");
const { getProduct } = require("./_lib/product_catalog");
const { priceCart, toStripeLineItems, bnplAvailable } = require("./_lib/pricing");
const { isVerifiedHero } = require("./hero-status");
const { findUserById } = require("./_lib/users");
const { createCheckoutSession } = require("./_lib/stripe_api");

const MAX_LINES = 12;

function siteOrigin(event) {
  const host = (event.headers && (event.headers["x-forwarded-host"] || event.headers.host)) || "lit-solutions.tech";
  const proto = (event.headers && event.headers["x-forwarded-proto"]) || "https";
  return `${proto}://${host}`;
}

/** "plan-premium:1,svc-mfa:2" -> validated [{product, quantity}] */
function parseItems(raw) {
  const out = [];
  const seen = new Set();
  const parts = String(raw || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_LINES);
  for (const part of parts) {
    const [key, qtyRaw] = part.split(":");
    const product = getProduct(key);
    if (!product) continue;                 // unknown keys are dropped, not errors
    if (seen.has(product.key)) continue;    // one line per product
    seen.add(product.key);
    const quantity = Math.max(1, Math.min(20, parseInt(qtyRaw, 10) || 1));
    out.push({ product, quantity });
  }
  return out;
}

function itemsFromBody(body) {
  if (Array.isArray(body.items)) {
    return parseItems(body.items.map((i) =>
      typeof i === "string" ? i : `${i && i.key}:${(i && i.quantity) || 1}`).join(","));
  }
  return parseItems(body.items);
}

exports.handler = async (event, context, deps = {}) => {
  const readCookieFn = deps.readCookie || readCookie;
  const getSessionFn = deps.getSession || getSession;
  const getJSONFn = deps.getJSON || getJSON;
  const setJSONFn = deps.setJSON || setJSON;

  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  // Resolved BY ID. A session record is {userId, role, expiresAt} and carries
  // no address, so keying the users store off it produced an empty key --
  // which Netlify Blobs turned into a 25-second hang. See _lib/users.js.
  const user = await (deps.findUserById || findUserById)(session.userId);
  const hero = isVerifiedHero(user);
  const customerEmail = (user && user.email) || null;

  /* ------------------------------------------------------------ pricing -- */
  if (event.httpMethod === "GET") {
    const items = parseItems(event.queryStringParameters && event.queryStringParameters.items);
    if (!items.length) return json(200, { empty: true, hero });
    const payInFull = !!(event.queryStringParameters && event.queryStringParameters.payInFull === "true");
    const priced = priceCart(items, { hero, payInFull });
    return json(200, {
      hero,
      priced,
      bnplAvailable: bnplAvailable(items, priceCart(items, { hero, payInFull: true })),
      canPayInFull: items.some(({ product }) => product.kind === "package"),
    });
  }

  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  if (await rateLimited("checkout-create", session.userId, 20, 3600)) {
    return json(429, { error: "Too many checkout attempts. Try again shortly." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }

  /* ------------------------------------------------------------- resume -- */
  // Closing the Stripe tab is the single most common way a checkout dies.
  // The order already exists and already holds the cart, so reopening a
  // session for it is a button, not a re-shop -- and crucially it reuses the
  // SAME order id rather than minting a second order for one purchase.
  let existingOrder = null;
  if (body.orderId) {
    existingOrder = await getJSONFn("orders", String(body.orderId));
    if (!existingOrder) return json(404, { error: "Order not found." });
    if (existingOrder.customerId !== session.userId) return json(403, { error: "Not your order." });
    if (existingOrder.status !== "awaiting_payment" && existingOrder.status !== "checkout_failed") {
      return json(409, { error: "That order isn't waiting on payment." });
    }
  }

  const items = existingOrder
    ? parseItems((existingOrder.items || []).map((i) => `${i.key}:${i.quantity || 1}`).join(","))
    : itemsFromBody(body);
  if (!items.length) return json(400, { error: "Your cart is empty." });

  const payInFull = existingOrder ? !!existingOrder.payInFull : !!body.payInFull;
  const priced = priceCart(items, { hero, payInFull });
  if (priced.chargedTodayCents <= 0) return json(400, { error: "Nothing to charge." });

  // Asking for BNPL on a cart that can't take it is a client bug, not a
  // customer error -- fail loudly rather than silently charging on a card.
  // The split check comes first so a half-payment request gets the accurate
  // reason rather than a vague "not available for this cart".
  if (body.useBnpl) {
    if (!payInFull) {
      return json(400, { error: "Buy now, pay later requires paying the full amount." });
    }
    // Eligibility is judged against the pay-in-full amount, which is what a
    // BNPL provider would actually be asked to settle -- judging it against a
    // 50% deposit could pass a cart the provider then rejects on Stripe's own
    // page, and a rejection there reads as "declined" to a customer.
    if (!bnplAvailable(items, priceCart(items, { hero, payInFull: true }))) {
      return json(400, { error: "Buy now, pay later isn't available for this cart." });
    }
  }

  // The order is created BEFORE the session, so its id can ride along in the
  // metadata. That is the whole point of moving to Stripe: the webhook comes
  // back knowing exactly which order was paid, with no guessing and no
  // "did you pay?" button.
  const orderId = existingOrder ? existingOrder.id : (deps.idGenerator || (() => crypto.randomUUID()))();
  const now = (deps.now ? deps.now() : new Date()).toISOString();
  const order = Object.assign({}, existingOrder, {
    id: orderId,
    customerId: session.userId,
    customerEmail,
    items: items.map(({ product, quantity }) => ({ key: product.key, name: product.name, quantity })),
    // Re-priced on every attempt, so a hero verified between abandoning a
    // checkout and resuming it gets their discount without re-adding anything.
    pricing: priced,
    hero,
    payInFull,
    status: "awaiting_payment",
    provider: "stripe",
    createdAt: existingOrder ? existingOrder.createdAt : now,
    updatedAt: now,
  });
  await setJSONFn("orders", orderId, order);

  const origin = siteOrigin(event);
  const mode = priced.hasRecurring ? "subscription" : "payment";
  const lineItems = toStripeLineItems(priced);

  // Keyed on the order AND on what is being charged. A double-click sends
  // identical content and gets the same session back; a resume that re-priced
  // (say the customer's hero status was verified in between) hashes
  // differently and correctly gets a new one. Stripe expires idempotency keys
  // after 24h, which is also when a session expires, so a stale key can't
  // hand back a dead session.
  const contentHash = crypto.createHash("sha256")
    .update(JSON.stringify({ mode, lineItems })).digest("hex").slice(0, 16);

  const params = {
    mode,
    lineItems,
    successUrl: `${origin}/myaccount.html?checkout=success&order=${encodeURIComponent(orderId)}#dashboard`,
    cancelUrl: `${origin}/cart.html?checkout=cancelled`,
    customerEmail: customerEmail || undefined,
    metadata: { orderId, customerId: session.userId, hero: String(hero), payInFull: String(payInFull) },
    idempotencyKey: `order-${orderId}-${contentHash}`,
  };

  try {
    const stripeSession = await (deps.createCheckoutSession || createCheckoutSession)(params);
    order.stripeSessionId = stripeSession.id;
    await setJSONFn("orders", orderId, order);
    return json(200, { url: stripeSession.url, orderId });
  } catch (err) {
    // Leave a breadcrumb on the order so a failed checkout is diagnosable
    // rather than an order that silently never got paid.
    // NOT truncated for the admin path: Stripe's most useful errors put the
    // remedy in the final sentence, and a 300-character cap silently ate the
    // one that said how to fix this.
    const full = String(err.message || err);
    const reason = full.slice(0, 300);
    // Netlify function logs are the only record when nobody is watching a
    // browser, and "couldn't start checkout" is useless without the cause.
    console.error("[checkout] Stripe rejected the session:", reason,
      err.stripeCode ? `(code ${err.stripeCode})` : "", err.stripeStatus ? `(http ${err.stripeStatus})` : "");
    order.status = "checkout_failed";
    order.checkoutError = reason;
    await setJSONFn("orders", orderId, order);

    // A customer gets a sentence they can act on. An admin testing the setup
    // gets the actual cause -- "Couldn't start checkout" is a maddening thing
    // to stare at when the real answer is that an env var was never set.
    const body = { error: "Couldn't start checkout. Please try again, or call us on 804-309-0968." };
    if (session.role === "admin") {
      body.adminDetail = full.slice(0, 2000);
      body.adminStripeCode = err.stripeCode || null;
      body.adminStripeStatus = err.stripeStatus || null;
      if (/STRIPE_SECRET_KEY/.test(reason)) {
        body.adminHint = "Set STRIPE_SECRET_KEY in Netlify (Site configuration -> Environment variables), " +
          "then trigger a redeploy -- Netlify needs one to pick up a newly added variable. " +
          "See docs/development/STRIPE_SETUP.md.";
      }
    }
    return json(502, body);
  }
};

module.exports.parseItems = parseItems;
