const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./metrics");

function routingFakeSql() {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeDeps(role) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "admin-1", role, sessionId: "s1" } : null), readCookie: () => "fake-token" };
}

test("GET without from/to returns 400", async () => {
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: {} }, {}, fakeDeps("admin"));
  assert.equal(res.statusCode, 400);
});

test("GET as admin returns the aggregated summary", async () => {
  const sql = routingFakeSql();
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { from: "2026-07-01", to: "2026-07-31" } },
    {},
    { ...fakeDeps("admin"), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body).summary, { byType: {}, byDay: {} });
});

test("GET as a technician (not admin) is denied -- metrics.view is platform_admin only", async () => {
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { from: "2026-07-01", to: "2026-07-31" } }, {}, fakeDeps("staff"));
  assert.equal(res.statusCode, 403);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "POST" }, {}, {});
  assert.equal(res.statusCode, 405);
});
