// F048 -- Warranty, License & Device Lifecycle Reminders. Threshold is an
// engineering default (like fileValidation.js's size limit and
// ticketLifecycle.js's reopen window), not an owner-approved notice
// period -- exposed as a parameter.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_THRESHOLD_DAYS = 30;

/**
 * @param {import("../domain/lifecycleReminder").LifecycleReminder} reminder
 * @param {Date} now
 * @param {number} [thresholdDays]
 * @returns {{ shouldSend: boolean, daysUntilExpiry: number, reason: string }}
 */
function evaluateReminder(reminder, now, thresholdDays = DEFAULT_THRESHOLD_DAYS) {
  const daysUntilExpiry = Math.round((new Date(reminder.expiresAt).getTime() - now.getTime()) / MS_PER_DAY);

  if (reminder.sent) {
    return { shouldSend: false, daysUntilExpiry, reason: "reminder already sent (single-shot, per the sent flag)" };
  }
  if (daysUntilExpiry > thresholdDays) {
    return { shouldSend: false, daysUntilExpiry, reason: `${daysUntilExpiry} days remaining, outside the ${thresholdDays}-day reminder window` };
  }
  return { shouldSend: true, daysUntilExpiry, reason: `within the ${thresholdDays}-day reminder window (${daysUntilExpiry} days remaining)` };
}

module.exports = { evaluateReminder, DEFAULT_THRESHOLD_DAYS };
