const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./tickets");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "ticket-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("assignments")) return byTable.assignments || [];
    if (text.includes("tickets")) return byTable.tickets || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function baseEvent(overrides = {}) {
  return { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: "{}", ...overrides };
}

function fakeAuthDeps({ userId = "user-1", authContext } = {}) {
  return {
    getSession: async (token) => (token === "fake-token" ? { userId, sessionId: "s1" } : null),
    readCookie: () => "fake-token",
    resolveAuthorizationContext: async () => authContext,
  };
}

test("POST without a session cookie returns 401", async () => {
  const event = baseEvent({ headers: {}, body: JSON.stringify({ organizationId: "org-a" }) });
  const res = await handler(event, {}, { getSession: async () => null, readCookie: () => null });
  assert.equal(res.statusCode, 401);
});

test("POST without organizationId returns 400 before touching auth", async () => {
  const event = baseEvent({ body: JSON.stringify({}) });
  const res = await handler(event, {}, fakeAuthDeps({ authContext: null }));
  assert.equal(res.statusCode, 400);
});

test("POST with no membership in the target org returns 403", async () => {
  const event = baseEvent({ body: JSON.stringify({ organizationId: "org-a" }) });
  const res = await handler(event, {}, fakeAuthDeps({ authContext: null }));
  assert.equal(res.statusCode, 403);
});

test("POST as an org_member creates a ticket via the real ticketSubmission/ticketStore path", async () => {
  const sql = routingFakeSql({});
  const event = baseEvent({
    body: JSON.stringify({ organizationId: "org-a", category: "it_support", subject: "Printer down", description: "Won't print" }),
  });
  const deps = { ...fakeAuthDeps({ userId: "user-1", authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql, now: FIXED_NOW, idGenerator: FIXED_ID };
  const res = await handler(event, {}, deps);
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.equal(body.ticket.organizationId, "org-a");
  assert.equal(body.ticket.submittedBy, "user-1");
  assert.match(sql.calls[0].text, /INSERT INTO tickets/);
});

test("POST as a read_only_customer (no request.submit capability) is denied before any write", async () => {
  const sql = routingFakeSql({});
  const event = baseEvent({ body: JSON.stringify({ organizationId: "org-a", category: "it_support", subject: "x", description: "y" }) });
  const deps = { ...fakeAuthDeps({ authContext: { actorRole: "read_only_customer", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql };
  const res = await handler(event, {}, deps);
  assert.equal(res.statusCode, 403);
  assert.equal(sql.calls.length, 0);
});

test("POST as an org_member with a SUSPENDED membership is denied (SYS-AUTH-005)", async () => {
  const sql = routingFakeSql({});
  const event = baseEvent({ body: JSON.stringify({ organizationId: "org-a", category: "it_support", subject: "x", description: "y" }) });
  const deps = { ...fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "suspended" } }), sql };
  const res = await handler(event, {}, deps);
  assert.equal(res.statusCode, 403);
  assert.equal(sql.calls.length, 0);
});

test("GET lists tickets for an org_member (request.view)", async () => {
  const sql = routingFakeSql({
    tickets: [{ id: "t1", organization_id: "org-a", category: "it_support", subject: "x", description: "y", status: "submitted", submitted_at: "2026-07-01T00:00:00.000Z", submitted_by: "user-1", updated_at: "2026-07-01T00:00:00.000Z", version: 1 }],
  });
  const event = { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } };
  const deps = { ...fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql };
  const res = await handler(event, {}, deps);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).tickets.length, 1);
});

test("GET as a technician is denied -- listing is not a single-resource 'assigned' check (use the future work-queue endpoint instead)", async () => {
  const sql = routingFakeSql({ tickets: [] });
  const event = { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } };
  const deps = { ...fakeAuthDeps({ authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql };
  const res = await handler(event, {}, deps);
  assert.equal(res.statusCode, 403);
});

test("PATCH as the assigned technician transitions the ticket via ticketLifecycle.js", async () => {
  const sql = routingFakeSql({
    assignments: [{ technician_user_id: "tech-1" }],
    tickets: [{ id: "t1", organization_id: "org-a", category: "it_support", subject: "x", description: "y", status: "assigned", submitted_at: "2026-07-01T00:00:00.000Z", submitted_by: "user-1", updated_at: "2026-07-01T00:00:00.000Z", version: 1 }],
  });
  const event = {
    httpMethod: "PATCH",
    headers: { cookie: "lts_session=fake-token" },
    body: JSON.stringify({ ticketId: "t1", organizationId: "org-a", nextStatus: "in_progress" }),
  };
  const deps = { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql, now: FIXED_NOW };
  const res = await handler(event, {}, deps);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).ticket.status, "in_progress");
});

test("PATCH by a technician NOT assigned to the ticket is denied, even though they hold the technician role", async () => {
  const sql = routingFakeSql({
    assignments: [{ technician_user_id: "some-other-tech" }],
    tickets: [{ id: "t1", organization_id: "org-a", category: "it_support", subject: "x", description: "y", status: "submitted", submitted_at: "2026-07-01T00:00:00.000Z", submitted_by: "user-1", updated_at: "2026-07-01T00:00:00.000Z", version: 1 }],
  });
  const event = {
    httpMethod: "PATCH",
    headers: { cookie: "lts_session=fake-token" },
    body: JSON.stringify({ ticketId: "t1", organizationId: "org-a", nextStatus: "in_progress" }),
  };
  const deps = { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql, now: FIXED_NOW };
  const res = await handler(event, {}, deps);
  assert.equal(res.statusCode, 403);
});

test("PATCH with missing ticketId/nextStatus returns 400", async () => {
  const event = { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a" }) };
  const res = await handler(event, {}, fakeAuthDeps({ authContext: null }));
  assert.equal(res.statusCode, 400);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
