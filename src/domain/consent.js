// Domain type for F007 (Terms, Privacy & Consent Acknowledgment).
//
// CURRENT_TERMS_VERSION/CURRENT_PRIVACY_VERSION are the engineering-side
// version identifiers this codebase stamps onto every consent record.
// They are dates, not legal text -- the actual Terms of Service and
// Privacy Policy wording lives in terms.html/privacy.html and is a
// content/legal-review concern (OWNER_DECISIONS.md #5), not something
// this file decides. Bump these constants whenever that content
// materially changes so historical consent records stay attributable to
// the version a user actually saw.

/**
 * @typedef {"terms_privacy" | "marketing" | "remote_access"} ConsentType
 */

/**
 * @typedef {Object} ConsentRecord
 * @property {string} id
 * @property {string} userId
 * @property {string | null} organizationId
 * @property {ConsentType} consentType
 * @property {boolean} granted
 * @property {string} occurredAt
 * @property {string} [termsVersion]
 * @property {string} [privacyVersion]
 * @property {string} [ipAddress]
 */

const CONSENT_TYPES = ["terms_privacy", "marketing", "remote_access"];

// Bump on any material change to terms.html / privacy.html content.
const CURRENT_TERMS_VERSION = "2026-07-15";
const CURRENT_PRIVACY_VERSION = "2026-07-15";

const REQUIRED_CONSENT_WORDING = "I agree to the Terms of Service and acknowledge the Privacy Policy.";

/**
 * @param {Partial<ConsentRecord>} candidate
 * @returns {asserts candidate is ConsentRecord}
 */
function assertValidConsentRecord(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new Error("consentRecord: expected an object");
  }
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw new Error("consentRecord: id is required");
  }
  if (typeof candidate.userId !== "string" || candidate.userId.length === 0) {
    throw new Error("consentRecord: userId is required");
  }
  if (!CONSENT_TYPES.includes(candidate.consentType)) {
    throw new Error(`consentRecord: consentType must be one of ${CONSENT_TYPES.join(", ")}`);
  }
  if (typeof candidate.granted !== "boolean") {
    throw new Error("consentRecord: granted must be a boolean");
  }
  if (typeof candidate.occurredAt !== "string" || candidate.occurredAt.length === 0) {
    throw new Error("consentRecord: occurredAt is required");
  }
  // The required terms_privacy consent must always be an explicit true --
  // "unchecked control" per OWNER_DECISIONS.md #5 means the SERVER never
  // defaults this to granted; the caller (invitation-accept.js) must have
  // received an explicit true from the client to reach this point at all.
  if (candidate.consentType === "terms_privacy" && candidate.granted !== true) {
    throw new Error("consentRecord: terms_privacy consent must be explicitly granted (true) -- it is a required gate, never inferred");
  }
  if (candidate.consentType === "terms_privacy" && (!candidate.termsVersion || !candidate.privacyVersion)) {
    throw new Error("consentRecord: terms_privacy consent must record both termsVersion and privacyVersion");
  }
}

module.exports = { CONSENT_TYPES, CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION, REQUIRED_CONSENT_WORDING, assertValidConsentRecord };
