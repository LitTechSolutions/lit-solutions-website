const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/it-support");

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("assignments")) return byTable.assignments || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeAuthDeps({ userId = "user-1", authContext } = {}) {
  return {
    getSession: async (token) => (token === "fake-token" ? { userId, sessionId: "s1" } : null),
    readCookie: () => "fake-token",
    resolveAuthorizationContext: async () => authContext,
  };
}

test("POST as the assigned technician classifies a ticket", async () => {
  const sql = routingFakeSql({ assignments: [{ technician_user_id: "tech-1" }] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", ticketId: "t1", requiresPhysicalAccess: false, safetyRisk: false }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql, now: () => new Date("2026-07-15T12:00:00.000Z") }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).classification.classification, "remote");
});

test("POST as an unassigned technician is denied", async () => {
  const sql = routingFakeSql({ assignments: [{ technician_user_id: "someone-else" }] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", ticketId: "t1", requiresPhysicalAccess: false, safetyRisk: false }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("POST as a customer is denied", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", ticketId: "t1", requiresPhysicalAccess: false, safetyRisk: false }) },
    {},
    fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" } })
  );
  assert.equal(res.statusCode, 403);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "GET" }, {}, {});
  assert.equal(res.statusCode, 405);
});
