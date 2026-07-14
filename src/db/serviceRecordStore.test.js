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

test("createServiceRecord validates and inserts with status active, version 1", async () => {
  const sql = fakeSql();
  const record = await createServiceRecord(
    { organizationId: "org-a", category: "website", title: "Site care", createdBy: "user-1" },
    { sql, now: FIXED_NOW, idGenerator: FIXED_ID }
  );
  assert.equal(record.status, "active");
  assert.equal(record.version, 1);
  assert.match(sql.calls[0].text, /INSERT INTO service_records/);
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

test("updateServiceRecordStatus issues an UPDATE incrementing version", async () => {
  const sql = fakeSql();
  await updateServiceRecordStatus("s1", "on_hold", { sql, now: FIXED_NOW });
  assert.match(sql.calls[0].text, /UPDATE service_records/);
  assert.match(sql.calls[0].text, /version = version \+ 1/);
});

test("mapRowToServiceRecord normalizes timestamps", () => {
  const mapped = mapRowToServiceRecord({ id: "s1", organization_id: "org-a", category: "it", title: "x", status: "active", created_at: new Date("2026-01-01T00:00:00.000Z"), updated_at: new Date("2026-01-01T00:00:00.000Z"), created_by: "u", version: 1 });
  assert.equal(mapped.createdAt, "2026-01-01T00:00:00.000Z");
});
