import type { AuthenticatedUser } from "../api/types";

// "staff" here means "not a customer" -- both legacy roles ("admin" ->
// platform_admin, "staff" -> technician) are non-customer accounts. Safe
// for UI that only decides whether to show customer-only elements (e.g.
// hiding the customer payment card from any staff account).
export function isStaffRole(role: AuthenticatedUser["role"]): boolean {
  return role === "admin" || role === "staff";
}

// Narrower than isStaffRole: true only for the legacy "admin" role
// (platform_admin). Use this -- not isStaffRole -- for anything that
// routes into a platform_admin-only screen (StaffWorkQueue,
// StaffChecklists), since technician's backend RBAC capabilities
// (src/policy/rbac.js) do not include workqueue.view or any checklist
// capability. Routing a technician into those screens with isStaffRole
// produces a raw 403 instead of the graceful "not built for you yet"
// message the membership-driven customer flow already shows for
// accounts with no organization membership (technicians included).
export function isPlatformAdminRole(role: AuthenticatedUser["role"]): boolean {
  return role === "admin";
}
