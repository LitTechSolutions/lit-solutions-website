// Domain type for F025 (Internal Notes, Time & Cost Tracking) -- the time
// and note halves only. Cost/profitability fields are deliberately absent:
// they require billing rates, which are pricing (OWNER_DECISIONS.md #2,
// blocked) -- see src/tracking/timeTracking.js for duration aggregation
// with no dollar amounts anywhere.

/**
 * @typedef {Object} TimeEntry
 * @property {string} id
 * @property {string} ticketId
 * @property {string} technicianUserId
 * @property {number} minutes
 * @property {string} recordedAt
 * @property {string} [note]
 */

/**
 * @typedef {Object} InternalNote
 * @property {string} id
 * @property {string} ticketId
 * @property {string} authorUserId
 * @property {string} body
 * @property {string} createdAt
 * @property {boolean} customerVisible - Always false in practice for this type (that's what makes it "internal"); modeled explicitly so a serialization bug can't accidentally leak one to a customer-visible view.
 */

/**
 * @param {Partial<TimeEntry>} candidate
 * @returns {asserts candidate is TimeEntry}
 */
function assertValidTimeEntry(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("timeEntry: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("timeEntry: id is required");
  if (typeof candidate.ticketId !== "string" || candidate.ticketId.length === 0) throw new Error("timeEntry: ticketId is required");
  if (typeof candidate.technicianUserId !== "string" || candidate.technicianUserId.length === 0) {
    throw new Error("timeEntry: technicianUserId is required");
  }
  if (typeof candidate.minutes !== "number" || candidate.minutes <= 0) throw new Error("timeEntry: minutes must be a positive number");
}

/**
 * @param {Partial<InternalNote>} candidate
 * @returns {asserts candidate is InternalNote}
 */
function assertValidInternalNote(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("internalNote: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("internalNote: id is required");
  if (typeof candidate.ticketId !== "string" || candidate.ticketId.length === 0) throw new Error("internalNote: ticketId is required");
  if (typeof candidate.body !== "string" || candidate.body.trim().length === 0) throw new Error("internalNote: body is required");
  if (candidate.customerVisible !== false) {
    throw new Error("internalNote: customerVisible must be false -- use activityEvent.js for anything customer-facing");
  }
}

module.exports = { assertValidTimeEntry, assertValidInternalNote };
