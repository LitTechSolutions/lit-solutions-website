import { describe, expect, it } from "vitest";
import { isPlatformAdminRole, isStaffRole } from "./roles";

describe("isStaffRole", () => {
  it("treats administrators and technicians as staff", () => {
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("staff")).toBe(true);
  });

  it("keeps the manual payment card customer-only", () => {
    expect(isStaffRole("customer")).toBe(false);
  });
});

describe("isPlatformAdminRole", () => {
  it("is true only for the legacy admin role, not technician", () => {
    expect(isPlatformAdminRole("admin")).toBe(true);
    expect(isPlatformAdminRole("staff")).toBe(false);
    expect(isPlatformAdminRole("customer")).toBe(false);
  });
});
