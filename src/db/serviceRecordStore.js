// F010 -- Service & Project Record Management. Postgres persistence,
// unblocked by the primary-data-store decision. Same shape as
// organizationStore.js: validate with the existing domain assertion
// before every write, dependency-inject `sql` for testability.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidServiceRecord } = require("../domain/serviceRecord");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {{ organizationId: string, category: string, title: string, createdBy: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/serviceRecord").ServiceRecord>}
 */
async function createServiceRecord(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);

  const record = {
    id: idGenerator(),
    organizationId: input.organizationId,
    category: input.category,
    title: input.title,
    status: "active",
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
    createdBy: input.createdBy,
    version: 1,
  };
  assertValidServiceRecord(record);

  await sql`
    INSERT INTO service_records (id, organization_id, category, title, status, created_at, updated_at, created_by, version)
    VALUES (${record.id}, ${record.organizationId}, ${record.category}, ${record.title}, ${record.status}, ${record.createdAt}, ${record.updatedAt}, ${record.createdBy}, ${record.version})
  `;

  await auditRecorder.record(
    {
      correlationId: record.id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: record.organizationId,
      action: "service_record.create",
      targetType: "service_record",
      targetId: record.id,
      outcome: "success",
      metadata: { category: record.category },
    },
    deps
  );

  return record;
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/serviceRecord").ServiceRecord[]>}
 */
async function listServiceRecordsForOrganization(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM service_records WHERE organization_id = ${organizationId} ORDER BY updated_at DESC`;
  return rows.map(mapRowToServiceRecord);
}

/**
 * Fetches the current row first (same fetch-then-persist shape as
 * applyPaymentStatusTransition() in paymentRequestStore.js) so the audit
 * record can carry the record's organizationId and the prior status.
 *
 * @param {string} id
 * @param {import("../domain/serviceRecord").ServiceRecordStatus} status
 * @param {{ sql?: Function, now?: () => Date, actorId?: string, auditRecorder?: object }} [deps]
 * @returns {Promise<void>}
 */
async function updateServiceRecordStatus(id, status, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const auditRecorder = resolveAuditRecorder(deps);
  if (!["active", "on_hold", "completed", "cancelled"].includes(status)) {
    throw new Error(`updateServiceRecordStatus: invalid status "${status}"`);
  }

  const current = await getServiceRecordById(id, { sql });
  if (!current) {
    throw new Error(`updateServiceRecordStatus: no service record "${id}"`);
  }

  await sql`
    UPDATE service_records
    SET status = ${status}, updated_at = ${now().toISOString()}, version = version + 1
    WHERE id = ${id}
  `;

  await auditRecorder.record(
    {
      correlationId: id,
      actorType: "user",
      actorId: deps.actorId || "system",
      organizationId: current.organizationId,
      action: "service_record.status_change",
      targetType: "service_record",
      targetId: id,
      outcome: "success",
      metadata: { fromStatus: current.status, toStatus: status },
    },
    deps
  );
}

/**
 * @param {string} id
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/serviceRecord").ServiceRecord | null>}
 */
async function getServiceRecordById(id, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM service_records WHERE id = ${id}`;
  return rows.length > 0 ? mapRowToServiceRecord(rows[0]) : null;
}

function mapRowToServiceRecord(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    category: row.category,
    title: row.title,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    createdBy: row.created_by,
    version: row.version,
  };
}

module.exports = {
  createServiceRecord,
  listServiceRecordsForOrganization,
  updateServiceRecordStatus,
  getServiceRecordById,
  mapRowToServiceRecord,
};
