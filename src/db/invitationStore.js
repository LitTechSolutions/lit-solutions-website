// F002 -- Customer Invitation & Account Activation. Postgres persistence
// wired to the existing pure src/policy/invitationLifecycle.js --
// fetch-validate-transition-persist, same shape as approvalStore.js.
// Every state-changing call records an audit event (SYS-NFR-020):
// invitations gate account creation, so their full lifecycle
// (create/resend/revoke/accept, plus failed accept attempts) is exactly
// the kind of security-sensitive action F008 exists for.
//
// Only a token HASH is ever persisted or returned from getInvitation*();
// createInvitation()/resendInvitation() are the only two functions that
// ever see the raw token, and they return it once, by value, to the
// caller (the endpoint layer), which must email it and never log or
// re-return it.

const crypto = require("node:crypto");
const { getSql } = require("./pgClient");
const { assertValidInvitation } = require("../domain/invitation");
const {
  transitionInvitation,
  computeExpiresAt,
  generateInvitationToken,
  hashInvitationToken,
} = require("../policy/invitationLifecycle");
const { createAuditRecorder } = require("../audit/auditLog");
const { createPgAuditSink } = require("./pgAuditSink");

function resolveAuditRecorder(deps) {
  return deps.auditRecorder || createAuditRecorder(createPgAuditSink({ sql: deps.sql }));
}

/**
 * @param {{ organizationId: string, email: string, role: import("../domain/organization").RoleName, invitedBy: string }} input
 * @param {{ sql?: Function, now?: () => Date, idGenerator?: () => string, auditRecorder?: object, randomBytes?: Function }} [deps]
 * @returns {Promise<{ invitation: import("../domain/invitation").Invitation, token: string }>}
 */
async function createInvitation(input, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const idGenerator = deps.idGenerator || (() => crypto.randomUUID());
  const auditRecorder = resolveAuditRecorder(deps);

  const token = generateInvitationToken(deps);
  const invitation = {
    id: idGenerator(),
    organizationId: input.organizationId,
    email: input.email.toLowerCase(),
    role: input.role,
    status: "pending",
    invitedBy: input.invitedBy,
    createdAt: now().toISOString(),
    expiresAt: computeExpiresAt(deps),
  };
  assertValidInvitation(invitation);

  await sql`
    INSERT INTO invitations (id, organization_id, email, role, status, invited_by, created_at, expires_at, token_hash, resend_count)
    VALUES (${invitation.id}, ${invitation.organizationId}, ${invitation.email}, ${invitation.role}, ${invitation.status}, ${invitation.invitedBy}, ${invitation.createdAt}, ${invitation.expiresAt}, ${hashInvitationToken(token)}, 0)
  `;

  await auditRecorder.record(
    {
      correlationId: invitation.id,
      actorType: "user",
      actorId: input.invitedBy,
      organizationId: invitation.organizationId,
      action: "invitation.create",
      targetType: "invitation",
      targetId: invitation.id,
      outcome: "success",
      metadata: { email: invitation.email, role: invitation.role },
    },
    deps
  );

  return { invitation, token };
}

/**
 * @param {string} id
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/invitation").Invitation | null>}
 */
async function getInvitationById(id, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM invitations WHERE id = ${id}`;
  return rows.length > 0 ? mapRowToInvitation(rows[0]) : null;
}

/**
 * The only lookup the public accept-invitation endpoint should ever use --
 * never expose a listing or lookup by raw token, only by its hash, and
 * this never returns the hash itself back out.
 *
 * @param {string} tokenHash
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/invitation").Invitation | null>}
 */
async function getInvitationByTokenHash(tokenHash, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM invitations WHERE token_hash = ${tokenHash}`;
  return rows.length > 0 ? mapRowToInvitation(rows[0]) : null;
}

/**
 * @param {string} organizationId
 * @param {{ sql?: Function }} [deps]
 * @returns {Promise<import("../domain/invitation").Invitation[]>}
 */
async function listInvitationsForOrganization(organizationId, deps = {}) {
  const sql = deps.sql || getSql();
  const rows = await sql`SELECT * FROM invitations WHERE organization_id = ${organizationId} ORDER BY created_at DESC`;
  return rows.map(mapRowToInvitation);
}

/**
 * Issues a fresh token and a fresh 7-day window for a still-pending
 * invitation -- the old token stops working immediately (its hash is
 * overwritten, not appended), so a resent invite can't be redeemed twice
 * via two different links.
 *
 * @param {string} id
 * @param {{ sql?: Function, now?: () => Date, auditRecorder?: object, randomBytes?: Function }} [deps]
 * @returns {Promise<{ invitation: import("../domain/invitation").Invitation, token: string }>}
 */
