// F010 -- Service & Project Record Management. Postgres persistence,
// unblocked by the primary-data-store decision. Same shape as
// organizationStore.js: validate with the existing domain assertion
// before every write, dependency-inject `sql` for testability.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidServiceRecord } = require("../domain/serviceRecord");

/**
 * @param {{ organizationId: string, category: string, title: string, createdBy: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/serviceRecord").ServiceRecord>}
 */
async function createServiceRecord(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

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
 * @param {string} id
 * @param {import("../domain/serviceRecord").ServiceRecordStatus} status
 * @param {{ sql?: Function, now?: () => Date }} [deps]
 * @returns {Promise<void>}
 */
async function updateServiceRecordStatus(id, status, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  if (!["active", "on_hold", "completed", "cancelled"].includes(status)) {
    throw new Error(`updateServiceRecordStatus: invalid status "${status}"`);
  }
  await sql`
    UPDATE service_records
    SET status = ${status}, updated_at = ${now().toISOString()}, version = version + 1
    WHERE id = ${id}
  `;
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

module.exports = { createServiceRecord, listServiceRecordsForOrganization, updateServiceRecordStatus, mapRowToServiceRecord };
