// F052 -- Subscription & Billing Plan Management (lifecycle half; no
// billing cadence/price logic -- that's F050/plan terms, blocked).

const { STATUSES } = require("../domain/subscription");

const ALLOWED_TRANSITIONS = {
  active: new Set(["paused", "cancelled"]),
  paused: new Set(["active", "cancelled"]),
  cancelled: new Set([]), // terminal -- a cancelled subscription is re-subscribed as a new record, not reactivated in place
};

/**
 * @param {import("../domain/subscription").SubscriptionStatus} currentStatus
 * @param {import("../domain/subscription").SubscriptionStatus} nextStatus
 * @returns {{ allowed: boolean, reason: string }}
 */
function transitionSubscriptionStatus(currentStatus, nextStatus) {
  if (!STATUSES.includes(currentStatus) || !STATUSES.includes(nextStatus)) {
    return { allowed: false, reason: "unknown subscription status" };
  }
  if (!ALLOWED_TRANSITIONS[currentStatus].has(nextStatus)) {
    return { allowed: false, reason: `cannot move from "${currentStatus}" to "${nextStatus}"` };
  }
  return { allowed: true, reason: `"${currentStatus}" -> "${nextStatus}" is a legal transition` };
}

module.exports = { transitionSubscriptionStatus, ALLOWED_TRANSITIONS };
