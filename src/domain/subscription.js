// Domain type for F052 (Subscription & Billing Plan Management). Plan
// terms (what's included, price, cadence) are owner-decided and blocked
// (OWNER_DECISIONS.md #2, #3) -- this models the subscription's lifecycle
// state only, not its terms.

/**
 * @typedef {"active" | "paused" | "cancelled"} SubscriptionStatus
 */

/**
 * @typedef {Object} Subscription
 * @property {string} id
 * @property {string} organizationId
 * @property {string} planKey - Opaque plan identifier, terms sourced elsewhere once approved.
 * @property {SubscriptionStatus} status
 * @property {string} startedAt
 * @property {string} [pausedAt]
 * @property {string} [cancelledAt]
 * @property {string} [providerSubscriptionReference] - Square (or successor) subscription reference, once integrated.
 */

const STATUSES = ["active", "paused", "cancelled"];

/**
 * @param {Partial<Subscription>} candidate
 * @returns {asserts candidate is Subscription}
 */
function assertValidSubscription(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("subscription: expected an object");
  if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error("subscription: id is required");
  if (typeof candidate.organizationId !== "string" || candidate.organizationId.length === 0) {
    throw new Error("subscription: organizationId is required");
  }
  if (typeof candidate.planKey !== "string" || candidate.planKey.length === 0) throw new Error("subscription: planKey is required");
  if (!STATUSES.includes(candidate.status)) throw new Error(`subscription: status must be one of ${STATUSES.join(", ")}`);
}

module.exports = { STATUSES, assertValidSubscription };