async function resendInvitation(id, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const auditRecorder = resolveAuditRecorder(deps);

  const current = await getInvitationById(id, { sql });
  if (!current) {
    throw new Error(`resendInvitation: no invitation "${id}"`);
  }
  if (current.status !== "pending") {
    throw new Error(`resendInvitation: invitation is "${current.status}", not pending -- issue a new invitation instead`);
  }

  const token = generateInvitationToken(deps);
  const nowIso = now().toISOString();
  const expiresAt = computeExpiresAt(deps);

  await sql`
    UPDATE invitations
    SET token_hash = ${hashInvitationToken(token)}, expires_at = ${expiresAt}, resend_count = resend_count + 1, last_sent_at = ${nowIso}
    WHERE id = ${id}
  `;

  await auditRecorder.record(
    {
      correlationId: id,
      actorType: "user",
      actorId: current.invitedBy,
      organizationId: current.organizationId,
      action: "invitation.resend",
      targetType: "invitation",
      targetId: id,
      outcome: "success",
      metadata: { email: current.email, resendCount: (current.resendCount ?? 0) + 1 },
    },
    deps
  );

  return { invitation: { ...current, expiresAt }, token };
}

/**
 * @param {string} id
 * @param {string} revokedBy
 * @param {{ sql?: Function, now?: () => Date, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/invitation").Invitation>}
 */
async function revokeInvitation(id, revokedBy, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const auditRecorder = resolveAuditRecorder(deps);

  const current = await getInvitationById(id, { sql });
  if (!current) {
    throw new Error(`revokeInvitation: no invitation "${id}"`);
  }
  const decision = transitionInvitation(current, "revoke", deps);
  if (!decision.allowed) {
    throw new Error(`revokeInvitation: ${decision.reason}`);
  }

  const nowIso = now().toISOString();
  await sql`UPDATE invitations SET status = ${decision.nextStatus}, revoked_at = ${nowIso}, revoked_by = ${revokedBy} WHERE id = ${id}`;

  await auditRecorder.record(
    {
      correlationId: id,
      actorType: "user",
      actorId: revokedBy,
      organizationId: current.organizationId,
      action: "invitation.revoke",
      targetType: "invitation",
      targetId: id,
      outcome: "success",
      metadata: { email: current.email },
    },
    deps
  );

  return { ...current, status: decision.nextStatus, revokedAt: nowIso, revokedBy };
}

/**
 * Redeems a token: fetch by hash, validate through the pure state
 * machine, persist "accepted" only if legal. Deliberately throws the
 * SAME generic message for "no such token", "already used", "revoked",
 * and "expired" -- never let a caller distinguish those from the error
 * text, or an attacker can enumerate which tokens exist/are still valid.
 * A denied audit event is still recorded with the real reason for
 * platform_admin review (audit.review is RBAC-gated, not public).
 *
 * @param {string} token - The RAW token from the acceptance request, not its hash.
 * @param {{ sql?: Function, now?: () => Date, auditRecorder?: object }} [deps]
 * @returns {Promise<import("../domain/invitation").Invitation>}
 */
async function acceptInvitation(token, deps = {}) {
  const sql = deps.sql || getSql();
  const now = deps.now || (() => new Date());
  const auditRecorder = resolveAuditRecorder(deps);
  const GENERIC_ERROR = "This invitation link is invalid or has expired.";

  const tokenHash = hashInvitationToken(token);
  const current = await getInvitationByTokenHash(tokenHash, { sql });

  if (!current) {
    await auditRecorder.record(
      {
        correlationId: crypto.randomUUID(),
        actorType: "user",
        actorId: "unknown",
        organizationId: null,
        action: "invitation.accept",
        targetType: "invitation",
        outcome: "denied",
        metadata: { reason: "token not found", tokenHashPrefix: tokenHash.slice(0, 8) },
      },
      deps
    );
    throw new Error(GENERIC_ERROR);
  }

  const decision = transitionInvitation(current, "accept", { now });
  if (!decision.allowed) {
    await auditRecorder.record(
      {
        correlationId: current.id,
        actorType: "user",
        actorId: "unknown",
        organizationId: current.organizationId,
        action: "invitation.accept",
        targetType: "invitation",
        targetId: current.id,
        outcome: "denied",
        metadata: { reason: decision.reason, currentStatus: current.status },
      },
      deps
    );
    throw new Error(GENERIC_ERROR);
  }

  const nowIso = now().toISOString();
  await sql`UPDATE invitations SET status = ${decision.nextStatus}, accepted_at = ${nowIso} WHERE id = ${current.id}`;

  await auditRecorder.record(
    {
      correlationId: current.id,
      actorType: "user",
      actorId: current.email,
      organizationId: current.organizationId,
      action: "invitation.accept",
      targetType: "invitation",
      targetId: current.id,
      outcome: "success",
      metadata: { email: current.email, role: current.role },
    },
    deps
  );

  return { ...current, status: decision.nextStatus, acceptedAt: nowIso };
}

function mapRowToInvitation(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedBy: row.invited_by,
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    ...(row.accepted_at ? { acceptedAt: new Date(row.accepted_at).toISOString() } : {}),
    ...(row.revoked_at ? { revokedAt: new Date(row.revoked_at).toISOString() } : {}),
    ...(row.revoked_by ? { revokedBy: row.revoked_by } : {}),
    resendCount: row.resend_count,
    ...(row.last_sent_at ? { lastSentAt: new Date(row.last_sent_at).toISOString() } : {}),
  };
}

module.exports = {
  createInvitation,
  getInvitationById,
  getInvitationByTokenHash,
  listInvitationsForOrganization,
  resendInvitation,
  revokeInvitation,
  acceptInvitation,
  mapRowToInvitation,
};
