const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/organizations");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "org-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("organizations")) return byTable.organizations || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeAuthDeps({ userId = "user-1", role, authContext } = {}) {
  return {
    getSession: async (token) => (token === "fake-token" ? { userId, role, sessionId: "s1" } : null),
    readCookie: () => "fake-token",
    resolveAuthorizationContext: async () => authContext,
  };
}

function orgRow(overrides = {}) {
  return { id: "org-1", name: "Acme LLC", status: "active", created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z", created_by: "admin-1", version: 1, ...overrides };
}

test("POST without a session returns 401", async () => {
  const res = await handler({ httpMethod: "POST", headers: {}, body: "{}" }, {}, { getSession: async () => null, readCookie: () => null });
  assert.equal(res.statusCode, 401);
});

test("POST as a non-admin legacy role is denied (only 'admin' bridges to platform_admin)", async () => {
  const res = await handler({ httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ name: "Acme LLC" }) }, {}, fakeAuthDeps({ role: "customer" }));
  assert.equal(res.statusCode, 403);
});

test("POST as the legacy admin role creates an organization -- no organizationId needed, no membership lookup", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ name: "Acme LLC" }) },
    {},
    { ...fakeAuthDeps({ userId: "admin-1", role: "admin" }), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.equal(body.organization.name, "Acme LLC");
  assert.equal(body.organization.createdBy, "admin-1");
  assert.match(sql.calls[0].text, /INSERT INTO organizations/);
});

test("GET as platform_admin (legacy admin role) views any organization without a membership row", async () => {
  const sql = routingFakeSql({ organizations: [orgRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-1" } },
    {},
    { ...fakeAuthDeps({ role: "admin" }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).organization.id, "org-1");
});

test("GET as org_owner views their own organization", async () => {
  const sql = routingFakeSql({ organizations: [orgRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-1" } },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_owner", actorOrgId: "org-1", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 200);
});

test("GET as org_member is denied -- organization.view is not in org_member's capability set", async () => {
  const sql = routingFakeSql({ organizations: [orgRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-1" } },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-1", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("GET for a nonexistent organization returns 404", async () => {
  const sql = routingFakeSql({ organizations: [] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-missing" } },
    {},
    { ...fakeAuthDeps({ role: "admin" }), sql }
  );
  assert.equal(res.statusCode, 404);
});

test("PATCH as platform_admin suspends an organization", async () => {
  const sql = routingFakeSql({ organizations: [orgRow({ status: "suspended" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-1", status: "suspended" }) },
    {},
    { ...fakeAuthDeps({ role: "admin" }), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).organization.status, "suspended");
});

test("PATCH as org_owner is denied -- organization.suspend is platform_admin-only", async () => {
  const sql = routingFakeSql({ organizations: [orgRow()] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-1", status: "suspended" }) },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_owner", actorOrgId: "org-1", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
