// Domain type for F048 (Warranty, License & Device Lifecycle Reminders).

/**
 * @typedef {"warranty" | "license"} ReminderSubjectType
 */

/**
 * @typedef {Object} LifecycleReminder
 * @property {string} id
 * @property {string} organizationId
 * @property {string} assetId
 * @property {ReminderSubjectType} subjectType
 * @property {string} expiresAt
 * @property {boolean} sent
 */

const SUBJECT_TYPES = ["warranty", "license"];

/**
 * @param {Partial<LifecycleReminder>} candidate
 * @returns {asserts candidate is LifecycleReminder}
 */
function assertValidLifecycleReminder(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("lifecycleReminder: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("lifecycleReminder: id is required");
  if (typeof candidate.assetId !== "string" || candidate.assetId.length === 0) throw new Error("lifecycleReminder: assetId is required");
  if (!SUBJECT_TYPES.includes(candidate.subjectType)) throw new Error(`lifecycleReminder: subjectType must be one of ${SUBJECT_TYPES.join(", ")}`);
  if (typeof candidate.expiresAt !== "string") throw new Error("lifecycleReminder: expiresAt is required");
}

module.exports = { SUBJECT_TYPES, assertValidLifecycleReminder };
