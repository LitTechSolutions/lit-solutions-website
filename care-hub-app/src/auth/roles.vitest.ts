import { describe, expect, it } from "vitest";
import { isStaffRole } from "./roles";

describe("isStaffRole", () => {
  it("treats administrators and technicians as staff", () => {
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("staff")).toBe(true);
  });

  it("keeps the manual payment card customer-only", () => {
    expect(isStaffRole("customer")).toBe(false);
  });
});
