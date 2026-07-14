// Domain type for F019 (Support & Change Ticket Submission) and the
// shared shape F020-F025/F029 operate on. Generic service-ticket states
// (submitted/triaged/assigned/...) are standard workflow-engineering
// vocabulary, not an invented business policy -- unlike pricing or plan
// terms, a ticket lifecycle shape doesn't require an owner decision to
// exist, only to be filled with real category/priority values later.

/**
 * @typedef {"website_change" | "it_support" | "question" | "other"} TicketCategory
 * Broad, requirements-derived categories from the Product Vision sheet's
 * "request website changes... technology support" framing -- not a
 * detailed classification taxonomy (that would need the missing F019/F020
 * workbooks, OWNER_DECISIONS.md #10).
 */

/**
 * @typedef {"submitted" | "triaged" | "assigned" | "in_progress" | "waiting_on_customer" | "resolved" | "closed" | "reopened"} TicketStatus
 */

/**
 * @typedef {Object} Ticket
 * @property {string} id
 * @property {string} organizationId
 * @property {TicketCategory} category
 * @property {string} subject
 * @property {string} description
 * @property {TicketStatus} status
 * @property {string} submittedAt
 * @property {string} submittedBy
 * @property {string} updatedAt
 * @property {number} version
 */

const CATEGORIES = ["website_change", "it_support", "question", "other"];
const STATUSES = [
  "submitted",
  "triaged",
  "assigned",
  "in_progress",
  "waiting_on_customer",
  "resolved",
  "closed",
  "reopened",
];

/**
 * @param {Partial<Ticket>} candidate
 * @returns {asserts candidate is Ticket}
 */
function assertValidTicket(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("ticket: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("ticket: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("ticket: organizationId is required");
  }
  if (!CATEGORIES.includes(candidate.category)) throw new Error(`ticket: category must be one of ${CATEGORIES.join(", ")}`);
  if (typeof candidate.subject !== "string" || candidate.subject.trim().length === 0) throw new Error("ticket: subject is required");
  if (!STATUSES.includes(candidate.status)) throw new Error(`ticket: status must be one of ${STATUSES.join(", ")}`);
}

module.exports = { CATEGORIES, STATUSES, assertValidTicket };
