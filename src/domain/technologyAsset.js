// Domain type for F043 (Technology Asset Inventory). Deliberately no
// credential/secret fields anywhere -- the product definition explicitly
// excludes being "A password manager" and collecting unnecessary secrets
// (master instruction Product Definition; F043's own objective: "without
// collecting unnecessary secrets").

/**
 * @typedef {"computer" | "printer" | "network_device" | "software" | "other"} AssetType
 */

/**
 * @typedef {Object} TechnologyAsset
 * @property {string} id
 * @property {string} organizationId
 * @property {AssetType} type
 * @property {string} label - e.g. "Front desk PC", not a serial number or credential.
 * @property {string} [warrantyExpiresAt]
 * @property {string} [licenseExpiresAt]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

const ASSET_TYPES = ["computer", "printer", "network_device", "software", "other"];

/**
 * @param {Partial<TechnologyAsset>} candidate
 * @returns {asserts candidate is TechnologyAsset}
 */
function assertValidTechnologyAsset(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("technologyAsset: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("technologyAsset: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("technologyAsset: organizationId is required");
  }
  if (!ASSET_TYPES.includes(candidate.type)) throw new Error(`technologyAsset: type must be one of ${ASSET_TYPES.join(", ")}`);
  if (typeof candidate.label !== "string" || candidate.label.trim().length === 0) throw new Error("technologyAsset: label is required");
}

module.exports = { ASSET_TYPES, assertValidTechnologyAsset };
