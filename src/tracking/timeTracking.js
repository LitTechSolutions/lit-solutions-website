// F025 -- Internal Notes, Time & Cost Tracking (time half only). No
// dollar amounts anywhere in this module: cost/profitability requires
// billing rates, which are pricing (OWNER_DECISIONS.md #2, blocked).
// This aggregates durations only -- converting minutes to cost is
// deferred until pricing is decided.

const { assertValidTimeEntry } = require("../domain/workLog");

/**
 * @param {import("../domain/workLog").TimeEntry[]} entries
 * @param {string} ticketId
 * @returns {number} total minutes logged against this ticket.
 */
function totalMinutesForTicket(entries, ticketId) {
  for (const entry of entries) assertValidTimeEntry(entry);
  return entries.filter((entry) => entry.ticketId === ticketId).reduce((sum, entry) => sum + entry.minutes, 0);
}

/**
 * @param {import("../domain/workLog").TimeEntry[]} entries
 * @returns {Record<string, number>} minutes logged per technician, across whatever tickets were passed in.
 */
function minutesByTechnician(entries) {
  for (const entry of entries) assertValidTimeEntry(entry);
  const totals = {};
  for (const entry of entries) {
    totals[entry.technicianUserId] = (totals[entry.technicianUserId] || 0) + entry.minutes;
  }
  return totals;
}

module.exports = { totalMinutesForTicket, minutesByTechnician };
