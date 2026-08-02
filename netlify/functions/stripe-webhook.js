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
//   checkout.session.expired          -> retire an abandoned payment link
//   invoice.paid / payment_failed / payment_action_required -> sync renewals
//   customer.subscription.updated/deleted -> sync subscription lifecycle
//   charge.refunded / charge.dispute.created -> sync money returned or challenged

const { json } = require("./_lib/auth_utils");
const { getJSON, setJSON, store } = require("./_lib/blob_store");
const { sendEmail } = require("./_lib/email");
const { verifyWebhookSignature } = require("../../src/webhooks/webhookVerification");
const { resolveStripe } = require("./_lib/stripe_config");

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "dylan@lit-solutions.tech";
const EVENT_STORE = "stripe-events";

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

function refId(value) {
  if (!value) return null;
  return typeof value === "string" ? value : (value.id || null);
}

function subscriptionId(object) {
  return refId(object && object.subscription) ||
    refId(object && object.parent && object.parent.subscription_details && object.parent.subscription_details.subscription);
}

function paymentIntentId(object) {
  return refId(object && object.payment_intent);
}

async function findOrderForObject(object, getJSONFn, storeFn) {
  const metadata = (object && object.metadata) || {};
  if (metadata.orderId) {
    const direct = await getJSONFn("orders", metadata.orderId);
    if (direct) return direct;
  }

  const refs = {
    session: object && object.object === "checkout.session" ? object.id : null,
    subscription: subscriptionId(object),
    paymentIntent: paymentIntentId(object),
  };
  if (!refs.session && !refs.subscription && !refs.paymentIntent) return null;

  const listing = await storeFn("orders").list();
  for (const blob of (listing.blobs || [])) {
    const order = await getJSONFn("orders", blob.key);
    if (!order) continue;
    if (refs.session && order.stripeSessionId === refs.session) return order;
    if (refs.subscription && order.stripeSubscriptionId === refs.subscription) return order;
    if (refs.paymentIntent && (
      order.stripePaymentIntentId === refs.paymentIntent ||
      (Array.isArray(order.stripePaymentIntentIds) && order.stripePaymentIntentIds.includes(refs.paymentIntent))
    )) return order;
  }
  return null;
}

function expectedPaymentProblem(order, object, stripeMode) {
  const problems = [];
  if (order.stripeSessionId && object.id && order.stripeSessionId !== object.id) {
    problems.push("Stripe session does not match the checkout session stored on the order.");
  }
  if (!object.currency) {
    problems.push("Stripe did not report a currency.");
  } else if (String(object.currency).toLowerCase() !== "usd") {
    problems.push(`Expected USD but Stripe reported ${String(object.currency).toUpperCase()}.`);
  }
  const expected = order.pricing && order.pricing.chargedTodayCents;
  if (object.amount_total == null || !Number.isInteger(Number(object.amount_total))) {
    problems.push("Stripe did not report a valid paid total.");
  } else if (Number.isInteger(expected) && Number(object.amount_total) !== expected) {
    problems.push(`Expected ${money(expected)} but Stripe reported ${money(Number(object.amount_total))}.`);
  }
  if (typeof object.livemode === "boolean" && object.livemode !== (stripeMode === "live")) {
    problems.push(`Stripe reported ${object.livemode ? "live" : "test"} mode while the site is configured for ${stripeMode} mode.`);
  }
  return problems.length ? problems.join(" ") : null;
}

