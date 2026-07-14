// F051 -- Admin Operations Dashboard & Work Queue. Cross-organization
// query (the one legitimate cross-org read in this codebase, matching
// rbac.js's platform_admin/technician capabilities -- see
// workQueueViewModel.js's own comment) feeding the existing pure
// src/admin/workQueueViewModel.js assembler. This module fetches; it
// never decides what counts as "open" or "needing reconciliation" --
// that logic lives entirely in the assembler.

const { getSql } = require("./pgClient");
const { assembleWorkQueue } = require("../admin/workQueueViewModel");

/**
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../admin/workQueueViewModel").WorkQueueViewModel>}
 */
async function fetchWorkQueue(deps = {}) {
  const sql = deps.sql || getSql();

  const [ticketRows, approvalRows, paymentRows, incidentRows] = await Promise.all([
    sql`
      SELECT t.*, pa.level AS priority_level
      FROM tickets t
      LEFT JOIN priority_assessments pa ON pa.ticket_id = t.id
    `,
    sql`SELECT * FROM approval_requests`,
    sql`SELECT * FROM payment_requests`,
    sql`SELECT DISTINCT ON (website_profile_id) status FROM incident_records ORDER BY website_profile_id, updated_at DESC`,
  ]);

  const tickets = ticketRows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    category: row.category,
    subject: row.subject,
    description: row.description,
    status: row.status,
    submittedAt: new Date(row.submitted_at).toISOString(),
    submittedBy: row.submitted_by,
    updatedAt: new Date(row.updated_at).toISOString(),
    version: row.version,
    ...(row.priority_level ? { priorityLevel: row.priority_level } : {}),
  }));
  const approvals = approvalRows.map((row) => ({ id: row.id, organizationId: row.organization_id, subjectType: row.subject_type, subjectId: row.subject_id, status: row.status, requestedAt: row.requested_at, requestedBy: row.requested_by, expiresAt: row.expires_at }));
  const paymentRequests = paymentRows.map((row) => ({ id: row.id, organizationId: row.organization_id, amountRef: row.amount_ref, status: row.status }));
  const incidentStatuses = incidentRows.map((row) => row.status);

  return assembleWorkQueue({ tickets, approvals, paymentRequests, incidentStatuses });
}

module.exports = { fetchWorkQueue };
