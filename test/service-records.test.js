const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/service-records");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
const FIXED_ID = () => "svc-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("service_records")) return byTable.records || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeDeps(role) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "admin-1", role, sessionId: "s1" } : null), readCookie: () => "fake-token" };
}

function fakeCustomerDeps(authContext) {
  return {
    getSession: async (token) => (token === "fake-token" ? { userId: "user-1", sessionId: "s1" } : null),
    readCookie: () => "fake-token",
    resolveAuthorizationContext: async () => authContext,
  };
}

test("POST as admin creates a service record", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", category: "website", title: "Ongoing Website Care Plan" }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).record.status, "active");
});

test("POST as a non-admin is denied", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", category: "x", title: "y" }) },
    {},
    fakeDeps("customer")
  );
  assert.equal(res.statusCode, 403);
});

test("GET as org_member lists service records for their org", async () => {
  const sql = routingFakeSql({ records: [{ id: "svc-1", organization_id: "org-a", category: "website", title: "x", status: "active", created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z", created_by: "admin-1", version: 1 }] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).records.length, 1);
});

test("PATCH as admin updates status", async () => {
  const sql = routingFakeSql({
    records: [{ id: "svc-1", organization_id: "org-a", category: "website", title: "x", status: "active", created_at: "2026-07-01T00:00:00.000Z", updated_at: "2026-07-01T00:00:00.000Z", created_by: "admin-1", version: 1 }],
  });
  const auditRecorder = { record: async (input) => input, events: [] };
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ recordId: "svc-1", status: "completed" }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW, auditRecorder }
  );
  assert.equal(res.statusCode, 200);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
