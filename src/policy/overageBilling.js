// F049/F050-adjacent -- overage billing for work beyond a plan's included
// monthly allowance. Rates are approved business policy (Dylan,
// 2026-07-14, see OWNER_DECISIONS.md #3), not engineering defaults.
//
// One explicit assumption, flagged rather than silently made: Dylan's
// policy states remote work is "billed in 15-minute increments" and
// on-site work has "a one-hour minimum," but doesn't say whether on-site
// time BEYOND that one-hour minimum also rounds to 15-minute increments.
// This module applies the same 15-minute rounding beyond the minimum for
// consistency with every other billed-time rule in the policy -- revisit
// with Dylan if that's wrong.

const BILLING_INCREMENT_MINUTES = 15;

const CARE_PLAN_OVERAGE_RATE_PER_HOUR = 85;
const IT_PLAN_REMOTE_OVERAGE_RATE_PER_HOUR = 95;
const IT_PLAN_ONSITE_RATE_PER_HOUR = 125;
const IT_PLAN_ONSITE_MINIMUM_HOURS = 1;

/**
 * Rounds up to the next billing increment -- standard practice for
 * time-based billing (a partial increment is billed as a full one).
 * @param {number} minutes
 * @returns {number}
 */
function roundUpToIncrement(minutes) {
  return Math.ceil(minutes / BILLING_INCREMENT_MINUTES) * BILLING_INCREMENT_MINUTES;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * F034/F048's Website Care Plan overage: $85/hr, 15-minute increments.
 * @param {number} minutesOverAllowance
 * @returns {{ billedMinutes: number, cost: number }}
 */
function calculateCarePlanOverage(minutesOverAllowance) {
  if (typeof minutesOverAllowance !== "number" || minutesOverAllowance < 0) {
    throw new Error("calculateCarePlanOverage: minutesOverAllowance must be a non-negative number");
  }
  if (minutesOverAllowance === 0) return { billedMinutes: 0, cost: 0 };
  const billedMinutes = roundUpToIncrement(minutesOverAllowance);
  return { billedMinutes, cost: round2((billedMinutes / 60) * CARE_PLAN_OVERAGE_RATE_PER_HOUR) };
}

/**
 * F044's IT Support Plan remote overage: $95/hr, 15-minute increments.
 * @param {number} minutesOverAllowance
 * @returns {{ billedMinutes: number, cost: number }}
 */
function calculateItPlanRemoteOverage(minutesOverAllowance) {
  if (typeof minutesOverAllowance !== "number" || minutesOverAllowance < 0) {
    throw new Error("calculateItPlanRemoteOverage: minutesOverAllowance must be a non-negative number");
  }
  if (minutesOverAllowance === 0) return { billedMinutes: 0, cost: 0 };
  const billedMinutes = roundUpToIncrement(minutesOverAllowance);
  return { billedMinutes, cost: round2((billedMinutes / 60) * IT_PLAN_REMOTE_OVERAGE_RATE_PER_HOUR) };
}

/**
 * F044's IT Support Plan on-site work: $125/hr, 1-hour minimum. Any
 * on-site visit is billed regardless of plan allowance (on-site isn't
 * part of either plan's included scope).
 * @param {number} minutesWorked
 * @returns {{ billedMinutes: number, cost: number }}
 */
function calculateItPlanOnsite(minutesWorked) {
  if (typeof minutesWorked !== "number" || minutesWorked <= 0) {
    throw new Error("calculateItPlanOnsite: minutesWorked must be a positive number");
  }
  const minimumMinutes = IT_PLAN_ONSITE_MINIMUM_HOURS * 60;
  const billedMinutes = Math.max(minimumMinutes, roundUpToIncrement(minutesWorked));
  return { billedMinutes, cost: round2((billedMinutes / 60) * IT_PLAN_ONSITE_RATE_PER_HOUR) };
}

module.exports = {
  calculateCarePlanOverage,
  calculateItPlanRemoteOverage,
  calculateItPlanOnsite,
  roundUpToIncrement,
  BILLING_INCREMENT_MINUTES,
  CARE_PLAN_OVERAGE_RATE_PER_HOUR,
  IT_PLAN_REMOTE_OVERAGE_RATE_PER_HOUR,
  IT_PLAN_ONSITE_RATE_PER_HOUR,
  IT_PLAN_ONSITE_MINIMUM_HOURS,
};
