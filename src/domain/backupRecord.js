// Domain type for F041 (Backup & Restore Point Tracking). Records WHERE
// a backup lives and WHETHER it was verified restorable -- never the
// backup content or credentials to access it.

/**
 * @typedef {"source" | "content" | "assets" | "database" | "configuration"} BackupCategory
 */

/**
 * @typedef {Object} BackupRecord
 * @property {string} id
 * @property {string} organizationId
 * @property {string} websiteProfileId
 * @property {BackupCategory} category
 * @property {string} location - Plain-language description of where it's stored, e.g. "Netlify deploy history", not a credential or access path.
 * @property {string} takenAt
 * @property {boolean} restoreVerified
 * @property {string} [restoreVerifiedAt]
 */

const CATEGORIES = ["source", "content", "assets", "database", "configuration"];

/**
 * @param {Partial<BackupRecord>} candidate
 * @returns {asserts candidate is BackupRecord}
 */
function assertValidBackupRecord(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("backupRecord: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("backupRecord: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("backupRecord: organizationId is required");
  }
  if (!CATEGORIES.includes(candidate.category)) throw new Error(`backupRecord: category must be one of ${CATEGORIES.join(", ")}`);
  if (typeof candidate.location !== "string" || candidate.location.trim().length === 0) throw new Error("backupRecord: location is required");
  if (typeof candidate.restoreVerified !== "boolean") throw new Error("backupRecord: restoreVerified must be a boolean");
}

module.exports = { CATEGORIES, assertValidBackupRecord };
