const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/webhook-events");

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("webhook_events")) return byTable.events || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeDeps(role) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "admin-1", role, sessionId: "s1" } : null), readCookie: () => "fake-token" };
}

test("GET without provider returns 400", async () => {
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: {} }, {}, fakeDeps("admin"));
  assert.equal(res.statusCode, 400);
});

test("GET as admin lists recent webhook events", async () => {
  const sql = routingFakeSql({ events: [{ id: "we-1", provider: "square", received_at: "2026-07-15T00:00:00.000Z", verified: true, verification_reason: "ok", event_type: "payment.updated" }] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { provider: "square" } },
    {},
    { ...fakeDeps("admin"), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).events.length, 1);
});

test("GET as a non-admin is denied", async () => {
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { provider: "square" } }, {}, fakeDeps("customer"));
  assert.equal(res.statusCode, 403);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "POST" }, {}, {});
  assert.equal(res.statusCode, 405);
});
