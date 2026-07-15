const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/audit-log");

function fakeAuthDeps({ userId = "admin-1", role = "admin" } = {}) {
  return {
    getSession: async (token) => (token === "fake-token" ? { userId, role, sessionId: "s1" } : null),
    readCookie: () => "fake-token",
  };
}

function fakeAuditSink(result = { events: [], nextCursor: null }) {
  const calls = [];
  return {
    calls,
    queryAuditEvents: async (filters) => {
      calls.push(filters);
      return result;
    },
  };
}

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

function baseEvent(overrides = {}) {
  return { httpMethod: "GET", headers: { cookie: "lts_session=fake-token" }, queryStringParameters: {}, ...overrides };
}

test("GET without a session cookie returns 401", async () => {
  const res = await handler(baseEvent({ headers: {} }), {}, { getSession: async () => null, readCookie: () => null });
  assert.equal(res.statusCode, 401);
});

test("GET as a non-admin (legacy 'customer'/'staff' role) is denied", async () => {
  const auditSink = fakeAuditSink();
  const res = await handler(baseEvent(), {}, { ...fakeAuthDeps({ role: "staff" }), auditSink });
  assert.equal(res.statusCode, 403);
  assert.equal(auditSink.calls.length, 0, "must not query the audit log at all when denied");
});

test("GET as platform_admin queries with no filters and returns events + nextCursor", async () => {
  const events = [{ id: "a1", action: "ticket.transition", occurredAt: "2026-07-14T12:00:00.000Z" }];
  const auditSink = fakeAuditSink({ events, nextCursor: "abc" });
  const auditRecorder = fakeAuditRecorder();
  const res = await handler(baseEvent(), {}, { ...fakeAuthDeps(), auditSink, auditRecorder });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.events.length, 1);
  assert.equal(body.nextCursor, "abc");
  assert.deepEqual(auditSink.calls[0], {});
});

test("GET forwards organizationId/actorId/action/dateFrom/dateTo/cursor/limit filters", async () => {
  const auditSink = fakeAuditSink();
  const auditRecorder = fakeAuditRecorder();
  const q = {
    organizationId: "org-a",
    actorId: "user-1",
    action: "ticket.transition",
    dateFrom: "2026-07-01T00:00:00.000Z",
    dateTo: "2026-07-31T00:00:00.000Z",
    cursor: "some-cursor",
    limit: "10",
  };
  const res = await handler(baseEvent({ queryStringParameters: q }), {}, { ...fakeAuthDeps(), auditSink, auditRecorder });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(auditSink.calls[0], {
    organizationId: "org-a",
    actorId: "user-1",
    action: "ticket.transition",
    cursor: "some-cursor",
    limit: 10,
    dateFrom: "2026-07-01T00:00:00.000Z",
    dateTo: "2026-07-31T00:00:00.000Z",
  });
});

test("GET with a non-integer limit returns 400 before querying", async () => {
  const auditSink = fakeAuditSink();
  const res = await handler(baseEvent({ queryStringParameters: { limit: "not-a-number" } }), {}, { ...fakeAuthDeps(), auditSink });
  assert.equal(res.statusCode, 400);
  assert.equal(auditSink.calls.length, 0);
});

test("GET with an invalid dateFrom returns 400 before querying", async () => {
  const auditSink = fakeAuditSink();
  const res = await handler(baseEvent({ queryStringParameters: { dateFrom: "not-a-date" } }), {}, { ...fakeAuthDeps(), auditSink });
  assert.equal(res.statusCode, 400);
  assert.equal(auditSink.calls.length, 0);
});

test("GET audits its own access (audit.query), with the actor's own id and no raw cursor value in metadata", async () => {
  const auditSink = fakeAuditSink({ events: [], nextCursor: null });
  const auditRecorder = fakeAuditRecorder();
  await handler(baseEvent({ queryStringParameters: { cursor: "sensitive-position-marker" } }), {}, { ...fakeAuthDeps({ userId: "admin-9" }), auditSink, auditRecorder });
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "audit.query");
  assert.equal(auditRecorder.events[0].actorId, "admin-9");
  // metadata values must be primitives (SYS-SEC-012) -- the raw opaque
  // cursor (which encodes a real row's occurred_at/id) must never appear.
  assert.equal(auditRecorder.events[0].metadata.usedCursor, true);
  assert.equal(JSON.stringify(auditRecorder.events[0].metadata).includes("sensitive-position-marker"), false);
});

test("unsupported method returns 405", async () => {
  const res = await handler({ httpMethod: "POST" }, {}, {});
  assert.equal(res.statusCode, 405);
});
