// F028 -- Payment Request & Payment Status Reconciliation (payment
// TIMING half). Unlike src/policy/pricingEngine.js and other "engine,
// not policy" modules elsewhere in this codebase, the numbers here ARE
// approved business policy, not engineering defaults -- Dylan provided
// them directly (2026-07-14), reproduced verbatim in OWNER_DECISIONS.md
// #2. Do not adjust DEPOSIT_THRESHOLD or DEPOSIT_RATE without a new
// explicit owner decision, the same way the primary-data-store or
// pricing decisions were made.

const DEPOSIT_THRESHOLD = 500; // dollars -- work at or above this requires a deposit, not full payment upfront.
const DEPOSIT_RATE = 0.5;

/**
 * @typedef {Object} ScheduledPayment
 * @property {"full" | "deposit" | "balance"} label
 * @property {number} amount
 * @property {"upon_approval" | "before_work_begins" | "upon_completion"} dueWhen
 */

/**
 * @typedef {Object} PaymentSchedule
 * @property {"full_upfront" | "deposit_balance"} scheduleType
 * @property {ScheduledPayment[]} payments
 * @property {string} reason
 */

/**
 * @param {number} totalAmount - Dollars.
 * @param {{ isThirdPartyExpense?: boolean }} [options] - Hardware, software licenses, paid integrations, subscriptions, and other third-party expenses always require full upfront payment regardless of amount, per Dylan's policy.
 * @returns {PaymentSchedule}
 */
function determinePaymentSchedule(totalAmount, options = {}) {
  if (typeof totalAmount !== "number" || totalAmount <= 0) {
    throw new Error("determinePaymentSchedule: totalAmount must be a positive number");
  }

  if (options.isThirdPartyExpense) {
    return {
      scheduleType: "full_upfront",
      payments: [{ label: "full", amount: totalAmount, dueWhen: "before_work_begins" }],
      reason: "third-party expenses (hardware, licenses, paid integrations, subscriptions) are always paid upfront",
    };
  }

  if (totalAmount < DEPOSIT_THRESHOLD) {
    return {
      scheduleType: "full_upfront",
      payments: [{ label: "full", amount: totalAmount, dueWhen: "upon_approval" }],
      reason: `work priced below $${DEPOSIT_THRESHOLD} is paid in full upfront after quote approval`,
    };
  }

  const deposit = round2(totalAmount * DEPOSIT_RATE);
  const balance = round2(totalAmount - deposit);
  return {
    scheduleType: "deposit_balance",
    payments: [
      { label: "deposit", amount: deposit, dueWhen: "before_work_begins" },
      { label: "balance", amount: balance, dueWhen: "upon_completion" },
    ],
    reason: `work priced at $${DEPOSIT_THRESHOLD} or more requires a 50% deposit before work begins, balance due upon completion and before publication/deployment/final handoff`,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { determinePaymentSchedule, DEPOSIT_THRESHOLD, DEPOSIT_RATE };
