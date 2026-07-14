// F022 -- Ticket Assignment & Technician Work Queue. Pure candidate
// selection: given a pool of technicians and an organization, pick the
// least-loaded technician explicitly assigned to that organization.
// Mirrors rbac.js's `assigned` contract -- a technician not explicitly
// assigned to an organization is never eligible, matching SYS-AUTH-003's
// "organization ownership path checked on every action" even for
// read/assignment operations, not just customer-initiated ones.

const { assertValidTechnicianCandidate } = require("../domain/assignment");

/**
 * @param {import("../domain/assignment").TechnicianCandidate[]} candidates
 * @param {string} organizationId
 * @returns {{ technicianUserId: string | null, reason: string }}
 */
function selectAssignee(candidates, organizationId) {
  if (!Array.isArray(candidates)) {
    throw new Error("selectAssignee: candidates must be an array");
  }
  for (const candidate of candidates) assertValidTechnicianCandidate(candidate);

  const eligible = candidates.filter(
    (candidate) => candidate.available && candidate.organizationAssignments.includes(organizationId)
  );

  if (eligible.length === 0) {
    return { technicianUserId: null, reason: `no available technician is explicitly assigned to organization "${organizationId}"` };
  }

  const leastLoaded = eligible.reduce((best, candidate) => (candidate.openTicketCount < best.openTicketCount ? candidate : best));

  return { technicianUserId: leastLoaded.userId, reason: `least-loaded eligible technician (${leastLoaded.openTicketCount} open tickets)` };
}

module.exports = { selectAssignee };
