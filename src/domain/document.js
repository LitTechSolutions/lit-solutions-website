// Domain type for F014 (Document Library & Controlled Downloads).
// Extends the existing documents.js concept (see ARCHITECTURE.md's reuse
// classification: "Partially reusable -- owner/access model reusable;
// storage-as-base64-in-Blobs does not meet target file-storage
// requirements at Care Hub scale") with organization scope and a
// document "kind" the existing store doesn't have.

/**
 * @typedef {"proposal" | "agreement" | "invoice" | "receipt" | "report" | "handoff"} DocumentKind
 */

/**
 * @typedef {Object} CareHubDocument
 * @property {string} id
 * @property {string} organizationId
 * @property {DocumentKind} kind
 * @property {string} title
 * @property {string} storageRef - Opaque reference into whatever object-storage adapter is chosen (OWNER_DECISIONS.md #1/#3 -- deliberately not a raw data URI, unlike the existing documents.js).
 * @property {string} uploadedAt
 * @property {string} uploadedBy
 * @property {number} version
 */

const DOCUMENT_KINDS = ["proposal", "agreement", "invoice", "receipt", "report", "handoff"];

/**
 * @param {Partial<CareHubDocument>} candidate
 * @returns {asserts candidate is CareHubDocument}
 */
function assertValidDocument(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("document: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("document: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("document: organizationId is required");
  }
  if (!DOCUMENT_KINDS.includes(candidate.kind)) throw new Error(`document: kind must be one of ${DOCUMENT_KINDS.join(", ")}`);
  if (typeof candidate.title !== "string" || candidate.title.trim().length === 0) throw new Error("document: title is required");
  if (typeof candidate.storageRef !== "string" || candidate.storageRef.length === 0) {
    throw new Error("document: storageRef is required (not a raw data URI -- see SYS-ARC-004)");
  }
}

module.exports = { DOCUMENT_KINDS, assertValidDocument };
