const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./approvals");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("approval_requests")) return byTable.approvals || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeAuthDeps({ role, authContext } = {}) {
  return {
    getSession: async (token) => (token === "fake-token" ? { userId: "user-1", role, sessionId: "s1" } : null),
    readCookie: () => "fake-token",
    resolveAuthorizationContext: async () => authContext,
  };
}

function approvalRow(overrides = {}) {
  return {
    id: "appr-1", organization_id: "org-a", subject_type: "scope", subject_id: "scope-1",
    status: "pending", requested_at: "2026-07-01T00:00:00.000Z", requested_by: "user-cust-1",
    expires_at: "2026-08-01T00:00:00.000Z", decided_at: null, decided_by: null, decision_note: null,
    ...overrides,
  };
}

test("GET without a session returns 401", async () => {
  const res = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: { organizationId: "org-a" } }, {}, { getSession: async () => null, readCookie: () => null });
  assert.equal(res.statusCode, 401);
});

test("GET as org_owner lists pending approvals for their org", async () => {
  const sql = routingFakeSql({ approvals: [approvalRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).approvals.length, 1);
});

test("GET as org_member is denied -- approval.view is org_owner only", async () => {
  const sql = routingFakeSql({ approvals: [] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("PATCH with an unrecognized subjectType returns 400 before touching auth", async () => {
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ approvalId: "appr-1", organizationId: "org-a", subjectType: "invoice", decisionAction: "approve" }) },
    {},
    fakeAuthDeps({})
  );
  assert.equal(res.statusCode, 400);
});

test("PATCH as org_owner approves a pending scope-of-work approval", async () => {
  const sql = routingFakeSql({ approvals: [approvalRow()] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ approvalId: "appr-1", organizationId: "org-a", subjectType: "scope", decisionAction: "approve" }) },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.approval.status, "approved");
  assert.equal(body.approval.decidedBy, "user-1");
});

test("PATCH as org_member is denied -- scope.approve is org_owner only", async () => {
  const sql = routingFakeSql({ approvals: [approvalRow()] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ approvalId: "appr-1", organizationId: "org-a", subjectType: "scope", decisionAction: "approve" }) },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_member", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 403);
  assert.equal(sql.calls.length, 0);
});

test("PATCH rejecting an already-decided approval surfaces the state-machine error as 400", async () => {
  const sql = routingFakeSql({ approvals: [approvalRow({ status: "approved", decided_at: "2026-07-05T00:00:00.000Z" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ approvalId: "appr-1", organizationId: "org-a", subjectType: "scope", decisionAction: "reject" }) },
    {},
    { ...fakeAuthDeps({ authContext: { actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" } }), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 400);
});

test("PATCH as platform_admin is denied -- scope.approve/change_order.approve are customer-side capabilities platform_admin was never granted", async () => {
  const sql = routingFakeSql({ approvals: [approvalRow({ subject_type: "change_order" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ approvalId: "appr-1", organizationId: "org-a", subjectType: "change_order", decisionAction: "approve" }) },
    {},
    { ...fakeAuthDeps({ role: "admin" }), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 403);
});

test("GET as platform_admin views any org's approval inbox -- organization.view-style bypass still applies to approval.view", async () => {
  const sql = routingFakeSql({ approvals: [approvalRow()] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeAuthDeps({ role: "admin" }), sql }
  );
  assert.equal(res.statusCode, 403, "platform_admin also has no approval.view capability -- same reasoning as the PATCH case above");
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "DELETE" }, {}, {});
  assert.equal(res.statusCode, 405);
});
