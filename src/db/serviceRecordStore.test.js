const test = require("node:test");
const assert = require("node:assert/strict");
const { createServiceRecord, listServiceRecordsForOrganization, updateServiceRecordStatus, mapRowToServiceRecord } = require("./serviceRecordStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "svc-fixed-id";

function fakeSql(cannedRows = []) {
  const calls = [];
  const tag = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return cannedRows;
  };
  tag.calls = calls;
  return tag;
}

function fakeAuditRecorder() {
  const events = [];
  return { record: async (input) => { events.push(input); return input; }, events };
}

test("createServiceRecord validates and inserts with status active, version 1", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const record = await createServiceRecord(
    { organizationId: "org-a", category: "website", title: "Site care", createdBy: "user-1" },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder }
  );
  assert.equal(record.status, "active");
  assert.equal(record.version, 1);
  assert.match(sql.calls[0].text, /INSERT INTO service_records/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "service_record.create");
  assert.equal(auditRecorder.events[0].actorId, "system");
});

test("createServiceRecord audits with the given actorId", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await createServiceRecord(
    { organizationId: "org-a", category: "website", title: "Site care", createdBy: "user-1" },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder, actorId: "admin-1" }
  );
  assert.equal(auditRecorder.events[0].actorId, "admin-1");
  assert.equal(auditRecorder.events[0].organizationId, "org-a");
});

test("createServiceRecord rejects an invalid category before querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() =>
    createServiceRecord({ organizationId: "org-a", category: "bogus", title: "x", createdBy: "user-1" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID })
  );
  assert.equal(sql.calls.length, 0);
});

test("listServiceRecordsForOrganization maps every row and scopes by organization", async () => {
  const sql = fakeSql([
    { id: "s1", organization_id: "org-a", category: "website", title: "x", status: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", created_by: "u", version: 1 },
  ]);
  const records = await listServiceRecordsForOrganization("org-a", { sql });
  assert.equal(records.length, 1);
  assert.match(sql.calls[0].text, /WHERE organization_id/);
});

test("updateServiceRecordStatus rejects an invalid status without querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() => updateServiceRecordStatus("s1", "bogus", { sql, now: FIXED_NOW }));
  assert.equal(sql.calls.length, 0);
});

test("updateServiceRecordStatus issues a SELECT then an UPDATE incrementing version, and audits the transition", async () => {
  const sql = fakeSql([
    { id: "s1", organization_id: "org-a", category: "website", title: "x", status: "active", created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", created_by: "u", version: 1 },
  ]);
  const auditRecorder = fakeAuditRecorder();
  await updateServiceRecordStatus("s1", "on_hold", { sql, now: FIXED_NOW, auditRecorder, actorId: "admin-1" });
  assert.match(sql.calls[0].text, /SELECT \* FROM service_records/);
  assert.match(sql.calls[1].text, /UPDATE service_records/);
  assert.match(sql.calls[1].text, /version = version \+ 1/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "service_record.status_change");
  assert.equal(auditRecorder.events[0].actorId, "admin-1");
  assert.equal(auditRecorder.events[0].organizationId, "org-a");
  assert.deepEqual(auditRecorder.events[0].metadata, { fromStatus: "active", toStatus: "on_hold" });
});

test("updateServiceRecordStatus throws for a nonexistent record without auditing", async () => {
  const sql = fakeSql([]);
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => updateServiceRecordStatus("nope", "on_hold", { sql, now: FIXED_NOW, auditRecorder }), /no service record/);
  assert.equal(auditRecorder.events.length, 0);
});

test("mapRowToServiceRecord normalizes timestamps", () => {
  const mapped = mapRowToServiceRecord({ id: "s1", organization_id: "org-a", category: "it", title: "x", status: "active", created_at: new Date("2026-01-01T00:00:00.000Z"), updated_at: new Date("2026-01-01T00:00:00.000Z"), created_by: "u", version: 1 });
  assert.equal(mapped.createdAt, "2026-01-01T00:00:00.000Z");
});
