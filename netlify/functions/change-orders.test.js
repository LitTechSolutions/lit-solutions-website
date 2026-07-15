const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./change-orders");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");
let idCounter = 0;
const SEQUENTIAL_ID = () => `co-${++idCounter}`;

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("assignments")) return byTable.assignments || [];
    if (text.includes("approval_requests")) return [];
    if (text.includes("scope_of_work")) return byTable.scopes || [];
    if (text.includes("change_orders")) return byTable.changeOrders || [];
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
  return { id: "scope-1", organization_id: "org-a", ticket_id: "ticket-1", version: 1, status: "sent", assumptions: [], exclusions: [], line_items: [], created_at: "2026-07-01T00:00:00.000Z", created_by: "tech-1", ...overrides };
}

function changeOrderRow(overrides = {}) {
  return { id: "co-1", organization_id: "org-a", original_scope_id: "scope-1", description: "Add a page", added_line_items: [{ description: "New page", quantity: 1, priceRef: "ref-1" }], created_at: "2026-07-01T00:00:00.000Z", created_by: "tech-1", ...overrides };
}

test("POST without a session returns 401", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: {}, body: JSON.stringify({ organizationId: "org-a", originalScopeId: "scope-1", description: "x", addedLineItems: [{ description: "y", quantity: 1, priceRef: "r" }] }) },
    {},
    { getSession: async () => null, readCookie: () => null }
  );
  assert.equal(res.statusCode, 401);
});

test("POST for a nonexistent scope returns 404", async () => {
  const sql = routingFakeSql({ scopes: [] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", originalScopeId: "nope", description: "x", addedLineItems: [{ description: "y", quantity: 1, priceRef: "r" }] }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql }
  );
  assert.equal(res.statusCode, 404);
});

test("POST as an unassigned technician is denied", async () => {
  const sql = routingFakeSql({ scopes: [scopeRow()], assignments: [{ technician_user_id: "someone-else" }] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", originalScopeId: "scope-1", description: "x", addedLineItems: [{ description: "y", quantity: 1, priceRef: "r" }] }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("SECURITY: POST rejects a scope owned by a different organization", async () => {
  const sql = routingFakeSql({ scopes: [scopeRow({ organization_id: "org-b" })], assignments: [{ technician_user_id: "tech-1" }] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", originalScopeId: "scope-1", description: "x", addedLineItems: [{ description: "y", quantity: 1, priceRef: "r" }] }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql }
  );
  assert.equal(res.statusCode, 404);
  assert.equal(sql.calls.some((call) => call.text.includes("INSERT INTO change_orders")), false);
});

test("POST as the assigned technician creates the change order and its paired approval", async () => {
  idCounter = 0;
  const sql = routingFakeSql({ scopes: [scopeRow()], assignments: [{ technician_user_id: "tech-1" }] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", originalScopeId: "scope-1", description: "Add a page", addedLineItems: [{ description: "New page", quantity: 1, priceRef: "ref-1" }] }) },
    {},
    { ...fakeAuthDeps({ userId: "tech-1", authContext: { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined } }), sql, now: FIXED_NOW, idGenerator: SEQUENTIAL_ID }
  );
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.equal(body.changeOrder.originalScopeId, "scope-1");
  assert.equal(body.approval.subjectType, "change_order");
});

test("POST as org_owner (customer) is denied -- change_order.create is technician only", async () => {
  const sql = routingFakeSql({ scopes: [scopeRow()] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ organizationId: "org-a", originalScopeId: "scope-1", description: "x", addedLineItems: [{ description: "y", quantity: 1, priceRef: "r" }] }) },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("GET without organizationId returns 400", async () => {
  const res = await handler({ httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: {} }, {}, fakeAuthDeps({ authContext: null }));
  assert.equal(res.statusCode, 400);
});

test("GET a specific change order as org_member returns it", async () => {
  const sql = routingFakeSql({ changeOrders: [changeOrderRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", changeOrderId: "co-1" } },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).changeOrder.id, "co-1");
});

test("GET a nonexistent change order returns 404", async () => {
  const sql = routingFakeSql({ changeOrders: [] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", changeOrderId: "nope" } },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 404);
});

test("GET without changeOrderId lists all change orders for the org", async () => {
  const sql = routingFakeSql({ changeOrders: [changeOrderRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "read_only_customer", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).changeOrders.length, 1);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
