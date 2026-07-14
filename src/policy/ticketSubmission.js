// F019 -- Support & Change Ticket Submission. Pure intake shaping and
// validation: the minimum required fields plus an open `details` bag for
// category-specific optional context. Deliberately does NOT check plan
// entitlement (that's F049, blocked, OWNER_DECISIONS.md #3) -- submission
// itself should never be blocked by entitlement; entitlement affects
// what happens after triage, not whether a customer can ask.
//
// Rejects placeholder-junk values in optional fields on purpose: this is
// a direct, testable fix for the open audit finding F018 ("Intake form's
// 'just type 4' instruction") -- per the master instruction's UX
// requirements, optional/conditional fields should be omitted, not filled
// with a placeholder. If a field isn't applicable, leave it out of
// `details` entirely rather than sending "n/a"/"4"/"none"/"-".

const crypto = require("node:crypto");
const { CATEGORIES, assertValidTicket } = require("../domain/ticket");

const PLACEHOLDER_JUNK_VALUES = new Set(["n/a", "na", "none", "4", "-", "x", "tbd"]);

/**
 * @typedef {Object} TicketSubmissionInput
 * @property {string} organizationId
 * @property {import("../domain/ticket").TicketCategory} category
 * @property {string} subject
 * @property {string} description
 * @property {string} submittedBy
 * @property {Record<string, string>} [details] - Optional category-specific context. Omit fields that don't apply -- never fill with a placeholder.
 */

/**
 * @param {TicketSubmissionInput} input
 * @param {{ now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {import("../domain/ticket").Ticket & { details?: Record<string, string> }}
 */
function shapeTicketSubmission(input, deps = {}) {
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  if (!input || typeof input !== "object") {
    throw new Error("ticketSubmission: expected an object");
  }
  if (!CATEGORIES.includes(input.category)) {
    throw new Error(`ticketSubmission: category must be one of ${CATEGORIES.join(", ")}`);
  }
  if (typeof input.subject !== "string" || input.subject.trim().length === 0) {
    throw new Error("ticketSubmission: subject is required");
  }
  if (typeof input.description !== "string" || input.description.trim().length === 0) {
    throw new Error("ticketSubmission: description is required");
  }
  if (typeof input.organizationId !== "string" || input.organizationId.length === 0) {
    throw new Error("ticketSubmission: organizationId is required");
  }
  if (typeof input.submittedBy !== "string" || input.submittedBy.length === 0) {
    throw new Error("ticketSubmission: submittedBy is required");
  }

  if (input.details) {
    for (const [field, value] of Object.entries(input.details)) {
      if (typeof value !== "string") {
        throw new Error(`ticketSubmission: details.${field} must be a string`);
      }
      if (PLACEHOLDER_JUNK_VALUES.has(value.trim().toLowerCase())) {
        throw new Error(
          `ticketSubmission: details.${field} contains a placeholder value ("${value}") -- omit the field instead of filling it with a placeholder (audit finding F018)`
        );
      }
    }
  }

  const timestamp = now().toISOString();
  const ticket = {
    id: idGenerator(),
    organizationId: input.organizationId,
    category: input.category,
    subject: input.subject.trim(),
    description: input.description.trim(),
    status: "submitted",
    submittedAt: timestamp,
    submittedBy: input.submittedBy,
    updatedAt: timestamp,
    version: 1,
  };
  assertValidTicket(ticket);

  return input.details ? { ...ticket, details: input.details } : ticket;
}

module.exports = { shapeTicketSubmission, PLACEHOLDER_JUNK_VALUES };
