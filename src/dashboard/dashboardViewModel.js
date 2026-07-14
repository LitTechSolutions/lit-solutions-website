// F009 -- Customer Dashboard. Pure view-model assembler: takes
// already-fetched, already-organization-scoped data slices (each
// authorized by its own domain, per SYS-AUTH-007 -- a dashboard is not a
// bypass of per-record authorization) and shapes them into a single
// display-ready summary. Fetches nothing itself.
//
// Deliberately omits plan-usage data: F009 depends on F049 (Service Plan,
// Entitlement & Usage Tracking), which is blocked on the plan-limits owner
// decision (OWNER_DECISIONS.md #3). The view model surfaces that as an
// explicit `planUsage: null` with a reason, rather than a fake/zero value
// that could be misread as "no plan" or "no usage."

/**
 * @typedef {Object} DashboardViewModel
 * @property {string} organizationId
 * @property {number} activeServiceCount
 * @property {import("../domain/serviceRecord").ServiceRecord[]} servicesNeedingAttention - status: "on_hold".
 * @property {number} pendingApprovalCount
 * @property {import("../domain/approval").ApprovalRequest[]} pendingApprovals
 * @property {import("../domain/activityEvent").ActivityEvent[]} recentActivity
 * @property {number} unreadNotificationCount
 * @property {null} planUsage
 * @property {string} planUsageUnavailableReason
 */

/**
 * @param {{
 *   organizationId: string,
 *   services: import("../domain/serviceRecord").ServiceRecord[],
 *   approvals: import("../domain/approval").ApprovalRequest[],
 *   recentActivity: import("../domain/activityEvent").ActivityEvent[],
 *   unreadNotificationCount: number,
 * }} input
 * @returns {DashboardViewModel}
 */
function assembleDashboard(input) {
  if (!input || typeof input.organizationId !== "string" || input.organizationId.length === 0) {
    throw new Error("assembleDashboard: organizationId is required");
  }
  const { organizationId, services = [], approvals = [], recentActivity = [], unreadNotificationCount = 0 } = input;

  for (const [label, records] of [
    ["services", services],
    ["approvals", approvals],
    ["recentActivity", recentActivity],
  ]) {
    const foreign = records.find((record) => record.organizationId !== organizationId);
    if (foreign) {
      throw new Error(`assembleDashboard: ${label} contains a record from a different organization (${foreign.organizationId}) -- caller failed to scope its query`);
    }
  }

  const activeServices = services.filter((s) => s.status === "active");
  const servicesNeedingAttention = services.filter((s) => s.status === "on_hold");
  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  return {
    organizationId,
    activeServiceCount: activeServices.length,
    servicesNeedingAttention,
    pendingApprovalCount: pendingApprovals.length,
    pendingApprovals,
    recentActivity,
    unreadNotificationCount,
    planUsage: null,
    planUsageUnavailableReason: "F049 (Service Plan, Entitlement & Usage Tracking) is blocked on the plan-limits owner decision -- see OWNER_DECISIONS.md #3",
  };
}

module.exports = { assembleDashboard };
