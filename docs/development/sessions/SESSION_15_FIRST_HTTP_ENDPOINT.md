# Session 15 — First Netlify Function HTTP Endpoint (tickets.js), a Testable Endpoint Layer

## Summary

Sessions 10–14 built a complete domain/policy/persistence stack for the
Business Care Hub, but none of it was reachable over HTTP — zero Netlify
Function endpoints existed for any Care Hub feature. This session started
that work, choosing `tickets.js` (F019/F023) as the first endpoint since it
has the fullest already-built and already-live-verified stack underneath
it (Session 13's smoke test proved the store layer works live).

Building this one endpoint surfaced and resolved two real problems worth
recording, not just the endpoint itself.

## What was built

### 1. `netlify/functions/_lib/care_hub_auth.js` — session cookie → RBAC bridge

The existing session system (`auth_utils.js`, F003/F004) is Blobs-backed
and produces a flat `customer`/`staff`/`admin` role that has no relationship
to the Care Hub's org-scoped RBAC (`src/policy/rbac.js`, F005). This module
bridges the two: `authenticateForOrg(event, organizationId, deps)` resolves
the session cookie to a `userId`, then calls
`membershipStore.resolveAuthorizationContext()` — the exact function
Session 10 built specifically to feed `rbac.authorize()`. `denyResponseFor()`
runs the real authorization decision and returns a ready 403 response or
`null`. Every Care Hub endpoint going forward should authenticate through
this module rather than reading the legacy session/role directly.

### 2. `getAssignedTechnician()` added to `ticketWorkflowStore.js`

An endpoint must never trust a client's claim of "I'm assigned to this
ticket" — `rbac.js`'s technician authorization path requires a genuine
`assigned: true` fact. This queries the real `assignments` table so that
fact is backed by data, not an assertion. 2 new test cases.

### 3. `netlify/functions/tickets.js` — the endpoint

- `POST` — create a ticket (`request.submit`)
- `GET ?organizationId=...` — list tickets for an org (`request.view` for
  customers; technicians are deliberately denied — see below)
- `PATCH` — transition a ticket's status (`ticket.work`, requires a real
  assignment)

Every actual decision — field validation, transition legality,
authorization — still happens in the already-tested `ticketSubmission.js`,
`ticketLifecycle.js`, and `rbac.js`. This file only authenticates,
authorizes, and translates HTTP into calls against `ticketStore.js`.

### A discovered gap, documented rather than patched over

`rbac.js`'s technician `ticket.view` check is inherently per-resource
(`assigned: true` for *one* ticket) — it cannot honestly authorize "list
every ticket in an organization" for a technician, since there's no single
resource to check assignment against. `tickets.js`'s `GET` correctly
**denies** technicians rather than fabricating an `assigned: true` it
can't back up. The right tool for staff-wide visibility already
exists — `src/admin/workQueueViewModel.js` (F051) — it just doesn't have
an HTTP endpoint yet. Flagged as follow-up work in `DEV_STATE.json`, not
silently worked around.

### A real architecture problem, solved rather than deferred: the endpoint layer was untestable

No Netlify Function in this repository has ever been unit-testable.
`@netlify/blobs` throws `MissingBlobsEnvironmentError` outside a real
Netlify runtime, and setting up `netlify dev`'s local Blobs emulation this
session hit a dead end: the CLI auto-detects a linked site by matching
this repo's git remote, but that site's `addons` endpoint returned a 404
under the current login, crashing `netlify dev`; running with `--offline`
avoided the crash but also skipped Blobs emulation setup entirely.

Rather than leave the endpoint layer permanently untested (or touch
production Blobs data to work around it — explicitly ruled out, see
"What was decided" below), `care_hub_auth.js` and `tickets.js` were both
given the same `deps = {}` override seam every `src/db/*` store already
uses:

```js
exports.handler = async (event, context, deps = {}) => { ... }
```

