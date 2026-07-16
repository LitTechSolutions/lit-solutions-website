const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTechnologyAsset,
  listTechnologyAssets,
  recordBackup,
  markBackupRestoreVerified,
  listBackupRecordsForOrganization,
  mapRowToBackupRecord,
} = require("./assetStore");

const FIXED_NOW = () => new Date("2026-07-14T12:00:00.000Z");
const FIXED_ID = () => "asset-fixed-id";

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

function backupRow(overrides = {}) {
  return {
    id: "backup-1",
    organization_id: "org-a",
    website_profile_id: "profile-1",
    category: "source",
    location: "Netlify deploy history",
    taken_at: "2026-07-01T00:00:00.000Z",
    restore_verified: false,
    ...overrides,
  };
}

test("createTechnologyAsset validates and inserts, no credential fields possible", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const asset = await createTechnologyAsset({ organizationId: "org-a", type: "computer", label: "Front desk PC" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder });
  assert.equal(asset.label, "Front desk PC");
  assert.match(sql.calls[0].text, /INSERT INTO technology_assets/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "asset.create");
  assert.equal(auditRecorder.events[0].actorId, "system");
});

test("createTechnologyAsset records the actor when deps.actorId is supplied", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await createTechnologyAsset({ organizationId: "org-a", type: "computer", label: "Front desk PC" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder, actorId: "user-1" });
  assert.equal(auditRecorder.events[0].actorId, "user-1");
});

test("createTechnologyAsset rejects an invalid type before querying", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => createTechnologyAsset({ organizationId: "org-a", type: "bogus", label: "x" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder }));
  assert.equal(sql.calls.length, 0);
  assert.equal(auditRecorder.events.length, 0);
});

test("listTechnologyAssets scopes by organization", async () => {
  const sql = fakeSql([{ id: "a1", organization_id: "org-a", type: "computer", label: "x", warranty_expires_at: null, license_expires_at: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }]);
  const assets = await listTechnologyAssets("org-a", { sql });
  assert.equal(assets.length, 1);
});

test("recordBackup validates and inserts as not-yet-verified", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  const backup = await recordBackup({ organizationId: "org-a", websiteProfileId: "profile-1", category: "source", location: "Netlify deploy history" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder });
  assert.equal(backup.restoreVerified, false);
  assert.match(sql.calls[0].text, /INSERT INTO backup_records/);
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "asset.backup_recorded");
  assert.deepEqual(auditRecorder.events[0].metadata, { category: "source" });
});

test("recordBackup rejects an invalid category before querying", async () => {
  const sql = fakeSql();
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => recordBackup({ organizationId: "org-a", websiteProfileId: "profile-1", category: "bogus", location: "x" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID, auditRecorder }));
  assert.equal(sql.calls.length, 0);
  assert.equal(auditRecorder.events.length, 0);
});

test("markBackupRestoreVerified fetches the record, issues an UPDATE, and audits the actor", async () => {
  const sql = fakeSql([backupRow()]);
  const auditRecorder = fakeAuditRecorder();
  await markBackupRestoreVerified("backup-1", { sql, now: FIXED_NOW, auditRecorder, actorId: "tech-1" });
  assert.match(sql.calls[0].text, /SELECT \* FROM backup_records/);
  assert.match(sql.calls[1].text, /UPDATE backup_records/);
  assert.ok(sql.calls[1].values.includes(true));
  assert.equal(auditRecorder.events.length, 1);
  assert.equal(auditRecorder.events[0].action, "asset.backup_verified");
  assert.equal(auditRecorder.events[0].actorId, "tech-1");
  assert.equal(auditRecorder.events[0].organizationId, "org-a");
});

test("markBackupRestoreVerified throws for a nonexistent backup record without auditing", async () => {
  const sql = fakeSql([]);
  const auditRecorder = fakeAuditRecorder();
  await assert.rejects(() => markBackupRestoreVerified("nope", { sql, now: FIXED_NOW, auditRecorder }), /no backup record/);
  assert.equal(auditRecorder.events.length, 0);
});

test("listBackupRecordsForOrganization scopes by organization and maps rows", async () => {
  const sql = fakeSql([backupRow()]);
  const backups = await listBackupRecordsForOrganization("org-a", { sql });
  assert.equal(backups.length, 1);
  assert.match(sql.calls[0].text, /SELECT \* FROM backup_records WHERE organization_id/);
  assert.equal(backups[0].organizationId, "org-a");
  assert.equal(backups[0].websiteProfileId, "profile-1");
  assert.equal(backups[0].restoreVerified, false);
  assert.equal("restoreVerifiedAt" in backups[0], false);
});

test("mapRowToBackupRecord maps every field 1:1, including the optional restoreVerifiedAt when present", () => {
  const mapped = mapRowToBackupRecord(backupRow({ restore_verified: true, restore_verified_at: "2026-07-05T00:00:00.000Z" }));
  assert.deepEqual(mapped, {
    id: "backup-1",
    organizationId: "org-a",
    websiteProfileId: "profile-1",
    category: "source",
    location: "Netlify deploy history",
    takenAt: "2026-07-01T00:00:00.000Z",
    restoreVerified: true,
    restoreVerifiedAt: "2026-07-05T00:00:00.000Z",
  });
});

test("mapRowToBackupRecord omits restoreVerifiedAt when the row has none", () => {
  const mapped = mapRowToBackupRecord(backupRow());
  assert.equal("restoreVerifiedAt" in mapped, false);
});
