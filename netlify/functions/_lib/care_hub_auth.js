// care_hub_auth.js -- bridges the existing session cookie (auth_utils.js,
// F003/F004, unmigrated Netlify Blobs by design) to the Care Hub's
// org-scoped RBAC (src/policy/rbac.js, F005). A session proves *who* the
// caller is; this resolves *what organization and role* they act as via
// membershipStore.resolveAuthorizationContext() -- the same function the
// Session 10 persistence layer was built to feed rbac.authorize() with.
//
// Every Care Hub endpoint should authenticate through authenticateForOrg()
// or authenticatePlatformAction() rather than reading event.headers.cookie
// or the legacy session role directly.
//
// Legacy-role bridges (Session 16 decision, see DECISION_LOG.md): two of
// rbac.js's roles have NO organization_memberships row to resolve, by
// design -- neither is in MEMBERSHIP_BACKED_ROLES, and
// organization_memberships.organization_id is NOT NULL, so there's no
// tenant-scoped row either role could hold even if one were created:
//
//   - platform_admin: authorized platform-wide, not per-org.
//   - technician: authorized per-RESOURCE via an explicit `assigned` fact
//     (see tickets.js's getAssignedTechnician() check), never via org
//     membership -- rbac.js's org-scope check bypasses the org-match
//     entirely for technician and substitutes the assigned check instead.
//
// Both map directly from the existing flat legacy session role --
// "admin" -> platform_admin, "staff" -> technician (both roles already
// exist and are used this way by the pre-Care-Hub endpoints: see
// admin-images.js, content.js, documents.js, messages.js, notifications.js
// for `session.role === "admin" || session.role === "staff"` checks).
// This is the ONLY bridge between the two role systems -- the legacy
// "customer" role has zero Care Hub capability on its own and must go
// through a real organization_memberships row (org_owner/org_member/
// read_only_customer) once one exists for that user.
//
// Until F002 (registration model) ties new customer users to an
// organization membership automatically, a customer has no Care Hub
// access at all unless an organization_memberships row for them already
// exists.

const { getSession, readCookie, json } = require("./auth_utils");
const { resolveAuthorizationContext } = require("../../../src/db/membershipStore");
const { authorize } = require("../../../src/policy/rbac");

const PLATFORM_ADMIN_CONTEXT = { actorRole: "platform_admin", actorOrgId: null, actorMembershipStatus: undefined };
const TECHNICIAN_CONTEXT = { actorRole: "technician", actorOrgId: null, actorMembershipStatus: undefined };

async function resolveSession(event, deps) {
  const getSessionFn = deps.getSession || getSession;
  const readCookieFn = deps.readCookie || readCookie;
  const token = readCookieFn(event, "lts_session");
  return token ? await getSessionFn(token) : null;
}

/**
 * Authenticates the caller against the session cookie, then resolves
 * their Care Hub role/status for a specific organization. Does NOT check
 * a specific action -- callers must call denyResponseFor() next with the
 * action appropriate to the resolved role and the HTTP verb/resource.
 *
 * `deps` follows the same override pattern as every src/db/* store
 * (default to the real implementation, let tests inject fakes) --
 * Netlify never supplies a third argument, so production behavior is
 * unchanged; it exists so this module, and anything built on it, is
 * unit-testable without live Netlify Blobs infrastructure, which has no
 * local-only mode this codebase can rely on (audit finding F016).
 *
 * @param {object} event
 * @param {string} organizationId
 * @param {{ getSession?: Function, readCookie?: Function, resolveAuthorizationContext?: Function, sql?: Function }} [deps]
 * @returns {Promise<{ ok: true, session: object, authContext: { actorRole: string, actorOrgId: string | null, actorMembershipStatus: string | undefined } } | { ok: false, response: object }>}
 */
async function authenticateForOrg(event, organizationId, deps = {}) {
  if (!organizationId) {
    return { ok: false, response: json(400, { error: "organizationId is required." }) };
  }

  const session = await resolveSession(event, deps);
  if (!session) {
    return { ok: false, response: json(401, { error: "Sign-in required." }) };
  }

  if (session.role === "admin") {
    return { ok: true, session, authContext: PLATFORM_ADMIN_CONTEXT };
  }
  if (session.role === "staff") {
    return { ok: true, session, authContext: TECHNICIAN_CONTEXT };
  }

  const resolveAuthorizationContextFn = deps.resolveAuthorizationContext || resolveAuthorizationContext;
  const authContext = await resolveAuthorizationContextFn(session.userId, organizationId, { sql: deps.sql });
  if (!authContext) {
    return { ok: false, response: json(403, { error: "No access to this organization." }) };
  }

  return { ok: true, session, authContext };
}

/**
 * Authenticates a platform-level action -- one with no single owning
 * organization (e.g. F001 organization.create, before any org exists to
 * scope against). Only the legacy "admin" session role qualifies.
 *
 * @param {object} event
 * @param {{ getSession?: Function, readCookie?: Function }} [deps]
 * @returns {Promise<{ ok: true, session: object, authContext: typeof PLATFORM_ADMIN_CONTEXT } | { ok: false, response: object }>}
 */
async function authenticatePlatformAction(event, deps = {}) {
  const session = await resolveSession(event, deps);
  if (!session) {
    return { ok: false, response: json(401, { error: "Sign-in required." }) };
  }
  if (session.role !== "admin") {
    return { ok: false, response: json(403, { error: "Platform admin access required." }) };
  }
  return { ok: true, session, authContext: PLATFORM_ADMIN_CONTEXT };
}

/**
 * Runs the pure rbac.authorize() decision for a resolved authContext and
 * returns a ready-to-return 403 response if denied, or null if allowed.
 *
 * @param {{ actorRole: string, actorOrgId: string | null, actorMembershipStatus: string | undefined }} authContext
 * @param {string | null} organizationId
 * @param {string} action
 * @param {{ assigned?: boolean }} [extra]
 * @returns {object | null}
 */
function denyResponseFor(authContext, organizationId, action, extra = {}) {
  const decision = authorize({ ...authContext, action, resourceOrgId: organizationId, ...extra });
  return decision.allowed ? null : json(403, { error: decision.reason });
}

module.exports = { authenticateForOrg, authenticatePlatformAction, denyResponseFor };
