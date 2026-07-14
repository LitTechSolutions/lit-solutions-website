// Domain type for F048 (Warranty, License & Device Lifecycle Reminders)
// AND F037 (Domain, SSL & Subscription Renewal Tracking) -- both are
// "track an expiration date, remind before it lapses" per their
// objectives, so they share one type and one engine
// (src/reminders/lifecycleReminders.js) rather than two implementations.
// `subjectId` is deliberately generic (a TechnologyAsset for F048, a
// WebsiteProfile for F037) rather than named `assetId`, since the same
// reminder shape now serves both.

/**
 * @typedef {"warranty" | "license" | "domain" | "ssl_certificate" | "subscription"} ReminderSubjectType
 */

/**
 * @typedef {Object} LifecycleReminder
 * @property {string} id
 * @property {string} organizationId
 * @property {string} subjectId - A TechnologyAsset id (F048) or WebsiteProfile id (F037).
 * @property {ReminderSubjectType} subjectType
 * @property {string} expiresAt
 * @property {boolean} sent
 */

const SUBJECT_TYPES = ["warranty", "license", "domain", "ssl_certificate", "subscription"];

/**
 * @param {Partial<LifecycleReminder>} candidate
 * @returns {asserts candidate is LifecycleReminder}
 */
function assertValidLifecycleReminder(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("lifecycleReminder: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("lifecycleReminder: id is required");
  if (typeof candidate.subjectId !== "string" || candidate.subjectId.length === 0) throw new Error("lifecycleReminder: subjectId is required");
  if (!SUBJECT_TYPES.includes(candidate.subjectType)) throw new Error(`lifecycleReminder: subjectType must be one of ${SUBJECT_TYPES.join(", ")}`);
  if (typeof candidate.expiresAt !== "string") throw new Error("lifecycleReminder: expiresAt is required");
}

module.exports = { SUBJECT_TYPES, assertValidLifecycleReminder };
