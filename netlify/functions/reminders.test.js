const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./reminders");

const FIXED_ID = () => "reminder-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("lifecycle_reminders")) return byTable.reminders || [];
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

test("POST as admin creates a reminder", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", subjectId: "domain-1", subjectType: "domain", expiresAt: "2026-09-01T00:00:00.000Z" }) },
    {},
    { ...fakeDeps("admin"), sql, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
});

test("POST as a non-admin is denied", async () => {
  const res = await handler({ httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", subjectId: "x", subjectType: "domain", expiresAt: "2026-09-01T00:00:00.000Z" }) }, {}, fakeDeps("customer"));
  assert.equal(res.statusCode, 403);
});

test("GET as read_only_customer lists reminders for their org", async () => {
  const sql = routingFakeSql({ reminders: [{ id: "r1", organization_id: "org-a", subject_id: "domain-1", subject_type: "domain", expires_at: "2026-09-01T00:00:00.000Z", sent: false }] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "read_only_customer", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).reminders.length, 1);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
