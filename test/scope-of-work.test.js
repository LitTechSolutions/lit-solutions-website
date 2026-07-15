const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/scope-of-work");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
const FIXED_ID = () => "scope-fixed-id";

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("assignments")) return byTable.assignments || [];
    if (text.includes("FROM tickets")) return byTable.tickets || [];
    if (text.includes("scope_of_work")) return byTable.scopes || [];
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

function scopeRow(overrides = {}) {
  return {
    id: "scope-1", organization_id: "org-a", ticket_id: "ticket-1", version: 1, status: "draft",
    assumptions: [], exclusions: [], line_items: [{ description: "x", quantity: 1, priceRef: "ref-1" }],
    created_at: "2026-07-01T00:00:00.000Z", created_by: "tech-1", ...overrides,
  };
}

test("POST without a session returns 401", async () => {
  const res = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ organizationId: "org-a", ticketId: "t1", lineItems: [] }) }, {}, { getSession: async () => null, readCookie: () => null });
  assert.equal(res.statusCode, 401);
});

test("POST as an unassigned technician is denied", async () => {
  const sql = routingFakeSql({ assignments: [{ technician_user_id: "someone-else" }] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", ticketId: "t1", lineItems: [{ description: "x", quantity: 1, priceRef: "ref-1" }] }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("POST as the assigned technician creates the initial scope", async () => {
  const sql = routingFakeSql({
    assignments: [{ technician_user_id: "tech-1" }],
    tickets: [{ id: "t1", organization_id: "org-a", category: "question", subject: "x", description: "y", status: "assigned", submitted_at: FIXED_NOW().toISOString(), submitted_by: "user-1", updated_at: FIXED_NOW().toISOString(), version: 1 }],
  });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", ticketId: "t1", lineItems: [{ description: "x", quantity: 1, priceRef: "ref-1" }] }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).scope.version, 1);
});

test("SECURITY: POST rejects a ticket owned by a different organization", async () => {
  const sql = routingFakeSql({
    assignments: [{ technician_user_id: "tech-1" }],
    tickets: [{ id: "t1", organization_id: "org-b", category: "question", subject: "x", description: "y", status: "assigned", submitted_at: FIXED_NOW().toISOString(), submitted_by: "user-2", updated_at: FIXED_NOW().toISOString(), version: 1 }],
  });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", ticketId: "t1", lineItems: [{ description: "x", quantity: 1, priceRef: "ref-1" }] }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql }
  );
  assert.equal(res.statusCode, 404);
  assert.equal(sql.calls.some((call) => call.text.includes("INSERT INTO scope_of_work")), false);
});

test("POST as an org_member (customer) is denied -- scope.create is technician only", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", ticketId: "t1", lineItems: [{ description: "x", quantity: 1, priceRef: "ref-1" }] }) },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("GET as org_owner lists scope versions for a ticket", async () => {
  const sql = routingFakeSql({ scopes: [scopeRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", ticketId: "ticket-1" } },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).versions.length, 1);
});

test("GET as read_only_customer can also view scope versions", async () => {
  const sql = routingFakeSql({ scopes: [scopeRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", ticketId: "ticket-1" } },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "read_only_customer", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 200);
});

test("PATCH as the assigned technician creates the next version", async () => {
  const sql = routingFakeSql({ assignments: [{ technician_user_id: "tech-1" }], scopes: [scopeRow({ status: "sent" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ scopeId: "scope-1", organizationId: "org-a", lineItems: [{ description: "y", quantity: 1, priceRef: "ref-2" }] }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).scope.version, 2);
});

test("PATCH for a nonexistent scope returns 404", async () => {
  const sql = routingFakeSql({ scopes: [] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ scopeId: "nope", organizationId: "org-a" }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql }
  );
  assert.equal(res.statusCode, 404);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
