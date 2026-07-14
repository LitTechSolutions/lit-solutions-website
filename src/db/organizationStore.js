// F001 -- Customer Organization Provisioning. Postgres-backed persistence,
// unblocked by the primary-data-store decision (Postgres/Neon). Domain
// validation (assertValidOrganization) runs before every write, same
// discipline as the Blobs adapters (blobsAuditSink.js,
// blobsSettingsStore.js) from Sessions 1-6.
//
// `sql` is dependency-injected (defaults to the real Neon client) so
// these functions are unit-testable without a live database -- see
// organizationStore.test.js, which injects a fake tagged-template
// function and asserts on the query/params shape.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidOrganization } = require("../domain/organization");

/**
 * @param {{ name: string, createdBy: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/organization").Organization>}
 */
async function createOrganization(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const organization = {
    id: idGenerator(),
    name: input.name,
    status: "active",
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
    createdBy: input.createdBy,
    version: 1,
  };
  assertValidOrganization(organization);

  await sql`
    INSERT INTO organizations (id, name, status, created_at, updated_at, created_by, version)
    VALUES (${organization.id}, ${organization.name}, ${organization.status}, ${organization.createdAt}, ${organization.updatedAt}, ${organization.createdBy}, ${organization.version})
  `;

  return organization;
}

/**
 * @param {string} id
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/organization").Organization | null>}
 */
async function getOrganizationById(id, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM organizations WHERE id = ${id}`;
  return rows.length > 0 ? mapRowToOrganization(rows[0]) : null;
}

/**
 * @param {string} id
 * @param {import("../domain/organization").OrganizationStatus} status
 * @param {{ sql?: Function, now?: () => Date }} [deps]
 * @returns {Promise<void>}
 */
async function updateOrganizationStatus(id, status, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  if (!["active", "suspended", "archived"].includes(status)) {
    throw new Error(`updateOrganizationStatus: invalid status "${status}"`);
  }
  await sql`
    UPDATE organizations
    SET status = ${status}, updated_at = ${now().toISOString()}, version = version + 1
    WHERE id = ${id}
  `;
}

function mapRowToOrganization(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    createdBy: row.created_by,
    version: row.version,
  };
}

module.exports = { createOrganization, getOrganizationById, updateOrganizationStatus, mapRowToOrganization };
