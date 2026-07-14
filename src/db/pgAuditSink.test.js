const test = require("node:test");
const assert = require("node:assert/strict");
const { createPgAuditSink, mapRowToAuditEvent } = require("./pgAuditSink");
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
  return tag;
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
