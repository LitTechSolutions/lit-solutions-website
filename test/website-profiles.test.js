const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/website-profiles");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
const FIXED_ID = () => "wp-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("website_profiles")) return byTable.profiles || [];
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

test("POST as admin creates a website profile", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", primaryUrl: "https://acme.example.com" }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
});

test("POST as a non-admin is denied", async () => {
  const res = await handler({ httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", primaryUrl: "https://x.com" }) }, {}, fakeDeps("customer"));
  assert.equal(res.statusCode, 403);
});

test("GET as read_only_customer lists website profiles", async () => {
  const sql = routingFakeSql({ profiles: [{ id: "wp-1", organization_id: "org-a", primary_url: "https://acme.example.com", domain_registrar: null, hosting_provider: null, created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z" }] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "read_only_customer", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).profiles.length, 1);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
