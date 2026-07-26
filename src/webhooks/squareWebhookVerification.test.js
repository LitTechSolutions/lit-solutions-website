const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifySquareWebhookSignature, signSquareWebhookPayload } = require("./squareWebhookVerification");

const KEY = "test-square-signature-key";
const URL = "https://lit-solutions.tech/.netlify/functions/square-webhook";
const BODY = JSON.stringify({
  merchant_id: "MLK42A4B9BC1X",
  type: "subscription.updated",
  event_id: "11111111-2222-3333-4444-555555555555",
  data: { object: { subscription: { id: "sub_abc", status: "ACTIVE" } } },
});

test("accepts a signature generated the way Square generates one", () => {
  const signatureHeader = signSquareWebhookPayload({ rawBody: BODY, signatureKey: KEY, notificationUrl: URL });
  const result = verifySquareWebhookSignature({ rawBody: BODY, signatureHeader, signatureKey: KEY, notificationUrl: URL });
  assert.equal(result.valid, true, result.reason);
});

test("matches Square's documented algorithm exactly: base64(hmac-sha256(url + body))", () => {
  // Pinned against the reference implementation in Square's own Node SDK
  // (square@45 wrapper/WebhooksHelper.js): `notificationUrl + requestBody`,
  // base64. If this ever fails, the algorithm drifted -- do not "fix" it by
  // changing the expectation without re-reading the SDK.
  const expected = crypto.createHmac("sha256", KEY).update(URL + BODY, "utf8").digest("base64");
  assert.equal(signSquareWebhookPayload({ rawBody: BODY, signatureKey: KEY, notificationUrl: URL }), expected);
  assert.match(expected, /^[A-Za-z0-9+/]+=*$/, "digest should be base64, not hex");
});

test("rejects a signature made with the wrong signature key", () => {
  const signatureHeader = signSquareWebhookPayload({ rawBody: BODY, signatureKey: "wrong-key", notificationUrl: URL });
  const result = verifySquareWebhookSignature({ rawBody: BODY, signatureHeader, signatureKey: KEY, notificationUrl: URL });
  assert.equal(result.valid, false);
  assert.match(result.reason, /does not match/);
});

test("rejects a tampered body even when the signature is well-formed for the original", () => {
  const signatureHeader = signSquareWebhookPayload({ rawBody: BODY, signatureKey: KEY, notificationUrl: URL });
  const tampered = BODY.replace('"ACTIVE"', '"CANCELED"');
  assert.notEqual(tampered, BODY);
  const result = verifySquareWebhookSignature({ rawBody: tampered, signatureHeader, signatureKey: KEY, notificationUrl: URL });
  assert.equal(result.valid, false);
});

test("rejects when the notification URL differs from the one registered with Square", () => {
  // The URL is part of the signed message, so a mismatch here is the single
  // most common cause of 'valid webhook, failing signature'.
  const signatureHeader = signSquareWebhookPayload({ rawBody: BODY, signatureKey: KEY, notificationUrl: URL });
  const result = verifySquareWebhookSignature({
    rawBody: BODY,
    signatureHeader,
    signatureKey: KEY,
    notificationUrl: URL + "/",
  });
  assert.equal(result.valid, false);
});

test("rejects a truncated signature header without throwing", () => {
  const signatureHeader = signSquareWebhookPayload({ rawBody: BODY, signatureKey: KEY, notificationUrl: URL }).slice(0, 10);
  const result = verifySquareWebhookSignature({ rawBody: BODY, signatureHeader, signatureKey: KEY, notificationUrl: URL });
  assert.equal(result.valid, false);
  assert.match(result.reason, /length mismatch/);
});

test("rejects an empty or missing signature header", () => {
  for (const signatureHeader of ["", undefined, null]) {
    const result = verifySquareWebhookSignature({ rawBody: BODY, signatureHeader, signatureKey: KEY, notificationUrl: URL });
    assert.equal(result.valid, false, `expected rejection for header ${JSON.stringify(signatureHeader)}`);
  }
});

test("refuses to verify when the signature key is not configured", () => {
  const result = verifySquareWebhookSignature({ rawBody: BODY, signatureHeader: "x", signatureKey: "", notificationUrl: URL });
  assert.equal(result.valid, false);
  assert.match(result.reason, /signature key is not configured/);
});

test("refuses to verify when the notification URL is not configured", () => {
  const result = verifySquareWebhookSignature({ rawBody: BODY, signatureHeader: "x", signatureKey: KEY, notificationUrl: "" });
  assert.equal(result.valid, false);
  assert.match(result.reason, /notification URL is not configured/);
});

test("an empty body still verifies if that is genuinely what was signed", () => {
  const signatureHeader = signSquareWebhookPayload({ rawBody: "", signatureKey: KEY, notificationUrl: URL });
  const result = verifySquareWebhookSignature({ rawBody: "", signatureHeader, signatureKey: KEY, notificationUrl: URL });
  assert.equal(result.valid, true, result.reason);
});
