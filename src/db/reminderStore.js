// F048 (Warranty/License Lifecycle Reminders) & F037 (Domain/SSL/
// Subscription Renewal Tracking) -- both reuse the same
// src/reminders/lifecycleReminders.js engine (Session 6 decision), so
// they share this one persistence module too.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidLifecycleReminder } = require("../domain/lifecycleReminder");
const { evaluateReminder } = require("../reminders/lifecycleReminders");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {{ organizationId: string, subjectId: string, subjectType: string, expiresAt: string }} input
 * @param {{ sql?: Function, idGenerator?: () => string, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/lifecycleReminder").LifecycleReminder>}
 */
async function createReminder(input, deps = {}) {
  const sql = deps.sql || getSql();
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);

  const reminder = { id: idGenerator(), ...input, sent: false };
  assertValidLifecycleReminder(reminder);

  await sql`
    INSERT INTO lifecycle_reminders (id, organization_id, subject_id, subject_type, expires_at, sent)
    VALUES (${reminder.id}, ${reminder.organizationId}, ${reminder.subjectId}, ${reminder.subjectType}, ${reminder.expiresAt}, ${reminder.sent})
  `;

  await auditRecorder.record(
    {
      correlationId: reminder.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: reminder.organizationId,
      action: "reminder.create",
      targetType: "lifecycle_reminder",
      targetId: reminder.id,
      outcome: "success",
      metadata: { subjectType: reminder.subjectType, subjectId: reminder.subjectId },
    },
    deps
  );

  return reminder;
}

/**
 * Fetches every not-yet-sent reminder and runs each through the pure
 * evaluateReminder() engine, returning only the ones that should fire
 * right now. Does not mark them sent -- call markReminderSent() per
 * reminder actually delivered, so a delivery failure doesn't silently
 * lose the reminder.
 *
 * @param {{ sql?: Function, now?: () => Date, thresholdDays?: number }} [deps]
 * @returns {Promise<import("../domain/lifecycleReminder").LifecycleReminder[]>}
 */
async function listDueReminders(deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const rows = await sql`SELECT * FROM lifecycle_reminders WHERE sent = false`;
  const reminders = rows.map(mapRowToReminder);
  return reminders.filter((reminder) => evaluateReminder(reminder, now(), deps.thresholdDays).shouldSend);
}

/**
 * @param {string} id
 * @param {{ sql?: Function, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<void>}
 */
async function markReminderSent(id, deps = {}) {
  const sql = deps.sql || getSql();
  const auditRecorder = resolveAuditRecorder(deps);

  const rows = await sql`SELECT * FROM lifecycle_reminders WHERE id = ${id}`;
  if (rows.length === 0) {
    throw new Error(`markReminderSent: no lifecycle reminder "${id}"`);
  }
  const organizationId = rows[0].organization_id;

  await sql`UPDATE lifecycle_reminders SET sent = true WHERE id = ${id}`;

  await auditRecorder.record(
    {
      correlationId: id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId,
      action: "reminder.sent",
      targetType: "lifecycle_reminder",
      targetId: id,
      outcome: "success",
      metadata: {},
    },
    deps
  );
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/lifecycleReminder").LifecycleReminder[]>}
 */
async function listRemindersForOrganization(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM lifecycle_reminders WHERE organization_id = ${organizationId} ORDER BY expires_at`;
  return rows.map(mapRowToReminder);
}

function mapRowToReminder(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    subjectId: row.subject_id,
    subjectType: row.subject_type,
    expiresAt: new Date(row.expires_at).toISOString(),
    sent: row.sent,
  };
}

module.exports = { createReminder, listDueReminders, listRemindersForOrganization, markReminderSent, mapRowToReminder };
