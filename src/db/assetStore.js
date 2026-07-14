// F043 -- Technology Asset Inventory. F041 -- Backup & Restore Point
// Tracking. Two small, related registries persisted together. Neither
// carries credentials (F043's own objective: "without collecting
// unnecessary secrets"; F041's `location` is a plain-language
// description, not an access path -- see the domain types).

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidTechnologyAsset } = require("../domain/technologyAsset");
const { assertValidBackupRecord } = require("../domain/backupRecord");

// F043
/**
 * @param {{ organizationId: string, type: string, label: string, warrantyExpiresAt?: string, licenseExpiresAt?: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/technologyAsset").TechnologyAsset>}
 */
async function createTechnologyAsset(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const asset = { id: idGenerator(), ...input, createdAt: now().toISOString(), updatedAt: now().toISOString() };
  assertValidTechnologyAsset(asset);

  await sql`
    INSERT INTO technology_assets (id, organization_id, type, label, warranty_expires_at, license_expires_at, created_at, updated_at)
    VALUES (${asset.id}, ${asset.organizationId}, ${asset.type}, ${asset.label}, ${asset.warrantyExpiresAt || null}, ${asset.licenseExpiresAt || null}, ${asset.createdAt}, ${asset.updatedAt})
  `;
  return asset;
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/technologyAsset").TechnologyAsset[]>}
 */
async function listTechnologyAssets(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM technology_assets WHERE organization_id = ${organizationId}`;
  return rows.map(mapRowToTechnologyAsset);
}

function mapRowToTechnologyAsset(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    type: row.type,
    label: row.label,
    ...(row.warranty_expires_at ? { warrantyExpiresAt: new Date(row.warranty_expires_at).toISOString() } : {}),
    ...(row.license_expires_at ? { licenseExpiresAt: new Date(row.license_expires_at).toISOString() } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// F041
/**
 * @param {{ organizationId: string, websiteProfileId: string, category: string, location: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/backupRecord").BackupRecord>}
 */
async function recordBackup(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const backup = { id: idGenerator(), ...input, takenAt: now().toISOString(), restoreVerified: false };
  assertValidBackupRecord(backup);

  await sql`
    INSERT INTO backup_records (id, organization_id, website_profile_id, category, location, taken_at, restore_verified)
    VALUES (${backup.id}, ${backup.organizationId}, ${backup.websiteProfileId}, ${backup.category}, ${backup.location}, ${backup.takenAt}, ${backup.restoreVerified})
  `;
  return backup;
}

/**
 * @param {string} id
 * @param {{ sql?: Function, now?: () => Date }} [deps]
 * @returns {Promise<void>}
 */
async function markBackupRestoreVerified(id, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  await sql`
    UPDATE backup_records
    SET restore_verified = ${true}, restore_verified_at = ${now().toISOString()}
    WHERE id = ${id}
  `;
}

module.exports = {
  createTechnologyAsset,
  listTechnologyAssets,
  mapRowToTechnologyAsset,
  recordBackup,
  markBackupRestoreVerified,
};
