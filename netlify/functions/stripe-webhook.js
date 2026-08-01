// stripe-webhook.js -- Stripe tells us a payment landed, and the order
// fulfils itself.
//
// This is the piece Square could never give us. Stripe returns our own
// orderId in the session metadata, so there is no guessing which order was
// paid, no "I've completed both payments" button, and no manual linking
// queue. An order goes straight from awaiting_payment to paid and the
// project brief unlocks on its own.
//
// Signature verification reuses src/webhooks/webhookVerification.js
// unchanged. That module was written generically "for whichever provider
// integrates first", and Stripe's scheme -- HMAC-SHA256 over
// `${timestamp}.${payload}`, hex, 300-second tolerance -- is exactly what it
// implements. Confirmed against Stripe's own SDK (stripe@22, cjs/Webhooks.js
// makeHMACContent + NodeCryptoProvider.computeHMACSignature) rather than from
// memory. Unlike Square, Stripe signs a timestamp, so the replay window is
// real protection rather than something we have to approximate with
// event-id bookkeeping.
//
// Events handled:
//   checkout.session.completed        -> mark paid, unlock the brief
//   checkout.session.async_payment_succeeded -> same, for BNPL/delayed methods
//   checkout.session.async_payment_failed    -> back to awaiting, tell them
//   customer.subscription.deleted     -> record that billing stopped

const { json } = require("./_lib/auth_utils");
const { getJSON, setJSON } = require("./_lib/blob_store");
const { sendEmail } = require("./_lib/email");
const { verifyWebhookSignature } = require("../../src/webhooks/webhookVerification");
const { resolveStripe } = require("./_lib/stripe_config");

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "dylan@lit-solutions.tech";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function money(cents) {
  return `$${((cents || 0) / 100).toFixed(2).replace(/\.00$/, "")}`;
}

/** Stripe-Signature: t=1234567890,v1=abc...  (v0 is legacy and ignored) */
function parseSignatureHeader(header) {
  const out = { timestamp: null, signatures: [] };
  for (const part of String(header || "").split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") out.timestamp = parseInt(v, 10);
    else if (k === "v1") out.signatures.push(v);
  }
  return out;
}