function rememberPaymentIntent(order, object) {
  const id = paymentIntentId(object);
  if (!id) return;
  order.stripePaymentIntentId = id;
  const ids = new Set(Array.isArray(order.stripePaymentIntentIds) ? order.stripePaymentIntentIds : []);
  ids.add(id);
  order.stripePaymentIntentIds = [...ids].slice(-24);
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
  const storeFn = deps.store || store;
  const sendEmailFn = deps.sendEmail || sendEmail;
  const type = evt.type;
  const object = (evt.data && evt.data.object) || {};
  const now = deps.now ? deps.now() : new Date();
  const nowIso = now.toISOString();

  if (evt.id) {
    const prior = await getJSONFn(EVENT_STORE, evt.id);
    if (prior && prior.completedAt) return json(200, { ok: true, duplicate: true });
  }

  async function finish(payload, statusCode = 200) {
    if (evt.id) {
      await setJSONFn(EVENT_STORE, evt.id, {
        id: evt.id,
        type,
        objectId: object.id || null,
        completedAt: nowIso,
      });
    }
    return json(statusCode, payload);
  }

  async function loadOrder() {
    return findOrderForObject(object, getJSONFn, storeFn);
  }

  async function save(order) {
    order.updatedAt = nowIso;
    await setJSONFn("orders", order.id, order);
  }

  async function notificationFailed(order, err) {
    order.lastPaymentNotificationError = String(err && (err.message || err) || "Email delivery failed").slice(0, 300);
    await save(order);
    // Stripe will retry the event. Order state is already safely stored, and
    // per-recipient sent flags below prevent a retry from duplicating mail
    // that did make it out before the failure.
    return json(500, { error: "Payment recorded, but notification delivery needs to be retried." });
  }

  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    const order = await loadOrder();
    // An unmatched event is acknowledged, not retried -- Stripe would
    // otherwise redeliver forever for something we can never resolve.
    if (!order) return finish({ ok: true, note: "no matching order" });

    // Delayed payment methods (some BNPL) complete the session before the
    // money is confirmed. Only `paid` means paid.
    if (type === "checkout.session.completed" && object.payment_status === "unpaid") {
      order.status = "payment_processing";
      await save(order);
      return finish({ ok: true, status: order.status });
    }

    const reviewReason = expectedPaymentProblem(order, object, cfg.mode);
    if (reviewReason) {
      order.status = "payment_review";
      order.paymentReviewReason = reviewReason;
      order.stripePaymentStatus = object.payment_status || null;
      order.amountPaidCents = object.amount_total != null ? Number(object.amount_total) : null;
      rememberPaymentIntent(order, object);
      await save(order);
      try {
        await sendEmailFn({
          to: ADMIN_EMAIL,
          subject: `Payment needs review — order ${esc(order.id)}`,
          html: `<p>Stripe reported a paid checkout, but it did not match the stored order.</p>` +
            `<p><strong>${esc(reviewReason)}</strong></p><p>The project brief remains locked. Review the order and Stripe payment before fulfilling anything.</p>`,
        });
      } catch (err) {
        console.error("[stripe-webhook] Could not send payment-review alert:", String(err && (err.message || err) || err));
      }
      return finish({ ok: true, status: "payment_review" });
    }

    if (order.status !== "paid" && order.status !== "brief_submitted") {
      order.status = "paid";
      order.paidAt = nowIso;
    }
    order.stripePaymentStatus = object.payment_status || null;
    order.stripeCustomerId = refId(object.customer) || order.stripeCustomerId || null;
    order.stripeSubscriptionId = subscriptionId(object) || order.stripeSubscriptionId || null;
    order.amountPaidCents = object.amount_total != null ? Number(object.amount_total) : order.amountPaidCents;
    rememberPaymentIntent(order, object);
    await save(order);

    const p = order.pricing || {};
    try {
      if (!order.adminPaymentEmailSentAt) {
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
        order.adminPaymentEmailSentAt = nowIso;
        await save(order);
      }
      if (!order.customerPaymentEmailSentAt) {
        await sendEmailFn({
          to: order.customerEmail,
          subject: "Payment received — your project brief is ready",
          html:
            `<p>Thanks — that's gone through.</p>` +
            `<p>The last thing we need is your project brief. It's waiting in your account now, and it's what we build from.</p>` +
            `<p>We'll call you within one business day to talk it through.</p>`,
        });
        order.customerPaymentEmailSentAt = nowIso;
        await save(order);
      }
    } catch (err) {
      return notificationFailed(order, err);
    }

    return finish({ ok: true, status: "paid" });
  }

  if (type === "checkout.session.async_payment_failed") {
    const order = await loadOrder();
    if (!order) return finish({ ok: true, note: "no matching order" });
    order.status = "awaiting_payment";
    order.lastPaymentFailedAt = nowIso;
    await save(order);
    try {
      if (order.lastAsyncFailureEmailEventId !== (evt.id || nowIso)) {
        await sendEmailFn({
          to: order.customerEmail,
          subject: "That payment didn't go through — Little Technical Solutions LLC",
          html: `<p>Your payment didn't complete, so nothing has been charged. You can try again from your account, ` +
            `or call us on 804-309-0968 and we'll sort it out.</p>`,
        });
        order.lastAsyncFailureEmailEventId = evt.id || nowIso;
        await save(order);
      }
    } catch (err) {
      return notificationFailed(order, err);
    }
    return finish({ ok: true, status: "awaiting_payment" });
  }

  if (type === "checkout.session.expired") {
    const order = await loadOrder();
    if (!order) return finish({ ok: true, note: "no matching order" });
    if (order.status === "awaiting_payment" || order.status === "checkout_failed") {
      order.status = "awaiting_payment";
      order.stripeSessionExpiredAt = nowIso;
      await save(order);
    }
    return finish({ ok: true, status: order.status });
  }

  if (type === "invoice.paid") {
    const order = await loadOrder();
    if (!order) return finish({ ok: true, note: "no matching order" });
    order.subscriptionStatus = "active";
    order.lastSubscriptionPaymentAt = nowIso;
    order.lastStripeInvoiceId = object.id || null;
    order.lastSubscriptionAmountPaidCents = object.amount_paid != null ? Number(object.amount_paid) : null;
    order.stripeSubscriptionId = subscriptionId(object) || order.stripeSubscriptionId || null;
    rememberPaymentIntent(order, object);
    await save(order);
    return finish({ ok: true, status: "active" });
  }

  if (type === "invoice.payment_failed" || type === "invoice.payment_action_required") {
    const order = await loadOrder();
    if (!order) return finish({ ok: true, note: "no matching order" });
    const actionRequired = type === "invoice.payment_action_required";
    order.subscriptionStatus = actionRequired ? "action_required" : "past_due";
    order.lastStripeInvoiceId = object.id || null;
    order.lastSubscriptionPaymentProblemAt = nowIso;
    order.stripeSubscriptionId = subscriptionId(object) || order.stripeSubscriptionId || null;
    rememberPaymentIntent(order, object);
    await save(order);
    try {
      if (order.lastSubscriptionProblemEmailEventId !== (evt.id || nowIso)) {
        await sendEmailFn({
          to: order.customerEmail,
          subject: actionRequired ? "Action needed for your website subscription payment" : "Your website subscription payment needs attention",
          html: actionRequired
            ? `<p>Your bank needs one more confirmation before your subscription payment can finish.</p><p>Sign in to your account to open Stripe billing and complete it, or call 804-309-0968.</p>`
            : `<p>Your latest website subscription payment did not go through.</p><p>Sign in to your account to update your payment method, or call 804-309-0968. We will contact you in writing before any service changes.</p>`,
        });
        await sendEmailFn({
          to: ADMIN_EMAIL,
          subject: `${actionRequired ? "Subscription payment needs authentication" : "Subscription payment failed"} — ${esc(order.customerEmail || "unknown")}`,
          html: `<p>Order ${esc(order.id)} needs billing follow-up.</p><p>No site should be taken offline without the written notice promised in the terms.</p>`,
        });
        order.lastSubscriptionProblemEmailEventId = evt.id || nowIso;
        await save(order);
      }
    } catch (err) {
      return notificationFailed(order, err);
    }
    return finish({ ok: true, status: order.subscriptionStatus });
  }

  if (type === "customer.subscription.updated") {
    const order = await loadOrder();
    if (!order) return finish({ ok: true, note: "no matching order" });
    order.stripeSubscriptionId = refId(object.id) || order.stripeSubscriptionId || null;
    order.subscriptionStatus = object.status || order.subscriptionStatus || null;
    order.subscriptionCurrentPeriodEnd = object.current_period_end
      ? new Date(Number(object.current_period_end) * 1000).toISOString()
      : order.subscriptionCurrentPeriodEnd || null;
    await save(order);
    return finish({ ok: true, status: order.subscriptionStatus });
  }

  if (type === "customer.subscription.deleted") {
    const order = await loadOrder();
    if (!order) return finish({ ok: true, note: "no matching order" });
    order.subscriptionStatus = "canceled";
    order.subscriptionEndedAt = nowIso;
    await save(order);
    try {
      if (!order.subscriptionCancellationEmailSentAt) {
        await sendEmailFn({
          to: ADMIN_EMAIL,
          subject: `Subscription cancelled — ${esc(order.customerEmail || "unknown")}`,
          html: `<p>The subscription behind order ${esc(order.id)} has ended.</p>` +
            `<p>Per terms.html section 9.2, give written notice before anything goes offline.</p>`,
        });
        order.subscriptionCancellationEmailSentAt = nowIso;
        await save(order);
      }
    } catch (err) {
      return notificationFailed(order, err);
    }
    return finish({ ok: true });
  }

  if (type === "charge.refunded") {
    const order = await loadOrder();
    if (!order) return finish({ ok: true, note: "no matching order" });
    order.refundStatus = object.refunded ? "full" : "partial";
    order.amountRefundedCents = object.amount_refunded != null ? Number(object.amount_refunded) : null;
    order.lastRefundAt = nowIso;
    await save(order);
    try {
      if (order.lastRefundEmailEventId !== (evt.id || nowIso)) {
        await sendEmailFn({
          to: ADMIN_EMAIL,
          subject: `Refund recorded — ${esc(order.customerEmail || "unknown")}`,
          html: `<p>Stripe recorded a ${esc(order.refundStatus)} refund of ${money(order.amountRefundedCents)} for order ${esc(order.id)}.</p>`,
        });
        order.lastRefundEmailEventId = evt.id || nowIso;
        await save(order);
      }
    } catch (err) {
      return notificationFailed(order, err);
    }
    return finish({ ok: true, refundStatus: order.refundStatus });
  }

  if (type === "charge.dispute.created") {
    const order = await loadOrder();
    if (!order) return finish({ ok: true, note: "no matching order" });
    order.paymentDisputeStatus = "open";
    order.paymentDisputeId = object.id || null;
    order.paymentDisputeReason = object.reason || null;
    order.paymentDisputeAmountCents = object.amount != null ? Number(object.amount) : null;
    order.paymentDisputeOpenedAt = nowIso;
    await save(order);
    try {
      if (order.lastDisputeEmailEventId !== (evt.id || nowIso)) {
        await sendEmailFn({
          to: ADMIN_EMAIL,
          subject: `Urgent: payment dispute opened — ${esc(order.customerEmail || "unknown")}`,
          html: `<p>Stripe reported a dispute for ${money(order.paymentDisputeAmountCents)} on order ${esc(order.id)}.</p>` +
            `<p>Reason: ${esc(order.paymentDisputeReason || "not supplied")}. Review it in Stripe promptly and preserve the signed scope, messages, and delivery records.</p>`,
        });
        order.lastDisputeEmailEventId = evt.id || nowIso;
        await save(order);
      }
    } catch (err) {
      return notificationFailed(order, err);
    }
    return finish({ ok: true, disputeStatus: "open" });
  }

  return finish({ ok: true, handled: false, type });
};

module.exports.parseSignatureHeader = parseSignatureHeader;
module.exports.findOrderForObject = findOrderForObject;
module.exports.expectedPaymentProblem = expectedPaymentProblem;
