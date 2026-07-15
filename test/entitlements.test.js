const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/entitlements");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
const FIXED_ID = () => "usage-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("entitlement_limits")) return byTable.limits || [];
    if (text.includes("usage_records")) return byTable.usage || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeDeps(role) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "admin-1", role, sessionId: "s1" } : null), readCookie: () => "fake-token" };
}
function fakeCustomerDeps(authContext) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "user-1", sessionId: "s1" } : null), readCookie: () => "fake-token", resolveAuthorizationContext: async () => authContext };
}

test("POST as admin records usage within the limit", async () => {
  let call = 0;
  const sql = routingFakeSql({});
  sql.callCount = () => call;
  const tag = async (strings, ...values) => {
    call += 1;
    const text = strings.join("?");
    if (call === 1) return [{ plan_key: "website_care", usage_key: "monthly_edit_minutes", limit_value: 30, reset_period: "monthly" }];
    if (call === 2) return [];
    if (call === 3) return [];
    return [];
  };
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", planKey: "website_care", usageKey: "monthly_edit_minutes", amount: 10 }) },
    {},
    { ...fakeDeps("admin"), sql: tag, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).recorded, true);
});

test("POST as a non-admin is denied", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", planKey: "website_care", usageKey: "x", amount: 5 }) },
    {},
    fakeDeps("customer")
  );
  assert.equal(res.statusCode, 403);
});

test("GET as org_owner views usage vs. limit", async () => {
  const sql = routingFakeSql({ limits: [{ plan_key: "website_care", usage_key: "monthly_edit_minutes", limit_value: 30, reset_period: "monthly" }], usage: [{ consumed: 10 }] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", planKey: "website_care", usageKey: "monthly_edit_minutes" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.consumed, 10);
  assert.equal(body.remaining, 20);
});

test("GET for an unconfigured plan/usage pair returns 404", async () => {
  const sql = routingFakeSql({ limits: [] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", planKey: "x", usageKey: "y" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 404);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
