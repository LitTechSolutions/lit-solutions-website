// Domain type for F026 (Scope of Work & Estimate Generation). No dollar
// amounts are computed by this type or its validator -- line items carry
// a `priceRef` (an opaque pointer into whatever F050 pricing engine
// output produced the estimate) rather than a raw number, since actual
// prices are blocked (OWNER_DECISIONS.md #2).

/**
 * @typedef {Object} ScopeLineItem
 * @property {string} description
 * @property {number} quantity
 * @property {string} priceRef - Opaque reference to a F050 pricing computation, not a raw dollar amount.
 */

/**
 * @typedef {"draft" | "sent" | "superseded"} ScopeStatus
 * "superseded" -- a new version was created; the old version is retained
 * for history, never deleted (SYS-NFR-011: versioned records are never
 * silently overwritten).
 */

/**
 * @typedef {Object} ScopeOfWork
 * @property {string} id
 * @property {string} organizationId
 * @property {string} ticketId
 * @property {number} version
 * @property {ScopeStatus} status
 * @property {string[]} assumptions
 * @property {string[]} exclusions
 * @property {ScopeLineItem[]} lineItems
 * @property {string} createdAt
 * @property {string} createdBy
 */

const STATUSES = ["draft", "sent", "superseded"];

/**
 * @param {Partial<ScopeOfWork>} candidate
 * @returns {asserts candidate is ScopeOfWork}
 */
function assertValidScopeOfWork(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("scopeOfWork: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("scopeOfWork: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("scopeOfWork: organizationId is required");
  }
  if (typeof candidate.ticketId !== "string" || candidate.ticketId.length === 0) throw new Error("scopeOfWork: ticketId is required");
  if (typeof candidate.version !== "number" || candidate.version < 1) throw new Error("scopeOfWork: version must be a positive number");
  if (!STATUSES.includes(candidate.status)) throw new Error(`scopeOfWork: status must be one of ${STATUSES.join(", ")}`);
  if (!Array.isArray(candidate.lineItems) || candidate.lineItems.length === 0) {
    throw new Error("scopeOfWork: lineItems must be a non-empty array");
  }
  for (const item of candidate.lineItems) {
    if (typeof item.priceRef !== "string" || item.priceRef.length === 0) {
      throw new Error("scopeOfWork: every line item needs a priceRef (not a raw dollar amount -- pricing is blocked, OWNER_DECISIONS.md #2)");
    }
  }
}

module.exports = { STATUSES, assertValidScopeOfWork };
