// Square-specific webhook signature verification.
//
// The generic src/webhooks/webhookVerification.js does NOT fit Square. It
// implements the Stripe-shaped scheme -- HMAC over "<timestamp>.<payload>",
// hex-encoded, with a replay window derived from a signed timestamp. Square
// signs something different:
//
//   signature = base64( HMAC-SHA256( key = signatureKey,
//                                    message = notificationUrl + rawBody ) )
//
// carried in the `x-square-hmacsha256-signature` header, with **no timestamp
// in the signed material at all**. Verified against Square's own SDK
// reference implementation (square@45 wrapper/WebhooksHelper.js), which does
// exactly `notificationUrl + requestBody` -> base64.
//
// Two consequences worth being explicit about:
//
//   1. The notification URL is part of the signed message, so it has to match
//      what is registered in the Square dashboard *exactly* -- scheme, host,
//      path, trailing slash. A signature that fails for no obvious reason is
//      almost always this.
//   2. Because nothing timestamped is signed, signature checking alone cannot
//      stop a replay. Replay defence for Square has to come from event-id
//      idempotency instead -- see src/db/squareSubscriptionLinkStore.js and
//      the unique (provider, provider_event_id) index in migration 007.
//
// Square's own SDK compares with `===`. We use timingSafeEqual instead, which
// is what their documentation actually recommends.

const crypto = require("node:crypto");

/**
 * @param {{ rawBody: string, signatureHeader: string, signatureKey: string, notificationUrl: string }} input
 * @returns {{ valid: boolean, reason: string }}
 */
function verifySquareWebhookSignature(input) {
  if (
    !input ||
    typeof input.rawBody !== "string" ||
    typeof input.signatureHeader !== "string" ||
    typeof input.signatureKey !== "string" ||
    typeof input.notificationUrl !== "string"
  ) {
    return { valid: false, reason: "malformed Square webhook verification input" };
  }
  if (input.signatureKey.length === 0) {
    return { valid: false, reason: "signature key is not configured" };
  }
  if (input.notificationUrl.length === 0) {
    return { valid: false, reason: "notification URL is not configured" };
  }
  if (input.signatureHeader.length === 0) {
    return { valid: false, reason: "missing x-square-hmacsha256-signature header" };
  }

  const expected = crypto
    .createHmac("sha256", input.signatureKey)
    .update(input.notificationUrl + input.rawBody, "utf8")
    .digest("base64");

  const provided = Buffer.from(input.signatureHeader, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  // timingSafeEqual throws on a length mismatch rather than returning false,
  // so a truncated or junk header would crash the handler instead of simply
  // failing verification.
  if (provided.length !== expectedBuf.length) {
    return { valid: false, reason: "signature length mismatch" };
  }
  if (!crypto.timingSafeEqual(provided, expectedBuf)) {
    return { valid: false, reason: "signature does not match" };
  }
  return { valid: true, reason: "Square signature verified" };
}

/**
 * Builds the exact signature Square would send. Test/diagnostic helper --
 * having this alongside the verifier is what makes it possible to prove the
 * verifier accepts a genuine Square signature rather than only rejecting
 * bad ones.
 *
 * @param {{ rawBody: string, signatureKey: string, notificationUrl: string }} input
 * @returns {string}
 */
function signSquareWebhookPayload(input) {
  return crypto
    .createHmac("sha256", input.signatureKey)
    .update(input.notificationUrl + input.rawBody, "utf8")
    .digest("base64");
}

module.exports = { verifySquareWebhookSignature, signSquareWebhookPayload };
