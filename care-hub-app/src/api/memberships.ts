import { request } from "./http";
import type { RoleName } from "./types";

export interface Membership {
  organizationId: string;
  organizationName: string | null;
  // In practice always "org_owner" | "org_member" | "read_only_customer"
  // -- platform_admin/technician are never org members (see
  // useMemberships.ts) -- but matches src/db/membershipStore.js's own
  // RoleName typing exactly rather than re-narrowing it here.
  role: RoleName;
  status: string;
}

// my-memberships.js -- separate from client.ts's per-resource namespaces
// since it isn't a Care Hub "resource" endpoint, it's how this app
// discovers which organization(s) the signed-in user belongs to before
// it can call any org-scoped endpoint at all (tickets, checklists, ...).
// See netlify/functions/my-memberships.js's module comment.
export const memberships = {
  list: () => request<{ memberships: Membership[] }>("/my-memberships"),
};
