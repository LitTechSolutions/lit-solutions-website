// F020 (triage), F021 (priority), F022 (assignment). Three related
// "record the outcome of an engine's decision against a ticket"
// concerns, persisted together since none is complex enough to warrant
// its own file. Each wraps the corresponding pure engine from Sessions 3:
// triageEngine.classifyTicket(), priorityScoring.scorePriority(),
// assignmentQueue.selectAssignee() -- this module never classifies,
// scores, or selects itself.

const { getSql } = require("./pgClient");
const { classifyTicket } = require("../policy/triageEngine");
const { scorePriority } = require("../policy/priorityScoring");
const { selectAssignee } = require("../policy/assignmentQueue");

// F020 -- Triage
/**
 * @param {import("../domain/triage").TriageRule[]} rules
 * @param {import("../domain/ticket").Ticket} ticket
 * @param {{ sql?: Function, now?: () => Date }} [deps]
 * @returns {Promise<import("../domain/triage").TriageResult>}
 */
async function recordTriageResult(rules, ticket, deps = {}) {
  const sql = deps.sql || getSql();
  const result = classifyTicket(rules, ticket, deps); // throws if nothing matches -- see triageEngine.js
  await sql`
    INSERT INTO triage_results (ticket_id, queue, matched_rule_id, decided_at)
    VALUES (${result.ticketId}, ${result.queue}, ${result.matchedRuleId}, ${result.decidedAt})
    ON CONFLICT (ticket_id) DO UPDATE SET queue = EXCLUDED.queue, matched_rule_id = EXCLUDED.matched_rule_id, decided_at = EXCLUDED.decided_at
  `;
  return result;
}

// F021 -- Priority
/**
 * @param {string} ticketId
 * @param {import("../domain/priority").PriorityInputs} inputs
 * @param {{ sql?: Function, weights?: object, thresholds?: object, now?: () => Date }} [deps]
 * @returns {Promise<import("../domain/priority").PriorityAssessment>}
 */
async function recordPriorityAssessment(ticketId, inputs, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const scored = scorePriority(inputs, deps);
  const assessment = { ticketId, level: scored.level, score: scored.score, decidedAt: now().toISOString() };

  await sql`
    INSERT INTO priority_assessments (ticket_id, level, score, decided_at)
    VALUES (${assessment.ticketId}, ${assessment.level}, ${assessment.score}, ${assessment.decidedAt})
    ON CONFLICT (ticket_id) DO UPDATE SET level = EXCLUDED.level, score = EXCLUDED.score, decided_at = EXCLUDED.decided_at
  `;
  return assessment;
}

// F022 -- Assignment
/**
 * @param {import("../domain/assignment").TechnicianCandidate[]} candidates
 * @param {string} organizationId
 * @param {string} ticketId
 * @param {string} assignedBy
 * @param {{ sql?: Function, now?: () => Date }} [deps]
 * @returns {Promise<import("../domain/assignment").Assignment>}
 */
async function recordAssignment(candidates, organizationId, ticketId, assignedBy, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const selection = selectAssignee(candidates, organizationId);
  if (!selection.technicianUserId) {
    throw new Error(`recordAssignment: ${selection.reason}`);
  }
  const assignment = { ticketId, technicianUserId: selection.technicianUserId, assignedAt: now().toISOString(), assignedBy };

  await sql`
    INSERT INTO assignments (ticket_id, technician_user_id, assigned_at, assigned_by)
    VALUES (${assignment.ticketId}, ${assignment.technicianUserId}, ${assignment.assignedAt}, ${assignment.assignedBy})
    ON CONFLICT (ticket_id) DO UPDATE SET technician_user_id = EXCLUDED.technician_user_id, assigned_at = EXCLUDED.assigned_at, assigned_by = EXCLUDED.assigned_by
  `;
  return assignment;
}

/**
 * Read path for F022, used by the endpoint layer to verify a technician
 * is genuinely assigned to a ticket before allowing "assigned"-gated
 * actions (rbac.js's technician org-scope check) -- never trust a
 * client-supplied assignment claim.
 *
 * @param {string} ticketId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<string | null>} technician_user_id, or null if unassigned
 */
async function getAssignedTechnician(ticketId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT technician_user_id FROM assignments WHERE ticket_id = ${ticketId}`;
  return rows.length > 0 ? rows[0].technician_user_id : null;
}

module.exports = { recordTriageResult, recordPriorityAssessment, recordAssignment, getAssignedTechnician };
