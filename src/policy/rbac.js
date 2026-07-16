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
    // F051's work queue is genuinely cross-organization by design (see
    // src/admin/workQueueViewModel.js's own comment) -- deliberately
    // NOT in ORG_SCOPED_ACTIONS, since there is no single owning org to
    // check and no per-resource "assigned" fact to substitute, unlike
    // technician's ticket.view/ticket.work. Only platform_admin has it;
    // adding it to technician's capability set would violate the
    // regression guard in rbac.test.js protecting every other technician
    // capability from silently skipping the org/assigned check.
    "workqueue.view",
    // Same reasoning as workqueue.view -- the operational metrics
    // dashboard (F054) has no single owning organization either.
    "metrics.view",
    // Owner decision (Session 20): for this single-person business,
    // platform_admin gets every technician ticket capability directly --
    // requiring a second "staff" login just to work tickets is
    // operationally harmful. These are already listed in
    // ORG_SCOPED_ACTIONS (added for technician), so platform_admin's
    // existing actorRole !== "platform_admin" bypass in the org-scope
    // check (see authorize() below) grants cross-org ticket access with
    // no further logic changes -- customers remain fully org-scoped.
    "ticket.view",
    "ticket.work",
    "note.internal.write",
    "worklog.write",
    "website_it_ops.perform",
    "request.submit",
    "scope.create",
    "scope.view",
    "change_order.create",
    "change_order.view",
    // Owner decision: platform_admin can view and decide approvals on a
    // customer's behalf (e.g. recording a verbal approval), matching
    // approvals.js's/change-orders.js's own route comments, which always
    // described this bypass -- ROLE_CAPABILITIES just never actually
    // granted it until now. Deliberately NOT extended to technician:
    // approvals are the customer's independent check on staff-proposed
    // work, and only platform_admin (not the technician who may have
    // authored the scope/change-order being approved) gets the override.
    "approval.view",
    "scope.approve",
    "change_order.approve",
  ]),
  technician: new Set([
    "ticket.view",
    "ticket.work",
    "note.internal.write",
    "worklog.write",
    "website_it_ops.perform",
    // Scope-of-work/change-order drafting is technician/staff work tied
    // to a specific ticket -- same per-resource "assigned" gate as
    // ticket.view/ticket.work, not a standing org-wide capability.
    "scope.create",
    "scope.view",
    "change_order.create",
    "change_order.view",
  ]),
  org_owner: new Set([
    "organization.view",
    "member.invite",
    "approval.view",
    "scope.approve",
    "scope.view",
    "change_order.approve",
    "change_order.view",
    "payment.view",
    "preference.manage",
    // F017's activity timeline was always meant for every customer role,
    // not just read_only_customer -- history.view already existed for
    // exactly this, it just hadn't been extended to org_owner/org_member
    // yet because no endpoint needed it until now.
    "history.view",
    "service_record.view",
    "website_profile.view",
    "asset.view",
    "entitlement.view",
    "subscription.view",
    "checklist.view",
    // Session 20 owner decision #3: customers may answer/comment on
    // their own org's customer-facing checklist items and submit for
    // review. Deliberately NOT granted to read_only_customer -- that
    // role is view-only by design (see checklist.view above, which
    // read_only_customer does have).
    "checklist.answer",
    "reminder.view",
  ]),
  org_member: new Set([
    "request.submit",
    "request.view",
    "message.send",
    "message.view",
    "file.upload",
    "file.view",
    "document.view",
    "scope.view",
    "change_order.view",
    "payment.view",
    "history.view",
    "service_record.view",
    "website_profile.view",
    "asset.view",
    "entitlement.view",
    "subscription.view",
    "checklist.view",
    "checklist.answer",
    "reminder.view",
  ]),
  read_only_customer: new Set([
    "project.view",
    "document.view",
    "report.view",
    "history.view",
    "scope.view",
    "change_order.view",
    "payment.view",
    "service_record.view",
    "website_profile.view",
    "asset.view",
    "entitlement.view",
    "subscription.view",
    "checklist.view",
    "reminder.view",
  ]),
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
  "approval.view",
  "scope.approve",
  "scope.create",
  "scope.view",
  "change_order.approve",
  "change_order.create",
  "change_order.view",
  "payment.view",
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
  "service_record.view",
  "website_profile.view",
  "asset.view",
  "entitlement.view",
  "subscription.view",
  "checklist.view",
  "checklist.answer",
  "reminder.view",
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