function headerValue(headers, name) {
  if (!headers) return "";
  const direct = headers[name];
  if (typeof direct === "string") return direct;
  const found = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return found ? headers[found] : "";
}

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  // Resolved as a PAIR with the key: a live key verified against a test
  // signing secret 401s every delivery, and the only symptom is an order
  // stuck on "Waiting on payment" with no error anywhere a customer can see.
  const cfg = resolveStripe(deps.env || process.env);
  const secret = cfg.webhookSecret;
  if (!secret) {
    return json(500, { error: `Stripe webhook is not configured. Set ${cfg.secretVar} in Netlify and redeploy.` });
  }

  // Verify the exact bytes Stripe sent. Re-serialising the JSON would reorder
  // keys and break the signature.
  const rawBody = event.isBase64Encoded && typeof event.body === "string"
    ? Buffer.from(event.body, "base64").toString("utf8")
    : (typeof event.body === "string" ? event.body : "");

  const { timestamp, signatures } = parseSignatureHeader(headerValue(event.headers, "stripe-signature"));
  if (!timestamp || !signatures.length) return json(401, { error: "Invalid signature." });

  // Stripe may send several v1 signatures during a secret rotation; any one
  // matching is a pass.
  const verified = signatures.some((sig) =>
    (deps.verifyWebhookSignature || verifyWebhookSignature)(
      { payload: rawBody, timestamp, signature: sig, secret },
      { now: deps.now }
    ).valid
  );
  if (!verified) return json(401, { error: "Invalid signature." });

  let evt;
  try { evt = JSON.parse(rawBody); } catch { return json(400, { error: "Invalid payload." }); }

  const getJSONFn = deps.getJSON || getJSON;
  const setJSONFn = deps.setJSON || setJSON;
  const sendEmailFn = deps.sendEmail || sendEmail;
  const type = evt.type;
  const object = (evt.data && evt.data.object) || {};
  const metadata = object.metadata || {};

  async function loadOrder() {
    if (!metadata.orderId) return null;
    return getJSONFn("orders", metadata.orderId);
  }

  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    const order = await loadOrder();
    // An unmatched event is acknowledged, not retried -- Stripe would
    // otherwise redeliver forever for something we can never resolve.
    if (!order) return json(200, { ok: true, note: "no matching order" });

    // Delayed payment methods (some BNPL) complete the session before the
    // money is confirmed. Only `paid` means paid.
    if (type === "checkout.session.completed" && object.payment_status === "unpaid") {
      order.status = "payment_processing";
      await setJSONFn("orders", order.id, order);
      return json(200, { ok: true, status: order.status });
    }

    if (order.status === "paid" || order.status === "brief_submitted") {
      return json(200, { ok: true, duplicate: true });
    }

    order.status = "paid";
    order.paidAt = (deps.now ? deps.now() : new Date()).toISOString();
    order.stripePaymentStatus = object.payment_status || null;
    order.stripeCustomerId = object.customer || null;
    order.stripeSubscriptionId = object.subscription || null;
    order.amountPaidCents = object.amount_total != null ? object.amount_total : null;
    await setJSONFn("orders", order.id, order);

    const p = order.pricing || {};
    await sendEmailFn({
      to: ADMIN_EMAIL,
      subject: `Paid — ${money(order.amountPaidCents != null ? order.amountPaidCents : p.chargedTodayCents)} — ${esc(order.customerEmail || "unknown")}`,
      html:
        `<p><strong>${esc(order.customerEmail || "unknown")}</strong> has paid.</p>` +
        `<p>${(order.items || []).map((i) => `${esc(i.name)}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join("<br>")}</p>` +
        `<p>Charged today: <strong>${money(order.amountPaidCents != null ? order.amountPaidCents : p.chargedTodayCents)}</strong>` +
        (p.monthlyCents ? `<br>Then monthly: <strong>${money(p.monthlyCents)}</strong>` : "") +
        (p.balanceAtLaunchCents ? `<br>Balance due at launch: <strong>${money(p.balanceAtLaunchCents)}</strong>` : "") +
        (order.hero ? `<br>American Heroes Discount applied` : "") +
        `</p><p>Their project brief has unlocked automatically. Order ${esc(order.id)}.</p>`,
    });

    await sendEmailFn({
      to: order.customerEmail,
      subject: "Payment received — your project brief is ready",
      html:
        `<p>Thanks — that's gone through.</p>` +
        `<p>The last thing we need is your project brief. It's waiting in your account now, and it's what we build from.</p>` +
        `<p>We'll call you within one business day to talk it through.</p>`,
    });

    return json(200, { ok: true, status: "paid" });
  }

  if (type === "checkout.session.async_payment_failed") {
    const order = await loadOrder();
    if (!order) return json(200, { ok: true, note: "no matching order" });
    order.status = "awaiting_payment";
    order.lastPaymentFailedAt = (deps.now ? deps.now() : new Date()).toISOString();
    await setJSONFn("orders", order.id, order);
    await sendEmailFn({
      to: order.customerEmail,
      subject: "That payment didn't go through — Little Technical Solutions LLC",
      html: `<p>Your payment didn't complete, so nothing has been charged. You can try again from your account, ` +
        `or call us on 804-309-0968 and we'll sort it out.</p>`,
    });
    return json(200, { ok: true, status: "awaiting_payment" });
  }

  if (type === "customer.subscription.deleted") {
    const order = await loadOrder();
    if (!order) return json(200, { ok: true, note: "no matching order" });
    order.subscriptionEndedAt = (deps.now ? deps.now() : new Date()).toISOString();
    await setJSONFn("orders", order.id, order);
    await sendEmailFn({
      to: ADMIN_EMAIL,
      subject: `Subscription cancelled — ${esc(order.customerEmail || "unknown")}`,
      html: `<p>The subscription behind order ${esc(order.id)} has ended.</p>` +
        `<p>Per terms.html section 9.2, give written notice before anything goes offline.</p>`,
    });
    return json(200, { ok: true });
  }

  return json(200, { ok: true, handled: false, type });
};

module.exports.parseSignatureHeader = parseSignatureHeader;
