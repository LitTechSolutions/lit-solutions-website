import { request } from "./http";

export interface Membership {
  organizationId: string;
  organizationName: string | null;
  role: string;
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
