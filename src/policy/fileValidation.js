// F015 -- File & Media Asset Upload Management. Pure validation policy per
// SYS-SEC-006 ("Files are private, server-authorized, size/type/magic-byte
// validated, safely named, and scanned or quarantined as appropriate").
//
// Defaults below are conservative engineering defaults for a small-business
// service portal, NOT an owner-decided business policy -- they are exposed
// as overridable via the F056 settings document (src/settings/) rather
// than hardcoded as a business rule, so Dylan can adjust them without a
// code change. Do not treat DEFAULT_MAX_SIZE_BYTES or the allowlist as
// fixed; they are a starting point.

const DEFAULT_MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

const DEFAULT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// Magic-byte signatures for the binary types above. Text/plain has no
// reliable signature and is intentionally excluded from this check (size
// and MIME allowlisting still apply to it).
const MAGIC_BYTE_SIGNATURES = {
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
  "application/msword": [[0xd0, 0xcf, 0x11, 0xe0]], // legacy OLE compound file
  // Modern Office formats (.docx/.xlsx) are ZIP containers -- same signature for both.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [[0x50, 0x4b, 0x03, 0x04]],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [[0x50, 0x4b, 0x03, 0x04]],
};

function bytesStartWith(headerBytes, signature) {
  if (!headerBytes || headerBytes.length < signature.length) return false;
  return signature.every((byte, i) => headerBytes[i] === byte);
}

/**
 * @typedef {Object} FileUploadCandidate
 * @property {string} fileName
 * @property {string} mimeType - Client-declared MIME type.
 * @property {number} sizeBytes
 * @property {Uint8Array | number[]} [headerBytes] - First ~16 bytes of the actual file content, for magic-byte verification. Omit only when the type has no reliable signature (see MAGIC_BYTE_SIGNATURES).
 *
 * @typedef {Object} FileValidationConfig
 * @property {number} [maxSizeBytes]
 * @property {Set<string>} [allowedMimeTypes]
 *
 * @typedef {Object} FileValidationDecision
 * @property {boolean} allowed
 * @property {string} reason
 */

/**
 * @param {FileUploadCandidate} candidate
 * @param {FileValidationConfig} [config]
 * @returns {FileValidationDecision}
 */
function validateFileUpload(candidate, config = {}) {
  const maxSizeBytes = config.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const allowedMimeTypes = config.allowedMimeTypes ?? DEFAULT_ALLOWED_MIME_TYPES;

  if (!candidate || typeof candidate !== "object") {
    return { allowed: false, reason: "no file provided" };
  }
  if (typeof candidate.sizeBytes !== "number" || candidate.sizeBytes <= 0) {
    return { allowed: false, reason: "invalid file size" };
  }
  if (candidate.sizeBytes > maxSizeBytes) {
    return { allowed: false, reason: `file exceeds the ${maxSizeBytes}-byte size limit` };
  }
  if (!allowedMimeTypes.has(candidate.mimeType)) {
    return { allowed: false, reason: `MIME type "${candidate.mimeType}" is not on the allowlist` };
  }

  const signatures = MAGIC_BYTE_SIGNATURES[candidate.mimeType];
  if (signatures) {
    if (!candidate.headerBytes) {
      return { allowed: false, reason: "headerBytes required for magic-byte verification of this MIME type (SYS-SEC-006)" };
    }
    const matches = signatures.some((signature) => bytesStartWith(candidate.headerBytes, signature));
    if (!matches) {
      return { allowed: false, reason: "file content does not match its declared MIME type (magic-byte mismatch)" };
    }
  }

  return { allowed: true, reason: "passed size, MIME allowlist, and magic-byte checks" };
}

module.exports = { validateFileUpload, DEFAULT_MAX_SIZE_BYTES, DEFAULT_ALLOWED_MIME_TYPES, MAGIC_BYTE_SIGNATURES };
