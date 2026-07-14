// F057 -- Integrations, Webhooks & API Connectivity. Generic HMAC-based
// webhook signature + replay-window verification, implementing
// SYS-SEC-007 ("Provider webhooks verify signatures, timestamp/replay
// constraints...") and SYS-API-008 ("Webhook handlers verify provider
// identity before acknowledging business success"). Provider-agnostic --
// this codebase has no webhook integration at all yet (confirmed Session
// 0), so this is the shared verification primitive any future provider
// integration (Square, email, etc.) should be built on rather than each
// hand-rolling its own signature check.

const crypto = require("node:crypto");

const DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutes -- standard webhook replay-window default (matches common provider conventions), not an owner-approved security policy, just a sane engineering default.

/**
 * @param {{ payload: string, timestamp: number, signature: string, secret: string }} input
 * @param {{ now?: () => Date, toleranceSeconds?: number }} [deps]
 * @returns {{ valid: boolean, reason: string }}
 */
function verifyWebhookSignature(input, deps = {}) {
  const now = deps.now || (() => new Date());
  const toleranceSeconds = deps.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  if (!input || typeof input.payload !== "string" || typeof input.signature !== "string" || typeof input.secret !== "string") {
    return { valid: false, reason: "malformed webhook verification input" };
  }
  if (typeof input.timestamp !== "number") {
    return { valid: false, reason: "missing or invalid timestamp" };
  }

  const nowSeconds = Math.floor(now().getTime() / 1000);
  const age = Math.abs(nowSeconds - input.timestamp);
  if (age > toleranceSeconds) {
    return { valid: false, reason: `timestamp outside the ${toleranceSeconds}-second replay window (age: ${age}s) -- possible replay attack` };
  }

  const expectedSignature = crypto.createHmac("sha256", input.secret).update(`${input.timestamp}.${input.payload}`).digest("hex");

  const providedBuffer = Buffer.from(input.signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  // timingSafeEqual throws on length mismatch rather than returning false --
  // handle that explicitly so a malformed/short signature doesn't crash
  // the caller instead of failing verification cleanly.
  if (providedBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: "signature length mismatch" };
  }
  const signatureMatches = crypto.timingSafeEqual(providedBuffer, expectedBuffer);

  return signatureMatches ? { valid: true, reason: "signature and timestamp verified" } : { valid: false, reason: "signature does not match" };
}

module.exports = { verifyWebhookSignature, DEFAULT_TOLERANCE_SECONDS };
