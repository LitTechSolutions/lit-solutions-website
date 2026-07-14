const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifyWebhookSignature, DEFAULT_TOLERANCE_SECONDS } = require("./webhookVerification");

const SECRET = "test-webhook-secret";
const NOW = () => new Date("2026-07-14T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW().getTime() / 1000);

function sign(payload, timestamp, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

test("accepts a correctly signed, fresh webhook", () => {
  const payload = JSON.stringify({ event: "payment.completed" });
  const signature = sign(payload, NOW_SECONDS);
  const result = verifyWebhookSignature({ payload, timestamp: NOW_SECONDS, signature, secret: SECRET }, { now: NOW });
  assert.equal(result.valid, true);
});

test("rejects a signature computed with the wrong secret", () => {
  const payload = JSON.stringify({ event: "payment.completed" });
  const signature = sign(payload, NOW_SECONDS, "wrong-secret");
  const result = verifyWebhookSignature({ payload, timestamp: NOW_SECONDS, signature, secret: SECRET }, { now: NOW });
  assert.equal(result.valid, false);
  assert.match(result.reason, /does not match/);
});

test("rejects a tampered payload even with a correctly-formed signature for the original payload", () => {
  const originalPayload = JSON.stringify({ event: "payment.completed", amount: 100 });
  const signature = sign(originalPayload, NOW_SECONDS);
  const tamperedPayload = JSON.stringify({ event: "payment.completed", amount: 100000 });
  const result = verifyWebhookSignature({ payload: tamperedPayload, timestamp: NOW_SECONDS, signature, secret: SECRET }, { now: NOW });
  assert.equal(result.valid, false);
});

test("rejects a timestamp outside the replay window (replay attack)", () => {
  const payload = JSON.stringify({ event: "x" });
  const staleTimestamp = NOW_SECONDS - DEFAULT_TOLERANCE_SECONDS - 100;
  const signature = sign(payload, staleTimestamp);
  const result = verifyWebhookSignature({ payload, timestamp: staleTimestamp, signature, secret: SECRET }, { now: NOW });
  assert.equal(result.valid, false);
  assert.match(result.reason, /replay window/);
});

test("accepts a timestamp within a custom (tighter) tolerance window", () => {
  const payload = JSON.stringify({ event: "x" });
  const timestamp = NOW_SECONDS - 30;
  const signature = sign(payload, timestamp);
  const withinWide = verifyWebhookSignature({ payload, timestamp, signature, secret: SECRET }, { now: NOW, toleranceSeconds: 60 });
  const outsideTight = verifyWebhookSignature({ payload, timestamp, signature, secret: SECRET }, { now: NOW, toleranceSeconds: 10 });
  assert.equal(withinWide.valid, true);
  assert.equal(outsideTight.valid, false);
});

test("handles a malformed/short signature without crashing", () => {
  const result = verifyWebhookSignature({ payload: "x", timestamp: NOW_SECONDS, signature: "not-hex-and-too-short", secret: SECRET }, { now: NOW });
  assert.equal(result.valid, false);
});

test("rejects malformed input gracefully", () => {
  assert.equal(verifyWebhookSignature(null).valid, false);
  assert.equal(verifyWebhookSignature({}).valid, false);
});
