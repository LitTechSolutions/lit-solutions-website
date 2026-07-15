const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./ticket-workflow");

const FIXED_NOW = () => new Date("2026-07-15T12:00:00.000Z");

function routingFakeSql(byTable) {
  const calls = [];
  const tag = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("tickets")) return byTable.tickets || [];
    return [];
  };
  tag.calls = calls;
  return tag;
}

function fakeDeps(role) {
  return { getSession: async (token) => (token === "fake-token" ? { userId: "admin-1", role, sessionId: "s1" } : null), readCookie: () => "fake-token" };
}

function ticketRow(overrides = {}) {
  return { id: "t1", organization_id: "org-a", category: "it_support", subject: "x", description: "y", status: "submitted", submitted_at: "2026-07-01T00:00:00.000Z", submitted_by: "u", updated_at: "2026-07-01T00:00:00.000Z", version: 1, ...overrides };
}

test("POST with an invalid action returns 400 before touching auth", async () => {
  const res = await handler({ httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "bogus" }) }, {}, fakeDeps("admin"));
  assert.equal(res.statusCode, 400);
});

test("POST as a non-admin is denied", async () => {
  const res = await handler({ httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "triage", ticketId: "t1", rules: [] }) }, {}, fakeDeps("customer"));
  assert.equal(res.statusCode, 403);
});

test("POST triage as admin classifies a real ticket", async () => {
  const sql = routingFakeSql({ tickets: [ticketRow()] });
  const rules = [{ id: "rule-it", match: { category: "it_support" }, queue: "it-queue", priority: 1 }];
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "triage", ticketId: "t1", rules }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).result.queue, "it-queue");
});

test("POST triage for a nonexistent ticket returns 404", async () => {
  const sql = routingFakeSql({ tickets: [] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "triage", ticketId: "nope", rules: [] }) },
    {},
    { ...fakeDeps("admin"), sql }
  );
  assert.equal(res.statusCode, 404);
});

test("POST prioritize as admin scores a ticket", async () => {
  const sql = routingFakeSql({ tickets: [ticketRow()] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "prioritize", ticketId: "t1", inputs: { impact: 0.9, urgency: 0.9, safetyConcern: false, securityConcern: false } }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).assessment.level, "critical");
});

test("POST prioritize for a nonexistent ticket returns 404", async () => {
  const sql = routingFakeSql({ tickets: [] });
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "prioritize", ticketId: "nope", inputs: { impact: 0.9, urgency: 0.9, safetyConcern: false, securityConcern: false } }) },
    {},
    { ...fakeDeps("admin"), sql }
  );
  assert.equal(res.statusCode, 404);
});

test("POST assign as admin selects a technician", async () => {
  const sql = routingFakeSql({});
  const candidates = [{ userId: "tech-1", organizationAssignments: ["org-a"], openTicketCount: 0, available: true }];
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "assign", ticketId: "t1", organizationId: "org-a", candidates }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).assignment.technicianUserId, "tech-1");
});

test("POST assign with no eligible technician returns 400", async () => {
  const sql = routingFakeSql({});
  const res = await handler(
    { httpMethod: "POST", headers: { cookie: "lts_session=fake-token" }, body: JSON.stringify({ action: "assign", ticketId: "t1", organizationId: "org-a", candidates: [] }) },
    {},
    { ...fakeDeps("admin"), sql, now: FIXED_NOW }
  );
  assert.equal(res.statusCode, 400);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "GET" }, {}, {});
  assert.equal(res.statusCode, 405);
});
