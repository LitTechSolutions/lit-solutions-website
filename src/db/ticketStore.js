// F019/F023/F029 -- Ticket Submission & Lifecycle. Postgres persistence
// wired to the existing pure logic: creation goes through
// src/policy/ticketSubmission.js (which rejects placeholder-junk values,
// fixing audit finding F018), status changes go through
// src/policy/ticketLifecycle.js's state machine -- this module never
// decides what's legal, it only persists what the pure functions allow.

const { getSql } = require("./pgClient");
const { shapeTicketSubmission } = require("../policy/ticketSubmission");
const { transitionTicketStatus } = require("../policy/ticketLifecycle");

/**
 * @param {import("../policy/ticketSubmission").TicketSubmissionInput} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/ticket").Ticket>}
 */
async function createTicket(input, deps = {}) {
  const sql = deps.sql || getSql();
  const ticket = shapeTicketSubmission(input, deps); // validation + placeholder-junk rejection happens here

  await sql`
    INSERT INTO tickets (id, organization_id, category, subject, description, status, details, submitted_at, submitted_by, updated_at, version)
    VALUES (${ticket.id}, ${ticket.organizationId}, ${ticket.category}, ${ticket.subject}, ${ticket.description}, ${ticket.status}, ${ticket.details ? JSON.stringify(ticket.details) : null}, ${ticket.submittedAt}, ${ticket.submittedBy}, ${ticket.updatedAt}, ${ticket.version})
  `;
  return ticket;
}

/**
 * @param {string} id
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/ticket").Ticket | null>}
 */
async function getTicketById(id, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM tickets WHERE id = ${id}`;
  return rows.length > 0 ? mapRowToTicket(rows[0]) : null;
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/ticket").Ticket[]>}
 */
async function listTicketsForOrganization(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM tickets WHERE organization_id = ${organizationId} ORDER BY updated_at DESC`;
  return rows.map(mapRowToTicket);
}

/**
 * Fetch, validate the transition through the pure state machine, and
 * persist only if legal -- same fetch-validate-transition-persist shape
 * as approvalStore.js's applyApprovalDecision().
 *
 * @param {string} id
 * @param {import("../domain/ticket").TicketStatus} nextStatus
 * @param {{ sql?: Function, now?: () => Date }} [deps]
 * @returns {Promise<import("../domain/ticket").Ticket>}
 */
async function transitionTicket(id, nextStatus, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());

  const current = await getTicketById(id, { sql });
  if (!current) {
    throw new Error(`transitionTicket: no ticket "${id}"`);
  }
  const decision = transitionTicketStatus(current.status, nextStatus);
  if (!decision.allowed) {
    throw new Error(`transitionTicket: ${decision.reason}`);
  }

  const nowIso = now().toISOString();
  const closedAt = nextStatus === "closed" ? nowIso : null;
  await sql`
    UPDATE tickets
    SET status = ${nextStatus}, updated_at = ${nowIso}, closed_at = COALESCE(${closedAt}, closed_at), version = version + 1
    WHERE id = ${id}
  `;
  return { ...current, status: nextStatus, updatedAt: nowIso, version: current.version + 1 };
}

function mapRowToTicket(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    category: row.category,
    subject: row.subject,
    description: row.description,
    status: row.status,
    ...(row.details ? { details: row.details } : {}),
    submittedAt: new Date(row.submitted_at).toISOString(),
    submittedBy: row.submitted_by,
    updatedAt: new Date(row.updated_at).toISOString(),
    version: row.version,
  };
}

module.exports = { createTicket, getTicketById, listTicketsForOrganization, transitionTicket, mapRowToTicket };
