const test = require("node:test");
const assert = require("node:assert/strict");
const { createTechnologyAsset, listTechnologyAssets, recordBackup, markBackupRestoreVerified } = require("./assetStore");

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

test("createTechnologyAsset validates and inserts, no credential fields possible", async () => {
  const sql = fakeSql();
  const asset = await createTechnologyAsset({ organizationId: "org-a", type: "computer", label: "Front desk PC" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(asset.label, "Front desk PC");
  assert.match(sql.calls[0].text, /INSERT INTO technology_assets/);
});

test("createTechnologyAsset rejects an invalid type before querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() => createTechnologyAsset({ organizationId: "org-a", type: "bogus", label: "x" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID }));
  assert.equal(sql.calls.length, 0);
});

test("listTechnologyAssets scopes by organization", async () => {
  const sql = fakeSql([{ id: "a1", organization_id: "org-a", type: "computer", label: "x", warranty_expires_at: null, license_expires_at: null, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" }]);
  const assets = await listTechnologyAssets("org-a", { sql });
  assert.equal(assets.length, 1);
});

test("recordBackup validates and inserts as not-yet-verified", async () => {
  const sql = fakeSql();
  const backup = await recordBackup({ organizationId: "org-a", websiteProfileId: "profile-1", category: "source", location: "Netlify deploy history" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID });
  assert.equal(backup.restoreVerified, false);
  assert.match(sql.calls[0].text, /INSERT INTO backup_records/);
});

test("recordBackup rejects an invalid category before querying", async () => {
  const sql = fakeSql();
  await assert.rejects(() => recordBackup({ organizationId: "org-a", websiteProfileId: "profile-1", category: "bogus", location: "x" }, { sql, now: FIXED_NOW, idGenerator: FIXED_ID }));
  assert.equal(sql.calls.length, 0);
});

test("markBackupRestoreVerified issues an UPDATE", async () => {
  const sql = fakeSql();
  await markBackupRestoreVerified("backup-1", { sql, now: FIXED_NOW });
  assert.match(sql.calls[0].text, /UPDATE backup_records/);
  assert.ok(sql.calls[0].values.includes(true));
});
