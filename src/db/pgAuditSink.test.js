const test = require("node:test");
const assert = require("node:assert/strict");
const { createPgAuditSink, mapRowToAuditEvent, encodeAuditCursor, decodeAuditCursor, MAX_PAGE_SIZE } = require("./pgAuditSink");
const { createAuditRecorder, shapeAuditEvent } = require("../audit/auditLog");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "audit-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  tag.query = async (text, params) => {
    calls.push({ text, values: params });
    return cannedRows;
  };
  return tag;
}

function auditRow(overrides = {}) {
  return {
    id: "audit-1",
    correlation_id: "corr-1",
    occurred_at: "2026-07-14T12:00:00.000Z",
    actor_type: "user",
    actor_id: "user-1",
    actor_role: "platform_admin",
    organization_id: "org-a",
    action: "ticket.transition",
    target_type: "ticket",
    target_id: "t1",
    outcome: "success",
    metadata: null,
    ...overrides,
  };
}

function baseEventInput(overrides = {}) {
  return {
    correlationId: "corr-1",
    actorType: "user",
    actorId: "user-1",
    actorRole: "org_owner",
    organizationId: "org-a",
    action: "member.invite",
    outcome: "success",
    ...overrides,
  };
}

test("write() inserts a row with all fields bound as parameters", async () => {
  const sql = fakeSql();
  const sink = createPgAuditSink({ sql });
  const event = shapeAuditEvent(baseEventInput(), { now: FIXED_NOW, idGenerator: FIXED_ID });
  await sink.write(event);

  assert.equal(sql.calls.length, 1);
  assert.match(sql.calls[0].text, /INSERT INTO audit_events/);
  assert.ok(sql.calls[0].values.includes("org-a"));
  assert.ok(sql.calls[0].values.includes("member.invite"));
});

test("write() serializes metadata to JSON, and passes null when absent", async () => {
  const sql = fakeSql();
  const sink = createPgAuditSink({ sql });
  const withMetadata = shapeAuditEvent(baseEventInput({ metadata: { reason: "test" } }), { now: FIXED_NOW, idGenerator: FIXED_ID });
  await sink.write(withMetadata);
  assert.ok(sql.calls[0].values.includes(JSON.stringify({ reason: "test" })));

  const withoutMetadata = shapeAuditEvent(baseEventInput(), { now: FIXED_NOW, idGenerator: () => "audit-fixed-id-2" });
  await sink.write(withoutMetadata);
  assert.ok(sql.calls[1].values.includes(null));
});

test("listByOrganization queries filtered and ordered by the org index, maps rows back to AuditEvent shape", async () => {
  const sql = fakeSql([
    {
      id: "audit-1",
      correlation_id: "corr-1",
      occurred_at: "2026-07-14T12:00:00.000Z",
      actor_type: "user",
      actor_id: "user-1",
      actor_role: "org_owner",
      organization_id: "org-a",
      action: "member.invite",
      target_type: null,
      target_id: null,
      outcome: "success",
      metadata: null,
    },
  ]);
  const sink = createPgAuditSink({ sql });
  const events = await sink.listByOrganization("org-a");

  assert.equal(events.length, 1);
  assert.equal(events[0].organizationId, "org-a");
  assert.match(sql.calls[0].text, /WHERE organization_id/);
  assert.match(sql.calls[0].text, /ORDER BY occurred_at DESC/);
});

// The interface-compatibility test: this is the entire reason F008 was
// built against an AuditSink interface rather than coupled to Blobs --
// createAuditRecorder() (Session 1) doesn't need to know or care that
// its sink is now Postgres instead of Blobs.
test("integration: createAuditRecorder works unchanged with the Postgres sink", async () => {
  const sql = fakeSql();
  const sink = createPgAuditSink({ sql });
  const recorder = createAuditRecorder(sink);

  const event = await recorder.record(baseEventInput(), { now: FIXED_NOW, idGenerator: FIXED_ID });

  assert.equal(event.organizationId, "org-a");
  assert.equal(sql.calls.length, 1, "the recorder's shaping/validation ran, then the Postgres sink's write() was called");
});

