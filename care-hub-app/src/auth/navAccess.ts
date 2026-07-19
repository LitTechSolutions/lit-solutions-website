import type { AuthenticatedUser } from "../api/types";
import { isPlatformAdminRole, isStaffRole } from "./roles";

export type RouteKey =
  | "dashboard"
  | "tickets"
  | "checklists"
  | "scopeOfWork"
  | "changeOrders"
  | "approvals"
  | "organizations"
  | "reminders"
  | "serviceRecords"
  | "websiteProfiles"
  | "subscriptions"
  | "technologyAssets"
  | "entitlements"
  | "templates"
  | "metrics"
  | "auditLog"
  | "activityTimeline"
  | "itSupport"
  | "workLog"
  | "account"
  | "project"
  | "yourWebsite"
  | "billing"
  | "siteContent"
  | "imageLibrary"
  | "customerSupport";

type RouteAccess = { path: string; access: (role: AuthenticatedUser["role"]) => boolean };

// Single source of truth for "which roles may reach this route at all,"
// shared by RequireRoute (redirects the wrong role away entirely) and
// AppShell (filters what's even offered as a nav link) -- kept in one
// table so the two can never silently drift apart the way a per-file
// copy eventually would.
//
// Most routes are "all": their own component already renders different
// content per role (Tickets.tsx splits staff-work-queue vs customer-own-
// tickets, for example) -- this table only decides whether the router
// lets a role reach the route, never what they see once there. Only the
// handful of routes that are entirely off-limits to some role (rather
// than differently-rendered) get a real predicate: Organizations/
// Templates/Metrics/AuditLog (platform_admin only, per each component's
// own isPlatformAdminRole gate), IT Support/Work Log (staff-or-admin
// only), Activity Timeline (customer only -- staff/admin use the work
// queue instead).
//
// project/yourWebsite/billing are new customer-facing hub pages with no
// backend capability of their own -- open to everyone the same as the
// routes they link to, since they're pure navigation, not data.
//
// siteContent/imageLibrary/customerSupport are migrated from admin.html's
// "Staff Sign In" -- same platform_admin-only gate as Organizations/
// Templates/Metrics/AuditLog (each component's own internal check already
// requires isPlatformAdminRole; this closes the same "wrong role can
// still reach the URL" gap for them too).
export const ROUTE_ACCESS: Record<RouteKey, RouteAccess> = {
  dashboard: { path: "/", access: () => true },
  tickets: { path: "/tickets", access: () => true },
  checklists: { path: "/checklists", access: () => true },
  scopeOfWork: { path: "/scope-of-work", access: () => true },
  changeOrders: { path: "/change-orders", access: () => true },
  approvals: { path: "/approvals", access: () => true },
  organizations: { path: "/organizations", access: isPlatformAdminRole },
  reminders: { path: "/reminders", access: () => true },
  serviceRecords: { path: "/service-records", access: () => true },
  websiteProfiles: { path: "/website-profiles", access: () => true },
  subscriptions: { path: "/subscriptions", access: () => true },
  technologyAssets: { path: "/technology-assets", access: () => true },
  entitlements: { path: "/entitlements", access: () => true },
  templates: { path: "/templates", access: isPlatformAdminRole },
  metrics: { path: "/metrics", access: isPlatformAdminRole },
  auditLog: { path: "/audit-log", access: isPlatformAdminRole },
  activityTimeline: { path: "/activity-timeline", access: (role) => !isStaffRole(role) },
  itSupport: { path: "/it-support", access: isStaffRole },
  workLog: { path: "/work-log", access: isStaffRole },
  account: { path: "/account", access: () => true },
  project: { path: "/project", access: () => true },
  yourWebsite: { path: "/your-website", access: () => true },
  billing: { path: "/billing", access: () => true },
  siteContent: { path: "/site-content", access: isPlatformAdminRole },
  imageLibrary: { path: "/image-library", access: isPlatformAdminRole },
  customerSupport: { path: "/customer-support", access: isPlatformAdminRole },
};

export function canAccessRoute(role: AuthenticatedUser["role"], routeKey: RouteKey): boolean {
  return ROUTE_ACCESS[routeKey].access(role);
}
