// F049 -- Service Plan, Entitlement & Usage Tracking. Generic
// usage-vs-limit comparator: takes the limit as caller-supplied
// configuration (ultimately sourced from F056 settings once Dylan
// approves actual plan terms, OWNER_DECISIONS.md #3) rather than
// hardcoding any plan's actual numbers.

const { assertValidEntitlementLimit } = require("../domain/entitlement");

/**
 * @param {import("../domain/entitlement").EntitlementLimit} limit
 * @param {number} currentlyConsumed
 * @returns {{ withinLimit: boolean, remaining: number | null, reason: string }}
 */
function checkEntitlement(limit, currentlyConsumed) {
  assertValidEntitlementLimit(limit);
  if (typeof currentlyConsumed !== "number" || currentlyConsumed < 0) {
    throw new Error("checkEntitlement: currentlyConsumed must be a non-negative number");
  }

  if (limit.resetPeriod === "unlimited") {
    return { withinLimit: true, remaining: null, reason: `"${limit.usageKey}" is unlimited on plan "${limit.planKey}"` };
  }

  const remaining = limit.limit - currentlyConsumed;
  const withinLimit = remaining > 0;

  return {
    withinLimit,
    remaining: Math.max(remaining, 0),
    reason: withinLimit
      ? `${remaining} of ${limit.limit} "${limit.usageKey}" remaining on plan "${limit.planKey}"`
      : `"${limit.usageKey}" limit (${limit.limit}) reached on plan "${limit.planKey}" -- ${currentlyConsumed} consumed`,
  };
}

module.exports = { checkEntitlement };