test("mapRowToAuditEvent omits optional fields when the row doesn't have them", () => {
  const mapped = mapRowToAuditEvent({
    id: "a1",
    correlation_id: "c1",
    occurred_at: "2026-07-14T12:00:00.000Z",
    actor_type: "system",
    actor_id: "system",
    actor_role: null,
    organization_id: null,
    action: "system.startup",
    target_type: null,
    target_id: null,
    outcome: "success",
    metadata: null,
  });
  assert.equal("actorRole" in mapped, false);
  assert.equal("metadata" in mapped, false);
  assert.equal(mapped.organizationId, null);
});

test("queryAuditEvents applies every filter as a parameterized condition, newest-first", async () => {
  const sql = fakeSql([auditRow()]);
  const sink = createPgAuditSink({ sql });
  const { events, nextCursor } = await sink.queryAuditEvents({
    organizationId: "org-a",
    actorId: "user-1",
    action: "ticket.transition",
    dateFrom: "2026-07-01T00:00:00.000Z",
    dateTo: "2026-07-31T00:00:00.000Z",
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].action, "ticket.transition");
  assert.equal(nextCursor, null, "fewer rows than the page size means no next page");
  assert.match(sql.calls[0].text, /organization_id = \$1/);
  assert.match(sql.calls[0].text, /actor_id = \$2/);
  assert.match(sql.calls[0].text, /action = \$3/);
  assert.match(sql.calls[0].text, /occurred_at >= \$4/);
  assert.match(sql.calls[0].text, /occurred_at <= \$5/);
  assert.match(sql.calls[0].text, /ORDER BY occurred_at DESC, id DESC/);
  assert.deepEqual(sql.calls[0].values, ["org-a", "user-1", "ticket.transition", "2026-07-01T00:00:00.000Z", "2026-07-31T00:00:00.000Z", 26]);
});

test("queryAuditEvents with no filters queries unconditionally", async () => {
  const sql = fakeSql([]);
  const sink = createPgAuditSink({ sql });
  await sink.queryAuditEvents({});
  assert.doesNotMatch(sql.calls[0].text, /WHERE/);
});

test("queryAuditEvents returns a nextCursor and trims the lookahead row when more results exist", async () => {
  const rows = Array.from({ length: 3 }, (_, i) => auditRow({ id: `audit-${i}`, occurred_at: `2026-07-1${4 - i}T12:00:00.000Z` }));
  const sql = fakeSql(rows);
  const sink = createPgAuditSink({ sql });
  const { events, nextCursor } = await sink.queryAuditEvents({ limit: 2 });

  assert.equal(events.length, 2, "the lookahead row is trimmed off the returned page");
  assert.notEqual(nextCursor, null);
  const decoded = decodeAuditCursor(nextCursor);
  assert.equal(decoded.id, "audit-1");
});

test("queryAuditEvents decodes a cursor into a strict keyset (occurred_at, id) < (...) condition", async () => {
  const sql = fakeSql([]);
  const sink = createPgAuditSink({ sql });
  const cursor = encodeAuditCursor("2026-07-10T00:00:00.000Z", "audit-5");
  await sink.queryAuditEvents({ cursor });

  assert.match(sql.calls[0].text, /\(occurred_at, id\) < \(\$1, \$2\)/);
  assert.deepEqual(sql.calls[0].values.slice(0, 2), ["2026-07-10T00:00:00.000Z", "audit-5"]);
});

test("queryAuditEvents ignores a malformed cursor rather than throwing", async () => {
  const sql = fakeSql([]);
  const sink = createPgAuditSink({ sql });
  await sink.queryAuditEvents({ cursor: "not-valid-base64-json" });
  assert.doesNotMatch(sql.calls[0].text, /WHERE/);
});

test("queryAuditEvents clamps the page size to MAX_PAGE_SIZE", async () => {
  const sql = fakeSql([]);
  const sink = createPgAuditSink({ sql });
  await sink.queryAuditEvents({ limit: 99999 });
  assert.equal(sql.calls[0].values[sql.calls[0].values.length - 1], MAX_PAGE_SIZE + 1);
});
