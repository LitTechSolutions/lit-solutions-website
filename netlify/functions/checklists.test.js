const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./checklists");

const FIXED_ID = () => "checklist-fixed-id";
const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");

function definitionRow(overrides = {}) {
  return {
    id: "cl-1",
    title: "Security Readiness",
    items: [
      { key: "mfa", label: "MFA enabled?", weight: 2, audience: "customer" },
      { key: "onsite_review", label: "On-site review completed?", weight: 1, audience: "staff" },
    ],
    ...overrides,
  };
}

function submissionRow(overrides = {}) {
  return {
    organization_id: "org-a",
    checklist_definition_id: "cl-1",
    status: "draft",
    submitted_at: null,
    submitted_by: null,
    reviewed_at: null,
    reviewed_by: null,
    review_note: null,
    ...overrides,
  };
}

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("checklist_definitions")) return byTable.definitions || [];
    if (text.includes("checklist_submissions")) return byTable.submissions || [];
    if (text.includes("checklist_responses")) return byTable.responses || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeAdminDeps() {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "admin-1", role: "admin", sessionId: "s1" } : null), readCookie: () => "fake-token" };
}
function fakeNonAdminSessionDeps() {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "user-1", role: "customer", sessionId: "s1" } : null), readCookie: () => "fake-token" };
}
function fakeCustomerDeps(authContext, userId = "user-1") {
  return {
    getSession: async (token) => (token === "fake-token" ? { userId, sessionId: "s1" } : null),
    readCookie: () => "fake-token",
    resolveAuthorizationContext: async () => authContext,
  };
}

test("POST as admin creates a checklist definition (items require audience)", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ title: "Security Readiness", items: [{ key: "mfa", label: "MFA enabled?", weight: 1, audience: "customer" }] }) },
    {},
    { ...fakeAdminDeps(), sql, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 201);
});

test("POST as a non-admin is denied", async () => {
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ title: "x", items: [{ key: "a", label: "a", weight: 1, audience: "customer" }] }) },
    {},
    fakeNonAdminSessionDeps()
  );
  assert.equal(res.statusCode, 403);
});

test("PATCH customerAnswer as org_owner records an answer", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()], submissions: [submissionRow()] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "customerAnswer", organizationId: "org-a", checklistDefinitionId: "cl-1", itemKey: "mfa", met: true, comment: "done" }) },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 200);
});

test("PATCH customerAnswer as read_only_customer is denied (view-only role)", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()], submissions: [submissionRow()] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "customerAnswer", organizationId: "org-a", checklistDefinitionId: "cl-1", itemKey: "mfa", met: true }) },
    {},
    { ...fakeCustomerDeps({ actorRole: "read_only_customer", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 403);
});

test("PATCH customerAnswer targeting a staff-audience item fails with 400 (item is staff-only)", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()], submissions: [submissionRow()] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "customerAnswer", organizationId: "org-a", checklistDefinitionId: "cl-1", itemKey: "onsite_review", met: true }) },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 400);
});

test("PATCH submit as org_owner moves draft -> submitted", async () => {
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "draft" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "submit", organizationId: "org-a", checklistDefinitionId: "cl-1" }) },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).message, "Submitted for review.");
});

test("PATCH staffAssess as admin verifies an item", async () => {
  const sql = routingFakeSql({ definitions: [definitionRow()], responses: [] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "staffAssess", organizationId: "org-a", checklistDefinitionId: "cl-1", itemKey: "mfa", staffVerified: true, staffNote: "confirmed" }) },
    {},
    { ...fakeAdminDeps(), sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(res.statusCode, 200);
});

test("PATCH staffAssess as a customer role is denied", async () => {
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "staffAssess", organizationId: "org-a", checklistDefinitionId: "cl-1", itemKey: "mfa", staffVerified: true }) },
    {},
    fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" })
  );
  assert.equal(res.statusCode, 403);
});

test("PATCH review (return) as admin requires a reviewNote", async () => {
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "submitted" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "review", organizationId: "org-a", checklistDefinitionId: "cl-1", reviewAction: "return" }) },
    {},
    { ...fakeAdminDeps(), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 400);
});

test("PATCH review (return) as admin with a reviewNote succeeds", async () => {
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "submitted" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "review", organizationId: "org-a", checklistDefinitionId: "cl-1", reviewAction: "return", reviewNote: "please recheck backups" }) },
    {},
    { ...fakeAdminDeps(), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).message, "Returned for changes.");
});

test("PATCH review (verify) as admin succeeds", async () => {
  const sql = routingFakeSql({ submissions: [submissionRow({ status: "submitted" })] });
  const res = await handler(
    { httpMethod: "PATCH", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "review", organizationId: "org-a", checklistDefinitionId: "cl-1", reviewAction: "verify" }) },
    {},
    { ...fakeAdminDeps(), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).message, "Verified.");
});

test("PATCH with an unrecognized action returns 400 before touching auth", async () => {
  const res = await handler(
    { httpMethod: "PATCH", headers: {}, body: JSON.stringify({ action: "bogus" }) },
    {},
    {}
  );
  assert.equal(res.statusCode, 400);
});

test("GET as org_owner gets the customer-shielded view (no staffNote/staffVerified anywhere in the response)", async () => {
  const sql = routingFakeSql({
    definitions: [definitionRow()],
    responses: [{ item_key: "mfa", met: true, comment: "done" }],
    submissions: [submissionRow({ status: "draft" })],
  });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", checklistDefinitionId: "cl-1" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.definition.items.length, 1); // only the customer-audience item
  assert.equal(res.body.includes("staffVerified"), false);
  assert.equal(res.body.includes("staffNote"), false);
});

test("GET as read_only_customer is allowed (view-only role still has checklist.view)", async () => {
  const sql = routingFakeSql({
    definitions: [definitionRow()],
    responses: [],
    submissions: [submissionRow()],
  });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", checklistDefinitionId: "cl-1" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "read_only_customer", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 200);
});

test("GET as admin gets the full staff view, including staffVerified and the score", async () => {
  const sql = routingFakeSql({
    definitions: [definitionRow()],
    responses: [
      { item_key: "mfa", met: true, comment: "done", staff_note: null, staff_verified: true },
      { item_key: "onsite_review", met: true, comment: null, staff_note: "checked in person", staff_verified: true },
    ],
    submissions: [submissionRow({ status: "submitted" })],
  });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a", checklistDefinitionId: "cl-1" } },
    {},
    { ...fakeAdminDeps(), sql }
  );
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.definition.items.length, 2); // both audiences
  assert.equal(body.score.score, 1);
  assert.equal(body.answers.find((a) => a.itemKey === "onsite_review").staffNote, "checked in person");
});

test("GET with no checklistDefinitionId lists all definitions (customer role)", async () => {
  const sql = routingFakeSql({ definitions: [{ id: "def-1", title: "Security Readiness" }, { id: "def-2", title: "MFA Checklist" }] });
  const res = await handler(
    { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: { organizationId: "org-a" } },
    {},
    { ...fakeCustomerDeps({ actorRole: "org_owner", actorOrgId: "org-a", actorMembershipStatus: "active" }), sql }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).definitions.length, 2);
});

test("GET with no checklistDefinitionId or organizationId returns 400", async () => {
  const res = await handler({ httpMethod: "GET", headers: {}, queryStringParameters: {} }, {}, {});
  assert.equal(res.statusCode, 400);
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