Netlify always invokes handlers with exactly `(event, context)`, so `deps`
defaults to the real implementations in every real invocation — zero
behavior change in production. Tests can now inject a fake session
resolver while the real `rbac.js` and real Postgres store functions still
run underneath, closing one real slice of audit finding F016 ("zero
automated tests... in the pre-Care-Hub repository") for the first time in
the `netlify/functions/` layer.

## What was decided (asked, not assumed)

Before writing any endpoint code, Dylan was asked how to handle live
testing given that the session layer requires Netlify Blobs, which has no
separate dev store — unlike the dedicated Neon database, Blobs is tied to
the real deployed site. Three options were presented: set up `netlify-cli`
for local-only testing (recommended), skip live auth testing for now, or
use production Blobs directly (fast, but writes test data into the same
store real customer accounts live in). **Dylan chose local `netlify-cli`
setup.** Production Blobs was never touched. `netlify-cli` was added as a
devDependency and is already authenticated on this machine (pre-existing
login as Dylan Little); the site-linking dead end described above didn't
block progress because the DI seam made live-Blobs testing unnecessary for
this endpoint.

## Test results

- `netlify/functions/tickets.test.js` — 12 cases against fake SQL/session
  deps: no session → 401, no membership → 403, wrong capability
  (`read_only_customer` posting) → 403, suspended membership → 403
  (SYS-AUTH-005), org_member create/list succeed, technician list
  correctly denied, assigned-technician transition succeeds,
  non-assigned-technician transition denied, malformed input → 400/405.
- `docs/development/evidence/migrations/session-15-tickets-endpoint-live-smoke-test.txt`
  — 9 checks, same handler and fake-session deps, but
  `resolveAuthorizationContext`/`createTicket`/`listTicketsForOrganization`/
  `transitionTicket` all ran for real against the live Neon database.
  Reused Session 13's "Smoke Test Org", added real `org_member`,
  `technician`, and `read_only_customer` memberships, created a real
  ticket through the real HTTP handler, listed it, denied an unauthorized
  create, denied an unassigned technician's transition attempt, and
  transitioned a real ticket `submitted → triaged` — then confirmed an
  illegal jump (`triaged → closed`) is still rejected end to end. **9/9
  PASS.**
- Full suite: 409/409 passing (`npm test`), up from 389 at the end of
  Session 14.

## What's still not done

- 20 more Netlify Function endpoints remain to expose the rest of the
  persistence layer (organizations, approvals, activity events, scope of
  work, change orders, payment requests, entitlements, subscriptions,
  technology assets, backups, reminders, IT support classification,
  checklists, work queue, metrics, templates, webhook events). `tickets.js`
  is the template for the pattern established this session — auth bridge
  + deps-injection seam — not a one-off.
- No UI exists for any Care Hub feature.
- Staff-wide ticket visibility (the work queue) has no HTTP endpoint yet.
- The registration model (F002, still an open owner decision) means there
  is still no automatic path from a new customer signup to a Care Hub
  organization membership — every endpoint requires one to be created by
  hand until that's resolved. This is now the most urgent of the 7
  remaining owner decisions, since it blocks every endpoint from being
  reachable by a real new customer, not just F002 itself.
- `netlify dev`'s local Blobs emulation is still not working from this
  machine's current Netlify login/site link — not a blocker for anything
  built this session, but worth Dylan's attention if future endpoints
  need it (e.g., testing the legacy auth endpoints themselves, which
  weren't touched this session).

## Files changed

- New: `netlify/functions/_lib/care_hub_auth.js`, `netlify/functions/tickets.js` (+`tickets.test.js`)
- Modified: `src/db/ticketWorkflowStore.js` (+test cases), `package.json` (added `netlify-cli` devDependency), `.env` (added a locally-generated, gitignored `LTS_SESSION_SECRET`)
- Modified: `docs/development/REQUIREMENTS_TRACEABILITY.md`, `docs/development/DEV_STATE.json`
- New evidence: `docs/development/evidence/migrations/session-15-tickets-endpoint-live-smoke-test.txt`
