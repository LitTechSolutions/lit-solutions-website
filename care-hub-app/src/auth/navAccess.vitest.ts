import { describe, expect, it } from "vitest";
import { canAccessRoute } from "./navAccess";

describe("canAccessRoute", () => {
  it("keeps Organizations/Templates/Metrics/AuditLog platform_admin-only", () => {
    (["organizations", "templates", "metrics", "auditLog"] as const).forEach((routeKey) => {
      expect(canAccessRoute("admin", routeKey)).toBe(true);
      expect(canAccessRoute("staff", routeKey)).toBe(false);
      expect(canAccessRoute("customer", routeKey)).toBe(false);
    });
  });

  it("keeps IT Support/Work Log staff-or-admin only", () => {
    (["itSupport", "workLog"] as const).forEach((routeKey) => {
      expect(canAccessRoute("admin", routeKey)).toBe(true);
      expect(canAccessRoute("staff", routeKey)).toBe(true);
      expect(canAccessRoute("customer", routeKey)).toBe(false);
    });
  });

  it("keeps Activity Timeline customer-only, matching ActivityTimeline.tsx's own isStaffRole exclusion", () => {
    expect(canAccessRoute("admin", "activityTimeline")).toBe(false);
    expect(canAccessRoute("staff", "activityTimeline")).toBe(false);
    expect(canAccessRoute("customer", "activityTimeline")).toBe(true);
  });

  it("leaves every split-view screen and hub page open to all three roles -- the router only decides reachability, not content", () => {
    (
      [
        "dashboard",
        "tickets",
        "checklists",
        "scopeOfWork",
        "changeOrders",
        "approvals",
        "reminders",
        "serviceRecords",
        "websiteProfiles",
        "subscriptions",
        "technologyAssets",
        "entitlements",
        "account",
        "project",
        "yourWebsite",
        "billing",
      ] as const
    ).forEach((routeKey) => {
      expect(canAccessRoute("admin", routeKey)).toBe(true);
      expect(canAccessRoute("staff", routeKey)).toBe(true);
      expect(canAccessRoute("customer", routeKey)).toBe(true);
    });
  });
});
