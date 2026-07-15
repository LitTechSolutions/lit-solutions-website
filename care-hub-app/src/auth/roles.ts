import type { AuthenticatedUser } from "../api/types";

export function isStaffRole(role: AuthenticatedUser["role"]): boolean {
  return role === "admin" || role === "staff";
}
