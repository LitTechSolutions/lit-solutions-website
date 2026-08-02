// stripe_api.js -- the small slice of Stripe's REST API this site needs.
//
// No SDK, deliberately. The codebase already talks to Resend with a plain
// fetch (see _lib/email.js) and Netlify bundles these functions per-deploy,
// so pulling in ~2MB of SDK to call three endpoints would be the odd choice
// here, not the safe one.
//
// The only genuinely fiddly part is that Stripe's API is form-encoded with
// bracketed nested keys (line_items[0][price_data][unit_amount]), so that
// encoding is done properly below rather than hand-rolled per call site.

const { requireSecretKey, resolveStripe } = require("./stripe_config");

const STRIPE_API = "https://api.stripe.com/v1";
// Keep direct REST calls deterministic. Without this header they inherit the
// account's default version, so an unrelated Dashboard upgrade can change the
// response shape underneath deployed code. Upgrade this deliberately, with
// the payment test matrix, rather than implicitly.
const STRIPE_API_VERSION = "2026-02-25.clover";

// Throws with the exact variable to fix, rather than a bare "not configured".
function assertKey() {
  return requireSecretKey();
}

/**
 * Encodes a nested object the way Stripe expects.
 * { a: { b: 1 }, c: [{ d: 2 }] } -> a[b]=1&c[0][d]=2
 */
function formEncode(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") formEncode(item, `${key}[${i}]`, out);
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") {
      formEncode(v, key, out);
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

async function stripeRequest(pathname, params, opts = {}) {
  const key = assertKey();
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Stripe-Version": STRIPE_API_VERSION,
  };
  // Idempotency matters most on session creation: a double-clicked checkout
  // must not produce two Stripe sessions for the same order.
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetch(`${STRIPE_API}${pathname}`, {
    method: opts.method || "POST",
    headers,
    body: params ? formEncode(params).join("&") : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body && body.error && body.error.message) || `Stripe returned ${res.status}`;
    const err = new Error(msg);
    err.stripeStatus = res.status;
    err.stripeCode = body && body.error && body.error.code;
    throw err;
  }
  return body;
}

/**
 * @param {{ mode: string, lineItems: object[], successUrl: string, cancelUrl: string,
 *           customerEmail?: string, metadata?: object, idempotencyKey?: string }} input
 */
async function createCheckoutSession(input) {
  const params = {
    mode: input.mode,
    line_items: input.lineItems,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Wallets (Apple Pay, Google Pay, Link) are enabled by Stripe
    // automatically for hosted Checkout when the device supports them --
    // there is nothing to switch on here, and nothing to build.
    // Discounts are calculated by this site's verified Heroes workflow.
    // Enabling Stripe promotion codes here would let a valid Dashboard code
    // stack a second discount after our server has priced the order.
    allow_promotion_codes: false,
    billing_address_collection: "auto",
    metadata: input.metadata || {},
    // Managed Payments is ON BY DEFAULT for new Stripe accounts, and it makes
    // Stripe the merchant of record: it collects and remits sales tax, and
    // charges 3.5% on top of normal processing fees.
    //
    // We turn it off, deliberately, because this business is not eligible for
    // it. Stripe restricts Managed Payments to DIGITAL products and names
    // "professional services (consulting, marketing, design, development,
    // tech support)" and "any service involving human intervention" as
    // ineligible -- which is nearly everything Little Technical Solutions
    // sells. Only the hosting component would qualify.
    // https://docs.stripe.com/payments/managed-payments/eligibility
    //
    // The tempting shortcut when Stripe rejects a session is to re-code a
    // website build as "Software" so the validator passes. Don't: that
    // misreports tax in the owner's name and makes Stripe merchant of record
    // for services it explicitly doesn't cover. Turning the feature off is
    // the honest fix, and it also saves the 3.5%.
    managed_payments: { enabled: input.managedPayments === true },
  };
  if (input.customerEmail) params.customer_email = input.customerEmail;
  // Metadata on the session is not copied onto the subscription, and the
  // subscription is what later webhooks reference -- so set it in both places
  // or a cancellation months from now arrives with nothing to match on.
  if (input.mode === "subscription") params.subscription_data = { metadata: input.metadata || {} };
  else params.payment_intent_data = { metadata: input.metadata || {} };

  return stripeRequest("/checkout/sessions", params, { idempotencyKey: input.idempotencyKey });
}

/** Hosted page where a customer updates their card, sees invoices, or cancels. */
async function createBillingPortalSession({ customerId, returnUrl }) {
  return stripeRequest("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
}

async function retrieveSession(sessionId) {
  return stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}`, null, { method: "GET" });
}

async function expireCheckoutSession(sessionId) {
  return stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {});
}

/* ------------------------------------------------------ setup helpers --- */
/* Used once, by stripe-setup.js, so the webhook endpoint doesn't have to be
 * hand-built in the dashboard with the right URL, the right event set and
 * the right test/live mode. Getting any of those wrong produces a silent
 * failure whose only symptom is an order stuck on "Waiting on payment". */

async function listWebhookEndpoints() {
  return stripeRequest("/webhook_endpoints?limit=100", null, { method: "GET" });
}

async function createWebhookEndpoint({ url, enabledEvents, description }) {
  return stripeRequest("/webhook_endpoints", {
    url,
    enabled_events: enabledEvents,
    api_version: STRIPE_API_VERSION,
    description: description || "Little Technical Solutions LLC website",
  });
}

async function deleteWebhookEndpoint(id) {
  return stripeRequest(`/webhook_endpoints/${encodeURIComponent(id)}`, null, { method: "DELETE" });
}

/**
 * Which Stripe mode is active, WITHOUT returning the key. Read from the
 * resolver so it reflects STRIPE_MODE and the slot that mode selects, not
 * just whichever variable happens to be populated.
 */
function keyMode(env) {
  const c = resolveStripe(env);
  if (!c.secretKey && c.actualKeyMode === "missing") return "missing";
  if (!c.ok) return c.actualKeyMode === "unknown" ? "unknown" : "mismatch";
  return c.mode;
}

module.exports = {
  createCheckoutSession, createBillingPortalSession, retrieveSession, expireCheckoutSession,
  listWebhookEndpoints, createWebhookEndpoint, deleteWebhookEndpoint, keyMode,
  stripeRequest, formEncode,
  STRIPE_API_VERSION,
};
