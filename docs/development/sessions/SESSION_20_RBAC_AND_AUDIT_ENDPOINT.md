# Session 20 -- platform_admin Ticket RBAC + Audit-Log Endpoint

## Context

Dylan supplied a single, extremely detailed directive resolving all 7
items from Session 19's consolidated decision list (Care Hub UI
architecture, admin MFA, readiness-checklist data split, platform_admin
ticket access, legal/privacy content, Square/credential handling, and the
audit-log endpoint), with an explicit 10-step implementation order and
the instruction to continue without stopping for further approval unless
a materially different architectural or security constraint turned up.
This session completed steps 1-2 of that order.

## What was built

### Step 1 -- platform_admin ticket RBAC + audit logging

- **`src/policy/rbac.js`**: `platform_admin` now has every technician
  ticket capability (`ticket.view`, `ticket.work`, `note.internal.write`,
  `worklog.write`, `website_it_ops.perform`, `request.submit`,
  `scope.create`, `scope.view`, `change_order.create`,
  `change_order.view`). All were already listed in `ORG_SCOPED_ACTIONS`
  for technician, so `authorize()`'s existing
  `actorRole !== "platform_admin"` bypass grants cross-organization
  access with zero other logic changes -- customer roles remain fully
  org-scoped.
- **`netlify/functions/tickets.js`**: fixed a real bug in
  `handleList()`'s action-selection logic. Before this fix, granting
  platform_admin `ticket.view` alone would have routed it into the
  `request.view` branch (which it doesn't have) and produced an
  incorrect 403 -- platform_admin is now routed the same as technician.
- **`src/db/ticketStore.js` / `src/db/ticketWorkflowStore.js`**: had
  **zero audit integration** before this session (confirmed by grep --
  neither file ever called an audit recorder). Every write now records
  an audit event (`ticket.create`, `ticket.transition`, `ticket.triage`,
  `ticket.prioritize`, `ticket.assign`), following the exact
  `resolveAuditRecorder(deps)` pattern already established in
  `invitationStore.js`. `transitionTicket()` and
  `recordTriageResult()`/`recordPriorityAssessment()`/`recordAssignment()`
  signatures gained an explicit `actorId` (and, for
  `recordPriorityAssessment`, `organizationId`) parameter so the audit
  record can name who did what to which org's ticket.

### Step 2 -- audit-log endpoint

- **`src/db/pgAuditSink.js`**: added `queryAuditEvents(filters)` --
  cursor-based (occurred_at, id) keyset pagination, newest-first,
  organization/actor/action/date-range filters, a hard page-size cap
  (100, default 25). Built with `sql.query(text, params)` rather than
  the tagged-template form used elsewhere in this file, since the WHERE
  clause is genuinely conditional on which filters were supplied.
  `listByOrganization()` (the pre-existing method) is unchanged and
  still used by nothing else that needed touching.
- **`netlify/functions/audit-log.js`** (new): `GET /audit-log`,
  platform_admin-only (`audit.review`, already an existing unscoped
  capability -- no rbac.js change needed), strict input validation
  (`limit` must be a positive integer, `dateFrom`/`dateTo` must parse as
  dates), and **audits its own access** (`audit.query`) per Dylan's
  explicit requirement -- caught a real bug here (see below).
- No Care Hub admin UI screen for this yet (that's step 4+ --
  the React/Vite scaffold doesn't exist).

## A real bug, found by live testing and fixed

The live smoke test's first `audit-log.js` self-audit call crashed with
`auditEvent: metadata.filters must be a string, number, boolean, or null
(per SYS-SEC-012 -- no arbitrary payloads in audit logs)`. The original
implementation nested the filter set as `metadata: { filters: {...} }`,
but F008's `assertValidAuditEvent()` has always required metadata values
to be primitives only -- 623 unit tests against fakes never caught this
because none of them exercise the real `assertValidAuditEvent` path with
a nested object. Fixed by flattening every filter into its own top-level
primitive metadata key (`filterOrganizationId`, `filterActorId`, etc.)
and recording `usedCursor: boolean` instead of the raw opaque cursor
value (which encodes a real row's `occurred_at`/`id` and has no reason
to be persisted in a log entry about the fact a query happened).

## Test results

- rbac.js: +2 cases (platform_admin has every technician ticket
  capability cross-org with no assignment fact; platform_admin can
  submit on behalf of any org).
- ticketStore.js / ticketWorkflowStore.js: existing cases updated for
  the new audit-recording signatures, all now assert an audit event (or
  its absence on a rejected transition).
- tickets.js: +2 cases (platform_admin lists and transitions across
  organizations).
- ticket-workflow.js: +1 case (prioritize 404s for a nonexistent
  ticket, matching triage's existing behavior, now that both fetch the
  ticket first).
- pgAuditSink.js: +7 cases for `queryAuditEvents()` (filter
  parameterization, empty-filter path, cursor pagination/trimming,
  cursor encode/decode round-trip, malformed-cursor tolerance, page-size
  clamping).
- audit-log.js: 8 new cases (auth denial, successful query, filter
  forwarding, input validation, self-audit, method-not-allowed).
- Full suite: **637/637 passing**, up from 618 at the end of Session 19.
- `docs/development/evidence/migrations/session-20-rbac-audit-endpoint-live-smoke-test.txt`
  -- 11 checks against the real Neon database, reusing Session 19's
  live organization: platform_admin creates a ticket, lists it (the
  previously-broken path), transitions it with no assignment fact,
  prioritizes it via `ticket-workflow.js`, then queries the real
  `audit-log.js` endpoint and confirms `ticket.create`/`ticket.transition`/
  `ticket.prioritize` are all present, that a second query surfaces the
  first query's own `audit.query` self-audit event, and that a non-admin
  is denied. **11/11 PASS** (10/11 on the first pass, before the
  metadata-shape fix above).

## What's still not done

Steps 3-10 of Dylan's directive are **not started** -- each is
substantial enough to be its own session(s), and none was silently
begun or partially built this session:

1. **TOTP MFA** for platform_admin (RFC 6238 library, encrypted secret
   at rest, hashed one-time recovery codes, pre-auth session, rate
   limiting, full audit coverage).
2. **The React/Vite/TypeScript Care Hub itself** -- no UI exists
   anywhere for any Care Hub feature. This is the single largest
   remaining body of work.
3. Authentication and account shell inside that UI.
4. Tickets and checklists UI, including the customer/staff data split
   for readiness checklists (`customerEditable`/`audience` property,
   separate staff-only notes/verification/approval fields) -- not yet
   built at the persistence or endpoint layer either.
5. Wiring the remaining 22 endpoints into the UI.
6. Square Sandbox integration and fail-closed email configuration.
7. The legal drafts (data-flow/processor inventory, draft Privacy
   Policy, draft Care Hub Terms of Service, launch-time legal review
   checklist) -- all explicitly DRAFT-only per Dylan's directive.
8. Accessibility, security, responsive, and end-to-end testing.

## Files changed

- Modified: `src/policy/rbac.js` (+10 platform_admin capabilities),
  `src/policy/rbac.test.js` (+2 cases), `netlify/functions/tickets.js`
  (action-selection fix + actorId passthrough),
  `netlify/functions/tickets.test.js` (+2 cases), `src/db/ticketStore.js`
  (audit integration), `src/db/ticketStore.test.js` (updated),
  `src/db/ticketWorkflowStore.js` (audit integration),
  `src/db/ticketWorkflowStore.test.js` (updated),
  `netlify/functions/ticket-workflow.js` (actorId/organizationId
  passthrough), `netlify/functions/ticket-workflow.test.js` (+1 case),
  `src/db/pgAuditSink.js` (+`queryAuditEvents`),
  `src/db/pgAuditSink.test.js` (+7 cases).
- New: `netlify/functions/audit-log.js`,
  `netlify/functions/audit-log.test.js`.
- New evidence:
  `docs/development/evidence/migrations/session-20-rbac-audit-endpoint-live-smoke-test.txt`.
- Modified: `docs/development/DEV_STATE.json`,
  `docs/development/DEV_INDEX.md`.
