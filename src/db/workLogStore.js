// F025 -- Internal Notes, Time & Cost Tracking (time/notes half). No
// dollar amounts persisted anywhere here either -- same discipline as
// src/domain/workLog.js and src/tracking/timeTracking.js.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidTimeEntry, assertValidInternalNote } = require("../domain/workLog");
const { totalMinutesForTicket } = require("../tracking/timeTracking");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {{ ticketId: string, technicianUserId: string, minutes: number, note?: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, auditRecorder?: object, actorId?: string }} [deps]
 * @returns {Promise<import("../domain/workLog").TimeEntry>}
 */
async function recordTimeEntry(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);

  const entry = { id: idGenerator(), ...input, recordedAt: now().toISOString() };
  assertValidTimeEntry(entry);

  await sql`
    INSERT INTO time_entries (id, ticket_id, technician_user_id, minutes, recorded_at, note)
    VALUES (${entry.id}, ${entry.ticketId}, ${entry.technicianUserId}, ${entry.minutes}, ${entry.recordedAt}, ${entry.note || null})
  `;

  await auditRecorder.record(
    {
      correlationId: entry.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: null,
      action: "work_log.time_entry",
      targetType: "ticket",
      targetId: entry.ticketId,
      outcome: "success",
      metadata: { minutes: entry.minutes },
    },
    deps
  );

  return entry;
}

/**
 * @param {{ ticketId: string, authorUserId: string, body: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, auditRecorder?: object, actorId?: string }} [deps]
 * @returns {Promise<import("../domain/workLog").InternalNote>}
 */
async function recordInternalNote(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);

  const note = { id: idGenerator(), ...input, createdAt: now().toISOString(), customerVisible: false };
  assertValidInternalNote(note);

  await sql`
    INSERT INTO internal_notes (id, ticket_id, author_user_id, body, created_at, customer_visible)
    VALUES (${note.id}, ${note.ticketId}, ${note.authorUserId}, ${note.body}, ${note.createdAt}, ${note.customerVisible})
  `;

  await auditRecorder.record(
    {
      correlationId: note.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: null,
      action: "work_log.internal_note",
      targetType: "ticket",
      targetId: note.ticketId,
      outcome: "success",
      metadata: {},
    },
    deps
  );

  return note;
}

/**
 * @param {string} ticketId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<number>} total minutes logged, computed by the pure timeTracking.js aggregator
 */
async function getTotalMinutesForTicket(ticketId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM time_entries WHERE ticket_id = ${ticketId}`;
  const entries = rows.map(mapRowToTimeEntry);
  return totalMinutesForTicket(entries, ticketId);
}

function mapRowToTimeEntry(row) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    technicianUserId: row.technician_user_id,
    minutes: row.minutes,
    recordedAt: new Date(row.recorded_at).toISOString(),
    ...(row.note ? { note: row.note } : {}),
  };
}

module.exports = { recordTimeEntry, recordInternalNote, getTotalMinutesForTicket, mapRowToTimeEntry };
