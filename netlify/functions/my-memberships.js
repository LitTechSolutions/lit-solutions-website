// my-memberships.js -- lets a signed-in user discover which
// organization(s) they belong to. Every other Care Hub endpoint that
// takes an `organizationId` (tickets.js, checklists.js, etc.) requires
// the CALLER to already know it -- care_hub_auth.js's authenticateForOrg()
// has no "figure out my org" path by design (an org-scoped action must
// name its target org explicitly, per SYS-AUTH-003). Before this
// endpoint, nothing exposed src/db/membershipStore.js's
// listMembershipsForUser() over HTTP at all, so a real customer signing
// into the Care Hub frontend had no way to learn their own
// organizationId to call anything else with.
//
// GET -> { memberships: [{ organizationId, organizationName, role, status }] }
//
// Read-only, scoped to the caller's own memberships only (no
// organizationId parameter, no RBAC action -- there is nothing to
// authorize beyond "you are signed in"; this can never leak another
// user's memberships since the query is always WHERE user_id = <self>).
// platform_admin/technician accounts legitimately have zero rows here
// (they aren't org members -- see care_hub_auth.js's module comment) --
// that's a normal empty result, not an error.

const { readCookie, getSession, json } = require("./_lib/auth_utils");
const { listMembershipsForUser } = require("../../src/db/membershipStore");
const { getOrganizationById } = require("../../src/db/organizationStore");

exports.handler = async (event, context, deps = {}) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

  const readCookieFn = deps.readCookie || readCookie;
  const getSessionFn = deps.getSession || getSession;
  const token = readCookieFn(event, "lts_session");
  const session = token ? await getSessionFn(token) : null;
  if (!session) return json(401, { error: "Sign in required." });

  const listMembershipsForUserFn = deps.listMembershipsForUser || listMembershipsForUser;
  const getOrganizationByIdFn = deps.getOrganizationById || getOrganizationById;

  const memberships = await listMembershipsForUserFn(session.userId, deps);
  const withOrgNames = await Promise.all(
    memberships.map(async (m) => {
      const organization = await getOrganizationByIdFn(m.organizationId, deps);
      return {
        organizationId: m.organizationId,
        organizationName: organization ? organization.name : null,
        role: m.role,
        status: m.status,
      };
    })
  );

  return json(200, { memberships: withOrgNames });
};
