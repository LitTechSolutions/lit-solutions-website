// F051 -- Admin Operations Dashboard & Work Queue. Staff-facing sibling
// of F009's dashboardViewModel.js -- same "assemble already-authorized
// data slices into a display-ready summary, fetch nothing" pattern, but
// intentionally cross-organization (this is the one view in the whole
// system that's SUPPOSED to span every org, per rbac.js's platform_admin/
// technician capabilities) rather than single-org-scoped.

const { STATUSES: TICKET_STATUSES } = require("../domain/ticket");

const OPEN_TICKET_STATUSES = new Set(["submitted", "triaged", "assigned", "in_progress", "waiting_on_customer", "reopened"]);
const PRIORITY_LEVELS = ["critical", "high", "medium", "low"];

/**
 * @typedef {Object} WorkQueueViewModel
 * @property {Record<import("../domain/priority").PriorityLevel, import("../domain/ticket").Ticket[]>} openTicketsByPriority
 * @property {number} totalOpenTickets
 * @property {number} pendingApprovalCount
 * @property {number} paymentsNeedingReconciliation
 * @property {number} openIncidentCount
 */

/**
 * @param {{
 *   tickets: (import("../domain/ticket").Ticket & { priorityLevel?: import("../domain/priority").PriorityLevel })[],
 *   approvals: import("../domain/approval").ApprovalRequest[],
 *   paymentRequests: import("../domain/paymentRequest").PaymentRequest[],
 *   incidentStatuses: string[],
 * }} input
 * @returns {WorkQueueViewModel}
 */
function assembleWorkQueue(input) {
  const { tickets = [], approvals = [], paymentRequests = [], incidentStatuses = [] } = input || {};

  const openTicketsByPriority = { critical: [], high: [], medium: [], low: [] };
  let totalOpenTickets = 0;
  for (const ticket of tickets) {
    if (!TICKET_STATUSES.includes(ticket.status)) {
      throw new Error(`assembleWorkQueue: ticket "${ticket.id}" has an invalid status`);
    }
    if (!OPEN_TICKET_STATUSES.has(ticket.status)) continue;
    totalOpenTickets += 1;
    // Tickets without a priority assessment yet are treated as the
    // highest priority for triage-queue purposes -- fail toward visibility,
    // not toward a ticket silently sitting unprioritized at the bottom.
    const level = PRIORITY_LEVELS.includes(ticket.priorityLevel) ? ticket.priorityLevel : "critical";
    openTicketsByPriority[level].push(ticket);
  }

  const pendingApprovalCount = approvals.filter((a) => a.status === "pending").length;
  const paymentsNeedingReconciliation = paymentRequests.filter((p) => p.status === "reconciliation_pending" || p.status === "paid").length;
  const openIncidentCount = incidentStatuses.filter((status) => status === "down" || status === "investigating").length;

  return { openTicketsByPriority, totalOpenTickets, pendingApprovalCount, paymentsNeedingReconciliation, openIncidentCount };
}

module.exports = { assembleWorkQueue, OPEN_TICKET_STATUSES, PRIORITY_LEVELS };
