// Domain type for F022 (Ticket Assignment & Technician Work Queue).

/**
 * @typedef {Object} TechnicianCandidate
 * @property {string} userId
 * @property {string[]} organizationAssignments - Organization IDs this technician is explicitly assigned to (matches rbac.js's `assigned` flag contract).
 * @property {number} openTicketCount - Current workload, for least-loaded assignment.
 * @property {boolean} available
 */

/**
 * @typedef {Object} Assignment
 * @property {string} ticketId
 * @property {string} technicianUserId
 * @property {string} assignedAt
 * @property {string} assignedBy
 */

/**
 * @param {Partial<TechnicianCandidate>} candidate
 * @returns {asserts candidate is TechnicianCandidate}
 */
function assertValidTechnicianCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("technicianCandidate: expected an object");
  if (typeof candidate.userId !== "string" || candidate.userId.length === 0) throw new Error("technicianCandidate: userId is required");
  if (!Array.isArray(candidate.organizationAssignments)) throw new Error("technicianCandidate: organizationAssignments must be an array");
  if (typeof candidate.openTicketCount !== "number" || candidate.openTicketCount < 0) {
    throw new Error("technicianCandidate: openTicketCount must be a non-negative number");
  }
  if (typeof candidate.available !== "boolean") throw new Error("technicianCandidate: available must be a boolean");
}

module.exports = { assertValidTechnicianCandidate };
