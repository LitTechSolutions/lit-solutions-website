# Authorization Model — Current State & Target Standards

## 1. Current state (as inspected)

- **Roles:** exactly three flat strings on the user record — `"customer"`, `"staff"`, `"admin"`. No membership/organization concept, no per-permission granularity. Most handlers treat `staff` and `admin` as equivalent (`session.role !== "admin" && session.role !== "staff"`), so there are really only **two effective privilege tiers** today.
- **Tenant boundary:** none. Every resource is owned by a single `userId`, not an organization.
- **Enforcement pattern:** hand-rolled per Netlify Function — read `lts_session` cookie → `getSession(token)` → 401 if absent/expired → then either filter list results to `record.<ownerField> === session.userId`, or an explicit `if (role check fails) return 403` for staff-only actions. No shared middleware/decorator; the same 3-line boilerplate is repeated in every handler.
- **Session mechanics:** cookie-based (`lts_session`, HttpOnly/Secure/SameSite=Lax), HMAC-SHA256-signed token plus a server-side revocable session record (not a pure stateless JWT). 8-hour TTL. Password reset / password change / email change all call `revokeAllSessionsForUser` — a real "rotate on privilege change" pattern already in place and worth preserving as-is.
- **Known rough edge:** `admin.html`'s `loadSession()` doesn't call a real "who am I" endpoint — it probes an admin-gated read and then hardcodes `state.user = { role: "admin" }` on success, regardless of whether the actual session role is `admin` or `staff`. Don't copy this pattern into any Care Hub staff console that needs to visually distinguish the two roles.

## 2. Target model (per Roles & Permissions sheet — not yet implemented)

Default deny. Organization scope and object-level permissions required on every protected operation.

| Role | Purpose | Authorized capabilities | Restrictions |
|---|---|---|---|
| Platform Administrator | LTS owner / specifically authorized admin | Global config, customer admin, staff admin, audit review, integrations, billing reconciliation | Cannot view secrets stored outside the platform; all privileged actions audited |
| Technician | Authorized LTS service provider | Assigned customer/ticket/project access, internal notes, work logs, approved website/IT ops | No billing-policy or global-security changes unless separately granted |
| Organization Owner | Customer business owner / primary admin | View org data, invite lower-privilege users, approve scopes/change orders, manage permitted preferences | Cannot grant platform/technician roles; no staff-only notes/costs |
| Organization Member | Authorized customer employee | Submit/view permitted requests, messages, files, assets, documents | Financial approvals/org admin only when explicitly granted |
| Read-Only Customer | Customer stakeholder with view access | View selected projects, documents, reports, history | No write/approve/upload/invite/billing actions |
| Automated Service | Scoped machine identity | Only explicit machine permissions and scoped records | No interactive login; keys rotated, never browser-exposed |

Universal rules (`SYS-AUTH-001` through `SYS-AUTH-008`): default deny everywhere; server-side enforcement only (hidden UI is never security); organization ownership path checked on every read/write; internal/staff-only data uses separate permissions and projections; role/membership/suspension changes take effect on next check and revoke sessions where required; privileged/financial actions require explicit permission + confirmation + audit + optional step-up auth; exports/signed links/search/notifications/AI context all apply the same object-level authorization as detail pages; automated services are least-privilege and cannot impersonate a human approver.

## 3. Gap summary

| Current | Target | Gap |
|---|---|---|
| 2 effective tiers (customer / staff+admin) | 6 roles with distinct capabilities | Full RBAC model to build (F005) |
| No organization entity | Org-scoped default-deny on every record | Tenant boundary to build (F001), then retrofit onto every existing store |
| Per-function hand-rolled auth checks | Consistent policy enforcement, ideally centralized | Shared `requireAuth(role, orgScope)` helper recommended in `ARCHITECTURE.md` §3.2 |
| Cookie/session mechanics | Matches `SYS-SEC-002` reasonably well already | **Reusable as-is** — don't rebuild session handling, extend it |
| No audit trail | Immutable structured events for privileged/financial/security/deletion/config actions | F008, foundational — nothing later is verifiably "audited" without it |

This gap analysis directly informs Wave 1 (F001–F008) — see `REQUIREMENTS_CATALOG.json`.
