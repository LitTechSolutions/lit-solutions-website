const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./subscriptions");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
const FIXED_ID = () => "sub-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("subscriptions")) return byTable.subs || [];
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

function subRow(overrides = {}) {
  return { id: "sub-1", organization_id: "org-a", plan_key: "website_care", status: "active", started_at: "2026-07-01T00:00:00.000Z", paused_at: null, cancelled_at: null, provider_subscription_reference: null, ...overrides };
}

test("POST as admin starts a subscription", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", planKey: "website_care" }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).subscription.status, "active");
});

test("POST as a non-admin is denied", async () => {
  const res = await handler({ httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", planKey: "x" }) }, {}, fakeDeps("customer"));
  assert.equal(res.statusCode, 403);
});

test("GET as org_member lists subscriptions", async () => {
  const sql = routingFakeSql({ subs: [subRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).subscriptions.length, 1);
});

test("PATCH as admin pauses a subscription", async () => {
  const sql = routingFakeSql({ subs: [subRow()] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ subscriptionId: "sub-1", nextStatus: "paused" }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).subscription.status, "paused");
});

test("PATCH attempting to reactivate a cancelled subscription returns 400", async () => {
  const sql = routingFakeSql({ subs: [subRow({ status: "cancelled", cancelled_at: "2026-07-05T00:00:00.000Z" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ subscriptionId: "sub-1", nextStatus: "active" }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 400);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
