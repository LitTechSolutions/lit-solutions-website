const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { verifyAndLogWebhook, listRecentWebhookEvents } = require("./webhookEventStore");

const SECRET = "test-secret";
const NOW = () => new Date("2026-07-14T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW().getTime() / 1000);
const FIXED_ID = () => "webhook-event-fixed-id";

function sign(payload, timestamp, secret = SECRET) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

// Integration: logs whatever the pure webhookVerification.js decided,
// for both valid and invalid signatures -- the log is the point, not
// just the happy path.
test("integration: logs a successfully verified webhook", async () => {
  const sql = fakeSql();
  const payload = JSON.stringify({ event: "payment.completed" });
  const signature = sign(payload, NOW_SECONDS);
  const result = await verifyAndLogWebhook("square", { payload, timestamp: NOW_SECONDS, signature, secret: SECRET }, "payment.completed", { sql, now: NOW, idGenerator: FIXED_ID });

  assert.equal(result.valid, true);
  assert.match(sql.calls[0].text, /INSERT INTO webhook_events/);
  assert.ok(sql.calls[0].values.includes(true));
});

test("integration: logs a FAILED verification too, not just successes", async () => {
  const sql = fakeSql();
  const payload = JSON.stringify({ event: "payment.completed" });
  const badSignature = sign(payload, NOW_SECONDS, "wrong-secret");
  const result = await verifyAndLogWebhook("square", { payload, timestamp: NOW_SECONDS, signature: badSignature, secret: SECRET }, "payment.completed", { sql, now: NOW, idGenerator: FIXED_ID });

  assert.equal(result.valid, false);
  assert.equal(sql.calls.length, 1, "still logs even though verification failed");
  assert.ok(sql.calls[0].values.includes(false));
});

test("listRecentWebhookEvents filters by provider and bounds the result", async () => {
  const sql = fakeSql([{ id: "e1", provider: "square", received_at: "2026-07-14T00:00:00.000Z", verified: true, verification_reason: "signature and timestamp verified", event_type: "payment.completed" }]);
  const events = await listRecentWebhookEvents("square", { sql });
  assert.equal(events.length, 1);
  assert.match(sql.calls[0].text, /WHERE provider/);
  assert.match(sql.calls[0].text, /LIMIT/);
});
