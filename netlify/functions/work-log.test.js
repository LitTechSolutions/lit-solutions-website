const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./work-log");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
const FIXED_ID = () => "log-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("assignments")) return byTable.assignments || [];
    if (text.includes("time_entries")) return byTable.timeEntries || [];
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

test("POST time entry as the assigned technician succeeds", async () => {
  const sql = routingFakeSql({ assignments: [{ technician_user_id: "tech-1" }] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ kind: "time", organizationId: "org-a", ticketId: "t1", minutes: 30 }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
});

test("POST internal note as the assigned technician succeeds", async () => {
  const sql = routingFakeSql({ assignments: [{ technician_user_id: "tech-1" }] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ kind: "note", organizationId: "org-a", ticketId: "t1", body: "Checked router config." }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).note.customerVisible, false);
});

test("POST as an unassigned technician is denied", async () => {
  const sql = routingFakeSql({ assignments: [{ technician_user_id: "someone-else" }] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ kind: "time", organizationId: "org-a", ticketId: "t1", minutes: 30 }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("POST as a customer is denied", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ kind: "time", organizationId: "org-a", ticketId: "t1", minutes: 30 }) },
    {},
    fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" } })
  );
  assert.equal(res.statusCode, 403);
});

test("GET total minutes as the assigned technician", async () => {
  const sql = routingFakeSql({ assignments: [{ technician_user_id: "tech-1" }], timeEntries: [{ id: "te-1", ticket_id: "t1", technician_user_id: "tech-1", minutes: 30, recorded_at: "2026-07-15T12:00:00.000Z", note: null }] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", ticketId: "t1" } },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).totalMinutes, 30);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
