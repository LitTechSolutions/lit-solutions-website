# Session 16 — Three More HTTP Endpoints, Two Honest rbac.js Additions

## Summary

Dylan said to continue after Session 15's report. This session built three
more Netlify Function endpoints on the `tickets.js` pattern established in
Session 15 — `organizations.js` (F001), `work-queue.js` (F051), and
`approvals.js` (F016) — and, in the process, made two small, carefully
scoped additions to `rbac.js` rather than faking authorization decisions
the pure engine genuinely couldn't make yet. It also corrected an
inconsistency from Session 15's `tickets.js`.

## The platform_admin / technician bridge problem

Building `organizations.js`'s `POST` (create a brand-new organization)
exposed a real gap: `authenticateForOrg()` requires an `organizationId` to
resolve a membership against, but there is no organization yet when
you're creating one. Investigating this surfaced a broader fact: neither
`platform_admin` nor `technician` is in `rbac.js`'s
`MEMBERSHIP_BACKED_ROLES` — `platform_admin` is authorized platform-wide,
and `technician` is authorized per-*resource* via an explicit `assigned`
fact (`ticketWorkflowStore.getAssignedTechnician()`), never via org
membership at all.

Rather than invent new Postgres infrastructure (a sentinel "platform"
pseudo-organization, a second staff/admin table), `care_hub_auth.js` now
bridges both roles directly from the existing flat legacy session role —
`"admin"` → `platform_admin`, `"staff"` → `technician` — the same
distinction the pre-Care-Hub endpoints already use
(`admin-images.js`, `content.js`, `documents.js`, `messages.js`,
`notifications.js` all gate on `session.role === "admin" || session.role
=== "staff"`). A new `authenticatePlatformAction()` handles actions with
no owning organization at all.

**This corrected a real inconsistency from Session 15**: `tickets.js`'s
live smoke test had technicians hold an unnecessary
`organization_memberships` row, even though `rbac.js`'s technician
authorization was never actually org-scoped — the resource-level
`assigned` check was always sufficient on its own. `tickets.js` itself
needed no code changes; only `care_hub_auth.js`'s bridge logic changed,
and its existing tests (which fake `resolveAuthorizationContext` directly)
kept passing without modification.

## Two new rbac.js capabilities — additions, not workarounds

**`work-queue.js` (F051):** `src/admin/workQueueViewModel.js`'s own
comment says the work queue is "the one view in the whole system that's
SUPPOSED to span every org" — but `rbac.js`'s technician `ticket.view`
capability is always per-resource, enforced by a regression guard in
`rbac.test.js` requiring every technician capability to be listed in
`ORG_SCOPED_ACTIONS`. Adding an unscoped cross-org capability to
technician would have violated that guard — and the guard correctly
caught the first draft of this design before any code shipped. The
actual fix: a new `workqueue.view` capability, granted only to
`platform_admin`, deliberately **not** added to `ORG_SCOPED_ACTIONS`
(there's no single owning org for a cross-org summary, so the org-match
question doesn't apply). This is a genuinely different capability from
day-to-day ticket work, not a scoping workaround.

**`approvals.js` (F016):** `rbac.js` had zero capability governing "list
pending approvals" — only the decision actions (`scope.approve`,
`change_order.approve`) existed. `approvals.js`'s `GET` needed something
real to check, not an approximation borrowed from an unrelated action. A
new `approval.view` capability was added to `org_owner` only (matching
F016's "Customer Approval Inbox" framing) and added to
`ORG_SCOPED_ACTIONS` like every other org-level action, satisfying the
same regression guard.

Both additions are small, targeted, tested, and traced directly to a
concrete endpoint need — not speculative capability-map expansion.

## A faithfully restrictive result, left as-is rather than "fixed"

Testing `approvals.js` surfaced that `platform_admin` has neither
`scope.approve`/`change_order.approve` nor (deliberately) `approval.view`
— under the current capability map, only `org_owner` can see or decide
customer approvals. This matches F016's "Customer Approval Inbox" framing
(approval decisions are customer-side business decisions) and was left
exactly as `rbac.js` already specifies, rather than "corrected" to let
admin override it. Flagged in `DEV_STATE.json` for visibility, not
silently changed.

## The endpoints

- **`netlify/functions/organizations.js`** (F001) — `POST` create
  (`authenticatePlatformAction`, `organization.create`), `GET` view
  (`authenticateForOrg`, `organization.view` — platform_admin or
  org_owner), `PATCH` status change (`organization.suspend`,
  platform_admin only). Wired to `organizationStore.js`.
- **`netlify/functions/work-queue.js`** (F051) — `GET` only, no query
  parameters, genuinely cross-organization. `authenticatePlatformAction`
  + `workqueue.view`. Wired to `workQueueQuery.fetchWorkQueue()`.
- **`netlify/functions/approvals.js`** (F016) — `GET` list pending
  approvals for an org (`approval.view`, org_owner), `PATCH` approve/reject
  (`scope.approve` or `change_order.approve` depending on the approval's
  `subjectType`). Wired to `approvalStore.js`.

All three follow the `deps = {}` injection seam established in Session 15
— Netlify always calls handlers with exactly `(event, context)`, so
production behavior is unchanged; tests inject fake session/auth deps
while real store logic runs underneath.

## Test results

- `organizations.test.js` — 10 cases
- `work-queue.test.js` — 5 cases
- `approvals.test.js` — 10 cases
- `rbac.test.js` — 4 new cases covering `workqueue.view` and
  `approval.view`
- Full suite: **438/438 passing**, up from 409 at the end of Session 15.
- `docs/development/evidence/migrations/session-16-endpoints-live-smoke-test.txt`
  — 8 checks against the real Neon database: created, viewed, and
  suspended a real organization as `platform_admin`; denied a legacy
  customer with no membership; fetched the real cross-org work queue and
  confirmed a technician (legacy `staff` role) is correctly denied it
  (platform_admin only); created, listed, and approved a real pending
  approval as a real `org_owner`. **8/8 PASS.**

## What's still not done

- 17 more endpoints remain to expose the rest of the persistence layer
  (activity events, scope of work, change orders, payment requests,
  entitlements, subscriptions, technology assets, backups, reminders, IT
  support classification, checklists, metrics, templates, webhook
  events).
- No UI exists for any Care Hub feature.
- The registration model (F002, still an open owner decision) remains the
  single most urgent open item for *customer*-facing endpoints — it no
  longer affects `platform_admin` or `technician`, since both now bridge
  directly from the legacy session role, but a real customer still has no
  automatic path to an `organization_memberships` row.
- `netlify dev`'s local Blobs emulation issue from Session 15 wasn't
  revisited — not needed for this session's work, but still open if full
  local testing of the legacy auth endpoints themselves is wanted later.

## Files changed

- New: `netlify/functions/organizations.js` (+test), `netlify/functions/work-queue.js` (+test), `netlify/functions/approvals.js` (+test)
- Modified: `netlify/functions/_lib/care_hub_auth.js` (staff→technician bridge, `authenticatePlatformAction`), `src/policy/rbac.js` (+`workqueue.view`, +`approval.view`), `src/policy/rbac.test.js` (+4 cases)
- Modified: `docs/development/DECISION_LOG.md`, `docs/development/REQUIREMENTS_TRACEABILITY.md`, `docs/development/DEV_STATE.json`
- New evidence: `docs/development/evidence/migrations/session-16-endpoints-live-smoke-test.txt`
