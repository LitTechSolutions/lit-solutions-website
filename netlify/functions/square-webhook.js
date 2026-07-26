// square-webhook.js -- inbound endpoint for Square subscription events.
//
// This is the first real provider webhook in the codebase; webhookEventStore.js
// has been waiting for one since Session 0.
//
// Unusual properties compared to every other function here, all deliberate:
//
//   * No authentication. The signature IS the authentication -- Square has no
//     session and cannot present one. Nothing is trusted until
//     verifySquareWebhookSignature() passes.
//   * Reads the RAW body, never a re-serialised object. Square signs the exact
//     bytes it sent; JSON.parse -> JSON.stringify reorders keys and changes
//     whitespace, which breaks the signature. event.body is used verbatim and
//     only parsed after verification succeeds.
//   * Returns 200 for business problems (unknown subscription, illegal
//     transition, unmapped status). Square retries anything that isn't 2xx, so
//     returning an error for a permanently-unprocessable event just generates
//     retries forever. Genuine failures -- bad signature, misconfiguration,
//     database down -- do return non-2xx, because those SHOULD be retried or
//     alarmed on.
//
// Configuration (set in Netlify -> Site configuration -> Environment
// variables, never committed):
//   SQUARE_WEBHOOK_SIGNATURE_KEY -- from the Square developer dashboard
//   SQUARE_WEBHOOK_NOTIFICATION_URL -- the subscription's notification URL,
//     character-for-character as registered with Square. It is part of the
//     signed message, so a trailing-slash difference fails every signature.

const { json } = require("./_lib/auth_utils");
const { verifySquareWebhookSignature } = require("../../src/webhooks/squareWebhookVerification");
const {
  parseSquareEvent,
  hasProcessedEvent,
  recordEvent,
  applySubscriptionEvent,
} = require("../../src/db/squareSubscriptionLinkStore");

const SIGNATURE_HEADER = "x-square-hmacsha256-signature";

// Events we act on. Square sends plenty more; anything not listed is verified
// and logged, then acknowledged without action.
const HANDLED = new Set([
  "subscription.created",
  "subscription.updated",
]);

function headerValue(headers, name) {
  if (!headers) return "";
  // Netlify lowercases header names, but be defensive -- a case-sensitive
  // lookup silently failing would look exactly like a bad signature.
  const direct = headers[name];
  if (typeof direct === "string") return direct;
  const found = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return found ? headers[found] : "";
}

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const env = deps.env || process.env;
  const signatureKey = env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = env.SQUARE_WEBHOOK_NOTIFICATION_URL;

  // Misconfiguration is ours, not Square's. 500 so it retries once we fix it,
  // and so it shows up as an error rather than a silent no-op.
  if (!signatureKey || !notificationUrl) {
    return json(500, { error: "Square webhook is not configured." });
  }

  // Netlify base64-encodes the body for some content types. Decode before
  // verifying -- the signature covers the decoded bytes.
  const rawBody = event.isBase64Encoded && typeof event.body === "string"
    ? Buffer.from(event.body, "base64").toString("utf8")
    : (typeof event.body === "string" ? event.body : "");

  const signatureHeader = headerValue(event.headers, SIGNATURE_HEADER);
  const verification = verifySquareWebhookSignature({ rawBody, signatureHeader, signatureKey, notificationUrl });

  let parsedBody = null;
  try { parsedBody = JSON.parse(rawBody); } catch { parsedBody = null; }
  const { eventId, eventType, subscription } = parseSquareEvent(parsedBody);

  if (!verification.valid) {
    // Log the failure before rejecting -- an attacker probing the endpoint is
    // exactly what this trail exists to surface. Never echo the reason back.
    try {
      await recordEvent({ eventId, eventType, verified: false, reason: verification.reason }, deps);
    } catch { /* logging must not convert a rejection into a 500 */ }
    return json(401, { error: "Invalid signature." });
  }

  // Past this line the payload is trusted.

  if (!eventId) {
    // Verified but shapeless. Acknowledge so Square stops retrying; there is
    // nothing here to act on and no id to dedupe by.
    await recordEvent({ eventId: null, eventType, verified: true, reason: "verified; no event id" }, deps);
    return json(200, { ok: true, note: "no event id" });
  }

  // Square retries until it gets a 2xx and signs no timestamp, so event-id
  // deduplication is the only replay defence available.
  if (await hasProcessedEvent(eventId, deps)) {
    return json(200, { ok: true, duplicate: true });
  }

  const { recorded } = await recordEvent({ eventId, eventType, verified: true, reason: verification.reason }, deps);
  if (!recorded) {
    // Lost a race with a concurrent redelivery of the same event.
    return json(200, { ok: true, duplicate: true });
  }

  if (!HANDLED.has(eventType) || !subscription) {
    return json(200, { ok: true, handled: false, eventType });
  }

  const result = await applySubscriptionEvent({ subscription, eventType }, deps);
  return json(200, { ok: true, handled: true, eventType, result });
};
