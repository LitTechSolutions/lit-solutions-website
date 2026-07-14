// F017 -- Unified Activity Timeline. Pure merge/permission-filter/sort
// over already-fetched ActivityEvent arrays from multiple sources (F010
// projects, F019 tickets, F016 approvals, F014 documents, F028 payments).
// Does not fetch anything itself -- callers gather per-source arrays
// (each already organization-scoped by its own authorization layer) and
// hand them here for merging into one customer- or staff-facing view.

const CUSTOMER_FACING_ROLES = new Set(["org_owner", "org_member", "read_only_customer"]);

// SYS-API-005: never return unbounded datasets.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * @param {import("../domain/activityEvent").ActivityEvent[][]} eventSources - One array per source; will be flattened.
 * @param {{ organizationId: string, viewerRole: string, limit?: number }} options
 * @returns {import("../domain/activityEvent").ActivityEvent[]}
 */
function buildTimeline(eventSources, options) {
  if (!options || typeof options.organizationId !== "string") {
    throw new Error("buildTimeline: organizationId is required");
  }
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const isCustomerFacing = CUSTOMER_FACING_ROLES.has(options.viewerRole);

  const merged = eventSources
    .flat()
    .filter((event) => event.organizationId === options.organizationId)
    .filter((event) => !isCustomerFacing || event.customerVisible === true)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return merged.slice(0, limit);
}

module.exports = { buildTimeline, DEFAULT_LIMIT, MAX_LIMIT };
