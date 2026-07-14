// Domain type for F056 (System Settings, Feature Flags & Content Configuration).
// Not owner-blocked -- centralizes non-secret configuration per SYS-ARC-008
// ("frontend configuration never contains private keys or server credentials").

/**
 * @typedef {"string" | "number" | "boolean" | "json"} SettingValueType
 */

/**
 * @typedef {Object} SettingRecord
 * @property {string} key - Namespaced, e.g. "care_hub.support_email".
 * @property {string | number | boolean | object} value
 * @property {SettingValueType} valueType
 * @property {string} description
 * @property {string} updatedAt
 * @property {string} updatedBy
 * @property {number} version
 */

/**
 * @typedef {Object} FeatureFlag
 * @property {string} key - e.g. "care_hub.ticket_submission_enabled".
 * @property {boolean} enabled
 * @property {string} [rolloutNote] - Human-readable context, never a secret or credential.
 * @property {string} updatedAt
 * @property {string} updatedBy
 */

const VALUE_TYPES = ["string", "number", "boolean", "json"];

/**
 * @param {Partial<SettingRecord>} candidate
 * @returns {asserts candidate is SettingRecord}
 */
function assertValidSetting(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("setting: expected an object");
  }
  if (typeof candidate.key !== "string" || candidate.key.length === 0) {
    throw new Error("setting: key is required");
  }
  if (!VALUE_TYPES.includes(candidate.valueType)) {
    throw new Error(`setting: valueType must be one of ${VALUE_TYPES.join(", ")}`);
  }
  const actualType = typeof candidate.value;
  const expected =
    candidate.valueType === "json"
      ? actualType === "object"
      : actualType === candidate.valueType;
  if (!expected) {
    throw new Error(`setting: value does not match declared valueType "${candidate.valueType}"`);
  }
  if (typeof candidate.updatedBy !== "string" || candidate.updatedBy.length === 0) {
    throw new Error("setting: updatedBy is required (SYS-NFR-020 -- configuration changes are audited)");
  }
  if (looksLikeSecret(candidate.key) || (actualType === "string" && looksLikeSecret(String(candidate.value)))) {
    throw new Error("setting: value looks like a secret/credential -- settings are non-secret configuration only (SYS-ARC-008)");
  }
}

/**
 * @param {Partial<FeatureFlag>} candidate
 * @returns {asserts candidate is FeatureFlag}
 */
function assertValidFeatureFlag(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("featureFlag: expected an object");
  }
  if (typeof candidate.key !== "string" || candidate.key.length === 0) {
    throw new Error("featureFlag: key is required");
  }
  if (typeof candidate.enabled !== "boolean") {
    throw new Error("featureFlag: enabled must be a boolean");
  }
  if (typeof candidate.updatedBy !== "string" || candidate.updatedBy.length === 0) {
    throw new Error("featureFlag: updatedBy is required (SYS-NFR-020)");
  }
}

// Deliberately crude heuristic, not a security control by itself -- the
// real control is that secrets never enter this module's input in the
// first place (they live in Netlify environment variables). This is a
// second line of defense to fail loudly if that boundary is ever crossed.
const SECRET_LOOKING_PATTERNS = [/secret/i, /password/i, /api[_-]?key/i, /token/i, /private[_-]?key/i];

function looksLikeSecret(text) {
  return SECRET_LOOKING_PATTERNS.some((pattern) => pattern.test(text));
}

module.exports = { assertValidSetting, assertValidFeatureFlag };
