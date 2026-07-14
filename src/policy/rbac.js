// F005 -- Role-Based Access Control. Pure, deterministic, storage-agnostic
// policy engine per SYS-ARC-005 ("business rules must be unit-testable
// without browser or provider dependencies"). Persistence (where roles and
// memberships actually live) is blocked on the primary-data-store owner
// decision -- this module implements the *decision logic* only, and takes
// membership/assignment facts as plain arguments so it can be wired to
// either storage backend later without changing this file.
//
// Implements the "Universal Authorization Rules" (SYS-AUTH-001..008) from
// the Global Requirements' Roles & Permissions sheet: default deny,
// server-side only, organization-ownership-path checked on every
// action, no impersonation by automated services.

const { ROLE_NAMES } = require("../domain/organization");

/**
 * Capability map directly transcribed from the Roles & Permissions sheet's
 * "Authorized Capabilities" column. Automated Service is deliberately
 * absent here -- it has no standing capability set at all; every action it
 * takes must be explicitly granted per-call (see `can()` below), matching
 * "Only explicit machine permissions and scoped records... cannot
 * impersonate a human approver."
 */
const ROLE_CAPABILITIES = {
  platform_admin: new Set([
    "organization.create",
    "organization.view",
    "organization.suspend",
    "platform.configure",
    "customer.administer",
    "staff.administer",
    "audit.review",
    "integrations.manage",
    "billing.reconcile",
  ]),
  technician: new Set([
    "ticket.view",
    "ticket.work",
    "note.internal.write",
    "worklog.write",
    "website_it_ops.perform",
  ]),
  org_owner: new Set([
    "organization.view",
    "member.invite",
    "scope.approve",
    "change_order.approve",
    "preference.manage",
  ]),
  org_member: new Set([
    "request.submit",
    "request.view",
    "message.send",
    "message.view",
    "file.upload",
    "file.view",
    "document.view",
  ]),
  read_only_customer: new Set(["project.view", "document.view", "report.view", "history.view"]),
};

// Actions that operate on a specific organization's data and therefore
// require an organization-ownership-path check (SYS-AUTH-003). Anything
// not in this set is treated as platform-level (no single owning org) --
// deliberately not the default, so a new action forgotten here fails
// closed only if it's also missing from a role's capability set; actions
// added to ROLE_CAPABILITIES for org_owner/org_member/read_only_customer/
// technician should be added here too (asserted by rbac.test.js).
const ORG_SCOPED_ACTIONS = new Set([
  "organization.view",
  "organization.suspend",
  "member.invite",
  "scope.approve",
  "change_order.approve",
  "preference.manage",
  "request.submit",
  "request.view",
  "message.send",
  "message.view",
  "file.upload",
  "file.view",
  "document.view",
  "project.view",
  "report.view",
  "history.view",
  "ticket.view",
  "ticket.work",
  "note.internal.write",
  "worklog.write",
  "website_it_ops.perform",
]);

/**
 * @typedef {Object} AuthorizationContext
 * @property {import("../domain/organization").RoleName} actorRole
 * @property {string} action
 * @property {string | null} actorOrgId - The organization the actor belongs to, or null (platform_admin may act without one).
 * @property {string | null} [resourceOrgId] - The organization that owns the resource being acted on. Required for org-scoped actions.
 * @property {boolean} [assigned] - For technician actions: is this technician explicitly assigned to the resource? Defaults to false (deny).
 * @property {string[]} [grantedCapabilities] - For automated_service actors only: the explicit, narrow, per-call capability grant.
 * @property {import("../domain/organization").MembershipStatus} [actorMembershipStatus] - Required for org_owner/org_member/read_only_customer (roles backed by an OrganizationMembership record). Missing or anything other than "active" denies -- fail closed per SYS-AUTH-005 ("suspension changes take effect on the next authorization check"). Not applicable to platform_admin/technician/automated_service, which are authorized through other means (staff role, `assigned`, `grantedCapabilities`).
 */

/**
 * @typedef {Object} AuthorizationDecision
 * @property {boolean} allowed
 * @property {string} reason - Always present, including on allow, so callers can pass it straight into an audit event (F008).
 */

/**
 * @param {AuthorizationContext} context
 * @returns {AuthorizationDecision}
 */
function authorize(context) {
  if (!context || typeof context !== "object") {
    return { allowed: false, reason: "invalid authorization context" };
  }
  const { actorRole, action } = context;

  if (!ROLE_NAMES.includes(actorRole)) {
    return { allowed: false, reason: `unknown role "${actorRole}" -- default deny` };
  }
  if (typeof action !== "string" || action.length === 0) {
    return { allowed: false, reason: "no action specified -- default deny" };
  }

  if (actorRole === "automated_service") {
    const granted = Array.isArray(context.grantedCapabilities) ? context.grantedCapabilities : [];
    if (!granted.includes(action)) {
      return { allowed: false, reason: `automated service was not explicitly granted "${action}" for this call` };
    }
    // Unlike the static role capability map, an automated service's grant
    // is per-call and may cover any action string -- so the org-match check
    // here applies whenever a resourceOrgId is given, not just for actions
    // that happen to be in ORG_SCOPED_ACTIONS (that set only describes the
    // fixed human-role capability list below).
    if (context.resourceOrgId !== undefined && context.resourceOrgId !== null && context.resourceOrgId !== context.actorOrgId) {
      return { allowed: false, reason: "automated service grant does not extend across organizations" };
    }
    return { allowed: true, reason: `automated service explicitly granted "${action}"` };
  }

  const capabilities = ROLE_CAPABILITIES[actorRole] || new Set();
  if (!capabilities.has(action)) {
    return { allowed: false, reason: `role "${actorRole}" has no "${action}" capability -- default deny` };
  }

  if (MEMBERSHIP_BACKED_ROLES.has(actorRole) && context.actorMembershipStatus !== "active") {
    return {
      allowed: false,
      reason: `membership is not active (status: ${context.actorMembershipStatus ?? "not provided"}) -- SYS-AUTH-005`,
    };
  }

  if (ORG_SCOPED_ACTIONS.has(action) && actorRole !== "platform_admin") {
    if (actorRole === "technician") {
      if (context.assigned !== true) {
        return { allowed: false, reason: "technician is not assigned to this resource" };
      }
    } else if (context.actorOrgId == null || context.resourceOrgId == null || context.actorOrgId !== context.resourceOrgId) {
      return { allowed: false, reason: "cross-organization access denied (SYS-AUTH-003)" };
    }
  }

  return { allowed: true, reason: `role "${actorRole}" has "${action}" capability` };
}

// Roles backed by a real OrganizationMembership record, whose "active"
// status must be checked on every authorize() call (SYS-AUTH-005).
// platform_admin and automated_service are authorized through separate
// mechanisms (staff role, explicit grant); technician assignment is
// checked via `assigned` in the org-scope block above.
const MEMBERSHIP_BACKED_ROLES = new Set(["org_owner", "org_member", "read_only_customer"]);

module.exports = { authorize, ROLE_CAPABILITIES, ORG_SCOPED_ACTIONS, MEMBERSHIP_BACKED_ROLES };
