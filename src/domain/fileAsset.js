// Domain type for F015 (File & Media Asset Upload Management).

/**
 * @typedef {"pending_scan" | "clean" | "quarantined" | "rejected"} FileAssetScanStatus
 */

/**
 * @typedef {Object} FileAsset
 * @property {string} id
 * @property {string} organizationId
 * @property {string} fileName - Safe, server-generated (never the raw client filename verbatim).
 * @property {string} mimeType
 * @property {number} sizeBytes
 * @property {FileAssetScanStatus} scanStatus
 * @property {string} storageRef
 * @property {string} uploadedAt
 * @property {string} uploadedBy
 */

const SCAN_STATUSES = ["pending_scan", "clean", "quarantined", "rejected"];

/**
 * @param {Partial<FileAsset>} candidate
 * @returns {asserts candidate is FileAsset}
 */
function assertValidFileAsset(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("fileAsset: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("fileAsset: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("fileAsset: organizationId is required");
  }
  if (typeof candidate.mimeType !== "string" || candidate.mimeType.length === 0) throw new Error("fileAsset: mimeType is required");
  if (typeof candidate.sizeBytes !== "number" || candidate.sizeBytes <= 0) throw new Error("fileAsset: sizeBytes must be a positive number");
  if (!SCAN_STATUSES.includes(candidate.scanStatus)) throw new Error(`fileAsset: scanStatus must be one of ${SCAN_STATUSES.join(", ")}`);
}

module.exports = { SCAN_STATUSES, assertValidFileAsset };
