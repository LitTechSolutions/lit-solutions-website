// F005 -- Role-Based Access Control (persistence half). The decision
// LOGIC lives in src/policy/rbac.js and stays pure/storage-agnostic --
// this module's only job is resolving the facts rbac.authorize() needs
// (actorOrgId, actorMembershipStatus) from real data, then handing them
// to that pure function unchanged. See resolveAuthorizationContext()
// below for the intended call pattern.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidMembership } = require("../domain/organization");

/**
 * @param {{ organizationId: string, userId: string, role: import("../domain/organization").RoleName, status?: import("../domain/organization").MembershipStatus, invitedBy?: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string }} [deps]
 * @returns {Promise<import("../domain/organization").OrganizationMembership>}
 */
async function createMembership(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());

  const membership = {
    id: idGenerator(),
    organizationId: input.organizationId,
    userId: input.userId,
    role: input.role,
    status: input.status || "active",
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
    ...(input.invitedBy ? { invitedBy: input.invitedBy } : {}),
  };
  assertValidMembership(membership);

  await sql`
    INSERT INTO organization_memberships (id, organization_id, user_id, role, status, invited_by, created_at, updated_at)
    VALUES (${membership.id}, ${membership.organizationId}, ${membership.userId}, ${membership.role}, ${membership.status}, ${membership.invitedBy || null}, ${membership.createdAt}, ${membership.updatedAt})
  `;

  return membership;
}

/**
 * The one function every real authorization check should call: resolves
 * a user's membership in a specific organization into exactly the shape
 * rbac.authorize() expects (actorRole, actorOrgId, actorMembershipStatus).
 * Returns null if the user has no membership in that organization at all
 * (caller should then deny -- there's no role to authorize with).
 *
 * @param {string} userId
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<{ actorRole: string, actorOrgId: string, actorMembershipStatus: string } | null>}
 */
async function resolveAuthorizationContext(userId, organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`
    SELECT role, status FROM organization_memberships
    WHERE user_id = ${userId} AND organization_id = ${organizationId}
  `;
  if (rows.length === 0) return null;
  return { actorRole: rows[0].role, actorOrgId: organizationId, actorMembershipStatus: rows[0].status };
}

/**
 * @param {string} userId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/organization").OrganizationMembership[]>}
 */
async function listMembershipsForUser(userId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM organization_memberships WHERE user_id = ${userId}`;
  return rows.map(mapRowToMembership);
}

/**
 * @param {string} membershipId
 * @param {import("../domain/organization").MembershipStatus} status
 * @param {{ sql?: Function, now?: () => Date }} [deps]
 * @returns {Promise<void>}
 */
async function updateMembershipStatus(membershipId, status, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  if (!["active", "invited", "suspended", "revoked"].includes(status)) {
    throw new Error(`updateMembershipStatus: invalid status "${status}"`);
  }
  await sql`
    UPDATE organization_memberships
    SET status = ${status}, updated_at = ${now().toISOString()}
    WHERE id = ${membershipId}
  `;
}

function mapRowToMembership(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...(row.invited_by ? { invitedBy: row.invited_by } : {}),
  };
}

module.exports = {
  createMembership,
  resolveAuthorizationContext,
  listMembershipsForUser,
  updateMembershipStatus,
  mapRowToMembership,
};
