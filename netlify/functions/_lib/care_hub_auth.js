// care_hub_auth.js -- bridges the existing session cookie (auth_utils.js,
// F003/F004, unmigrated Netlify Blobs by design) to the Care Hub's
// org-scoped RBAC (src/policy/rbac.js, F005). A session proves *who* the
// caller is; this resolves *what organization and role* they act as via
// membershipStore.resolveAuthorizationContext() -- the same function the
// Session 10 persistence layer was built to feed rbac.authorize() with.
//
// Every Care Hub endpoint should authenticate through authenticateForOrg()
// rather than reading event.headers.cookie or the legacy session role
// directly -- the legacy role (customer/staff/admin) is a different, flat
// permission model and does not by itself grant any Care Hub capability.
// Until F002 (registration model) ties new users to an organization
// membership automatically, a user has no Care Hub access at all unless
// an organization_memberships row for them already exists.

const { getSession, readCookie, json } = require("./auth_utils");
const { resolveAuthorizationContext } = require("../../../src/db/membershipStore");
const { authorize } = require("../../../src/policy/rbac");

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
 * @returns {Promise<{ ok: true, session: object, authContext: { actorRole: string, actorOrgId: string, actorMembershipStatus: string } } | { ok: false, response: object }>}
 */
async function authenticateForOrg(event, organizationId, deps = {}) {
  if (!organizationId) {
    return { ok: false, response: json(400, { error: "organizationId is required." }) };
  }

  const getSessionFn = deps.getSession || getSession;
  const readCookieFn = deps.readCookie || readCookie;
  const resolveAuthorizationContextFn = deps.resolveAuthorizationContext || resolveAuthorizationContext;

  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) {
    return { ok: false, response: json(401, { error: "Sign-in required." }) };
  }

  const authContext = await resolveAuthorizationContextFn(session.userId, organizationId, { sql: deps.sql });
  if (!authContext) {
    return { ok: false, response: json(403, { error: "No access to this organization." }) };
  }

  return { ok: true, session, authContext };
}

/**
 * Runs the pure rbac.authorize() decision for a resolved authContext and
 * returns a ready-to-return 403 response if denied, or null if allowed.
 *
 * @param {{ actorRole: string, actorOrgId: string, actorMembershipStatus: string }} authContext
 * @param {string} organizationId
 * @param {string} action
 * @param {{ assigned?: boolean }} [extra]
 * @returns {object | null}
 */
function denyResponseFor(authContext, organizationId, action, extra = {}) {
  const decision = authorize({ ...authContext, action, resourceOrgId: organizationId, ...extra });
  return decision.allowed ? null : json(403, { error: decision.reason });
}

module.exports = { authenticateForOrg, denyResponseFor };
