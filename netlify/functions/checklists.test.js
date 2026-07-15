const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./checklists");

const FIXED_ID = () => "checklist-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("checklist_definitions")) return byTable.definitions || [];
    if (text.includes("checklist_responses")) return byTable.responses || [];
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

test("POST as admin creates a checklist definition", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ title: "Security Readiness", items: [{ key: "mfa", label: "MFA enabled?", weight: 1 }] }) },
    {},
    { ...fakeDeps("admin"), sql, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
});

test("POST as a non-admin is denied", async () => {
  const res = await handler({ httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ title: "x", items: [] }) }, {}, fakeDeps("customer"));
  assert.equal(res.statusCode, 403);
});

test("PATCH as admin records a response", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", checklistDefinitionId: "cl-1", itemKey: "mfa", met: true }) },
    {},
    { ...fakeDeps("admin"), sql, now: () => new Date("2026-07-15T12:00:00.000Z") }
  );
  assert.equal(res.statusCode, 200);
});

test("GET as org_owner fetches the scored checklist", async () => {
  const sql = routingFakeSql({
    definitions: [{ id: "cl-1", title: "Security Readiness", items: [{ key: "mfa", label: "x", weight: 1 }] }],
    responses: [{ item_key: "mfa", met: true }],
  });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", checklistDefinitionId: "cl-1" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).score.score, 1);
});

test("GET for a nonexistent checklist definition returns 404", async () => {
  const sql = routingFakeSql({ definitions: [] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", checklistDefinitionId: "nope" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 404);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
