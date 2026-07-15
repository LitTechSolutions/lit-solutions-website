# Session 20 -- platform_admin Ticket RBAC + Audit-Log Endpoint + TOTP MFA

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

### Step 3 -- TOTP MFA for platform_admin

- **`src/security/totp.js`** (new): thin wrapper around `otpauth`
  (RFC 6238), the well-maintained third-party library the directive
  required in place of a hand-rolled implementation --
  `generateTotpSecret()`, `buildOtpauthUri()`, `verifyTotpCode()` (a
  deterministic `timestamp` option makes this fully unit-testable
  without mocking the global clock). Only dependency: `@noble/hashes`, a
  widely-audited, zero-dependency crypto-primitives library.
- **`src/security/mfaCrypto.js`** (new): AES-256-GCM encryption/
  decryption for TOTP secrets at rest (`MFA_ENCRYPTION_KEY`), plus
  one-time recovery code generation (10 codes,
  `XXXXX-XXXXX` shape, no ambiguous characters) and SHA-256 hashing/
  verification for them (deliberately fast, not `scrypt` -- these are
  high-entropy server-generated values, not user-chosen passwords).
- **`netlify/functions/_lib/auth_utils.js`**: added
  `mfaPendingCookie()`/`clearMfaPendingCookie()` (a separate,
  short-lived, 5-minute `lts_mfa_pending` cookie -- never the real
  `lts_session` cookie with a "pending" flag inside it, so every other
  Care Hub endpoint needed zero changes to enforce "no access without
  completing MFA"). `json()` gained `multiValueHeaders` support so a
  response can set the real session cookie and clear the pre-auth
  cookie in the same response, without illegally comma-joining two
  `Set-Cookie` values into one header string.
- **`netlify/functions/auth-login.js`**: a correct password for an
  `"admin"`-role (platform_admin) account no longer issues a real
  session directly -- it issues the pre-auth cookie and reports
  `enrollmentRequired: true/false` depending on `user.mfaEnabled`.
  Customer/staff accounts are completely unaffected (MFA is
  platform_admin-only in this release, per the directive).
- **`netlify/functions/mfa-enroll.js`** (new): `action: "start"`
  generates and stores an encrypted *pending* secret and returns the
  `otpauth://` URI + base32 secret once; `action: "confirm"` validates a
  real 6-digit code against it, and on success activates MFA, generates
  and returns 10 recovery codes once (stored hashed), and upgrades the
  pre-auth cookie to a real session.
- **`netlify/functions/mfa-verify.js`** (new): the challenge step for
  accounts that already have MFA enabled -- accepts either a TOTP code
  or a recovery code (consumed on use, single-use), rate-limited per
  account, issues a real session on success.
- **`netlify/functions/mfa-manage.js`** (new): `action: "disable"` or
  `"reset"`, both requiring a real session AND password
  reauthentication. Both have identical effects on state (clear the
  secret/recovery codes, forcing re-enrollment at the next login, since
  MFA is mandatory) but are audited under distinct action names so the
  log preserves intent. Revokes all other sessions on success, matching
  `account.js`'s existing "rotate on privilege change" rule.
- Every step is audited: `mfa.enroll.start`, `mfa.enroll.confirm`
  (success and failure), `mfa.challenge.success`,
  `mfa.challenge.failure`, `mfa.recovery_code.used`, `mfa.disable`,
  `mfa.reset`. Secrets and recovery codes are never logged anywhere.

### Step 4 -- React/Vite/TypeScript Care Hub scaffold

New top-level `care-hub-app/` -- a separately-scoped, minimal-dependency
React + Vite + TypeScript project (only `react`, `react-dom`,
`react-router-dom` as runtime deps), source-controlled but excluded from
the deploy upload via the new `.netlifyignore`. Builds to `../care-hub`
(repo root, gitignored -- a generated artifact, not source), which
`netlify.toml`'s new `build.command` produces fresh on every real
deploy and which is what actually gets served at `/care-hub/`. The
public marketing site's `netlify.toml` behavior (`publish = "."`, no
prior build command) is otherwise completely unchanged -- every one of
the 33 public HTML pages is still a plain static file with zero build
step, exactly as before.

- **Design tokens**: `src/styles/tokens.css` copies (not references --
  the public site has no shared build step to import from) the exact
  variable names/values from `css/style.css`'s `:root`/
  `:root[data-theme="dark"]` blocks, plus a small set of new Care-Hub-
  only tokens (spacing scale, focus ring, sidebar width) derived from
  the existing palette rather than invented independently.
  `global.css`/`app-shell.css` reuse the public site's exact reset,
  focus-visible, skip-link, and `.btn` conventions so a Care Hub screen
  and a marketing page read as the same product.
- **Typed API client** (`src/api/`): `client.ts` has one typed method
  group per backend endpoint file -- all 24 resource endpoints plus the
  auth-login/mfa-enroll/mfa-verify/mfa-manage/auth-logout login flow --
  with request/response shapes taken directly from each endpoint's own
  route comment and its store's `mapRowTo*()` function (`types.ts`), not
  guessed from REST convention. `errors.ts` defines a typed error
  hierarchy (`SessionExpiredError`/`ForbiddenError`/`RateLimitedError`/
  `RequestError`/`NetworkError`) so calling code branches on error TYPE,
  not a raw re-checked status code. `http.ts` is the single fetch
  wrapper every method goes through, always same-origin credentialed
  (the session cookie is HttpOnly -- this app never reads or stores it).
- **Shared UI states**: `src/components/states/` (Loading, EmptyState,
  ErrorState, UnauthorizedState, SessionExpiredState), all built on one
  accessible `StateScreen` primitive (`role="alert"` for errors,
  `role="status"` + `aria-live="polite"` otherwise). `src/hooks/useApi.ts`
  reduces any API call into loading/success/empty/error/unauthorized/
  expired automatically, using the typed error hierarchy above --
  `routes/Dashboard.tsx` demonstrates the full cycle against the real
  `account.js` endpoint.
- **App shell**: `src/components/AppShell.tsx` (topbar + sidebar,
  landmark roles, skip link) + `src/App.tsx` (React Router, `basename:
  "/care-hub"`). `/tickets`, `/checklists`, `/account` are honest
  `ComingSoon` placeholders, not fake finished screens -- those are
  steps 5-6, not this scaffolding pass.
- **Localization-ready strings**: every user-facing string lives in
  `src/strings/en.ts`, one file, English-only per the directive ("Do not
  localize the Care Hub into all 16 languages yet... localization-ready
  string organization") -- no inline JSX copy to hunt down later.
- **Netlify wiring**: `netlify.toml` gained `build.command` (scoped to
  `care-hub-app/` only) and a `/care-hub/* -> /care-hub/index.html`
  (200) SPA-fallback redirect, placed before the existing catch-all
  `/* -> /404.html` (404) rule since redirects match in order.
  `robots.txt` gained `Disallow: /care-hub/` (the app itself is also
  `<meta name="robots" content="noindex, nofollow">`, belt-and-suspenders).
  New `.netlifyignore` excludes `care-hub-app/` (source) from the
  publish upload -- only its build output is ever served.
- **Verified, not just built**: `npm run build` (from `care-hub-app/`,
  and via the exact `netlify.toml` command string from the repo root)
  both produce a working `/care-hub/index.html` + hashed JS/CSS bundle.
  Loaded in a real browser via `vite preview`: confirmed dark/light
  theme (shared `localStorage` key with the public site), responsive
  sidebar/topbar collapse below 860px, client-side routing (including a
  hard refresh on a deep link, e.g. `/care-hub/tickets`), active-nav
  `aria-current` styling, and the `ErrorState` screen rendering
  correctly for a real failed API call (no backend running in preview
  mode). No auth screens exist yet, so the full loading -> success path
  couldn't be exercised against a real signed-in session this session --
  that's step 5.

### Step 5 -- authentication and account shell

Real login/MFA UI on top of step 4's scaffold, replacing the
unconditional shell render with a genuine signed-in/signed-out gate.

- **`src/auth/AuthContext.tsx`** (new): the one piece of state every
  other screen depends on. On mount, calls `account.get()` (the one
  endpoint every signed-in role can call) to determine `checking` ->
  `signedIn` / `signedOut` -- there is no client-side way to read the
  HttpOnly session cookie directly, so this is the only honest way to
  ask "am I currently signed in." Documented scope limit: a page reload
  mid-MFA-flow (after password, before a TOTP code) does NOT resume that
  pending state -- `account.get()` correctly 401s since no real session
  exists yet, so the user lands back on `/login`. The `lts_mfa_pending`
  cookie itself is still valid server-side for its remaining TTL; this
  app just doesn't currently probe for it before deciding what to show.
- **`src/auth/RequireAuth.tsx`** (new): gates every real screen behind
  `signedIn`, rendering the `AppShell` only once that's confirmed --
  `/login`, `/mfa/enroll`, `/mfa/verify` render outside this and never
  show the nav frame.
- **`src/routes/Login.tsx`** (new): email/password form against the real
  `auth-login.js`. Its response shape decides where the user goes next
  -- a `LoginResult` (non-admin) signs straight in; an `MfaRequiredResult`
  routes to `/mfa/enroll` or `/mfa/verify` per `enrollmentRequired`, per
  the backend's actual trust boundary (this page never issues a session
  for an admin account itself).
- **`src/routes/MfaEnroll.tsx`** (new): calls `mfa-enroll.js`'s
  `action: "start"` on mount, displays the secret as a manual-entry key
  (no QR-code library added -- extra dependency for a scaffold pass;
  `otpauthUri` is fetched but not yet rendered as a scannable code),
  confirms a 6-digit code via `action: "confirm"`, then shows the 10
  recovery codes once with an explicit "I've saved these" acknowledgment
  before completing sign-in -- matching `mfa-enroll.js`'s actual
  one-time-display guarantee.
- **`src/routes/MfaVerify.tsx`** (new): TOTP code or recovery code
  challenge against `mfa-verify.js`, with a toggle between the two
  (recovery code takes precedence if both were somehow submitted,
  matching the backend's own precedence).
- **`AppShell.tsx`**: now shows the signed-in user's name and a real
  sign-out button wired through `AuthContext.signOut()` (calls
  `auth-logout.js`, then flips to `signedOut`) instead of the
  fire-and-forget `window.location.assign` placeholder from step 4.
- **`src/styles/auth.css`** (new): centered card layout shared by all
  three pre-auth screens -- no shell chrome, since there's nothing to
  navigate to yet.
- **Verified in a real browser** (via `vite preview`, no backend
  running): unauthenticated load correctly redirects `/` -> `/login`;
  submitting the login form surfaces a real error state; `/mfa/enroll`
  correctly shows `ErrorState` (no pending cookie in this environment)
  with a working "Try again" -> `/login`; `/mfa/verify` renders and the
  TOTP/recovery-code toggle switches correctly. The full sign-in ->
  dashboard path against a real backend session was not exercised this
  session (no local Blobs emulation available, per the project's
  standing constraint) -- worth a live smoke test in a future session
  once `netlify dev` is exercised end to end for this app.

### Step 6 -- tickets and checklists (backend redesign + UI)

Scoped in full per Dylan's explicit choice among three options offered
this session ("full scope": org-membership endpoint + full checklist
backend redesign + both UIs, rather than deferring the backend work).

**Prerequisite gap closed: `my-memberships.js`.** Before this, nothing
let a signed-in customer discover their own `organizationId` -- every
org-scoped endpoint (tickets, checklists, ...) requires the CALLER to
already know it (`authenticateForOrg()` takes `organizationId` as a
required parameter with no "figure out my org" path, by design --
SYS-AUTH-003). `src/db/membershipStore.js`'s `listMembershipsForUser()`
already existed but had zero call sites anywhere. New endpoint wraps it,
joins organization names via `organizationStore.getOrganizationById()`,
and returns `{ memberships: [{organizationId, organizationName, role,
status}] }` -- platform_admin/technician correctly get an empty array
(they aren't org members), not an error.

**Checklist customer/staff split (owner decision #3) -- built from
scratch, since none of it existed:**

- **Domain** (`src/domain/readinessChecklist.js`): `ChecklistItem`
  gained a required `audience: "customer" | "staff"` field (the
  directive's explicit "customerEditable or audience" property). New
  `ChecklistItemAnswer` (met/comment customer-editable,
  staffNote/staffVerified staff-only) and `ChecklistSubmission`
  (draft/submitted/returned/verified) types + asserts.
- **Policy** (`src/policy/checklistSubmissionWorkflow.js`, new): a
  `transitionChecklistSubmission()` state machine identical in shape to
  `ticketLifecycle.js` -- draft→submitted, submitted→returned/verified,
  returned→submitted (resubmit), verified is terminal. `canCustomerEdit()`
  gates writes to draft/returned only.
- **Migration 004** (`checklist_customer_staff_split.sql`, live-applied
  and verified against Neon): `checklist_responses` gained
  `comment`/`staff_note`/`staff_verified` columns; new
  `checklist_submissions` table (one row per org+definition,
  PK on both).
- **Store** (`src/db/checklistStore.js`, rewritten): `recordCustomerAnswer()`
  refuses staff-audience items and refuses writes outside draft/returned;
  `recordStaffAssessment()` never lets `met` be overwritten for a
  customer-audience item (only `staffNote`/`staffVerified` change on
  those -- `met` is only staff-settable for staff-audience items);
  `submitChecklistForReview()` / `reviewChecklistSubmission()` drive the
  workflow (`reviewChecklistSubmission` requires a `reviewNote` when
  returning, per "Staff can return it for changes"); `getChecklistForCustomer()`
  returns customer-audience items only with met/comment (plus the
  returned-review's `reviewNote`, since that message is addressed to the
  customer) and NEVER staffNote/staffVerified; `getChecklistForStaff()`
  returns everything plus the computed score. New `listChecklistDefinitions()`
  (title-only) closes a second discovery gap -- nothing previously let
  either role learn which checklist(s) exist to complete/assess at all.
  Every write is audited (`checklist.answer`, `checklist.staff_assess`,
  `checklist.submit`, `checklist.return`, `checklist.verify`).
- **RBAC**: new `checklist.answer` capability, granted to `org_owner`/
  `org_member` (NOT `read_only_customer` -- that role stays view-only,
  per the directive's "Customers may... edit" implying the answer-
  capable roles, not every customer role) and added to
  `ORG_SCOPED_ACTIONS`.
- **Endpoint** (`netlify/functions/checklists.js`, rewritten): `GET`
  branches on caller role (platform_admin → full staff view via
  `customer.administer`; customer roles → shielded view via
  `checklist.view`) and on whether `checklistDefinitionId` was supplied
  (omit it to list definitions instead). `PATCH` dispatches on
  `body.action` (`customerAnswer`/`submit`/`staffAssess`/`review`), each
  with its own capability check.
- **A real bug, found by the live smoke test and fixed**: `reviewChecklistSubmission()`'s
  return value was built by spreading the pre-transition `current`
  submission object, which meant verifying a checklist that had
  previously been returned-for-changes leaked the OLD `reviewNote` back
  in the API response, even though the database write correctly cleared
  it to `null`. Fixed by building the return value from scratch instead
  of spreading stale state; regression test added
  (`checklistStore.test.js`) alongside the live re-verification.
- **Live smoke test**: 23/23 PASS against real Neon, the full lifecycle
  end to end -- create definition → customer answers a customer item →
  customer is refused on a staff item (400) → customer's shielded GET
  shows exactly one item and no staff fields → submit ("Submitted for
  review.") → customer is refused editing while under review (400) →
  staff assesses the staff-only item and verifies the customer's item →
  staff's full GET shows both items, the real staffNote, and a 1.0 score
  → staff returns for changes without a note (400, rejected) → staff
  returns WITH a note (200) → customer sees the review note and can edit
  again → customer resubmits → staff verifies ("Verified.") → customer
  can no longer edit (400) → `read_only_customer` can view but not
  answer (403).

**Tickets UI** (`care-hub-app/src/routes/Tickets.tsx`, new): org-scoped
list (via the new membership discovery) + an inline create form against
the existing, already-complete `tickets.js`. No detail/transition UI for
individual tickets -- `tickets.js` has no "fetch one ticket by id" route
to build a detail page against, and PATCH (status transition) is a
staff/technician action outside this pass's customer-facing scope. A
real pre-existing RBAC gap surfaced while building this, **not
introduced or fixed this session**: `org_owner` has neither
`request.submit` nor `request.view` in `rbac.js` (only `org_member` and
`platform_admin` do), so an `org_owner`-role user will get a real 403
from `tickets.js` today -- the UI surfaces this honestly via
`UnauthorizedState` rather than hiding it, but it's worth Dylan's
attention as a possible RBAC oversight from Session 1, not something
this session should silently patch.

**Checklist UI** (`care-hub-app/src/routes/Checklists.tsx`, new):
definition picker (when more than one exists) → per-item Yes/No + an
optional comment, disabled once submitted/verified → "Submit for
review" → status banner reflecting draft/submitted/returned (with the
staff feedback note)/verified. Staff-side assessment/review screens
were NOT built this session (out of scope for "customers can complete
this themselves" -- deferred to a future staff-tools session, tracked
below).

**Frontend verification limits, stated honestly**: `care-hub-app`
builds and type-checks cleanly (`tsc --noEmit && vite build`) with both
new routes wired into `App.tsx`. Unlike step 5's login/MFA screens
(verified rendering via `vite preview` with no backend), the Tickets/
Checklists screens require a signed-in session's `account.js` response
to render past the loading state, and this session could not get a
faked `fetch` response installed before `AuthProvider`'s mount-time
effect fires in `vite preview` (the preview server's every navigation
is a full page reload, which clears any in-page monkey-patch before
the app's own script runs) -- a real limitation of this environment,
not a claim that the components were visually verified. Backend
correctness for everything these screens call is fully covered by the
23-check live smoke test above; the frontend components themselves
follow the exact same `useApi()`/state-switch pattern already verified
end-to-end in `Dashboard.tsx` (step 4/5).

### Step 7 -- finish the staff side of tickets and checklists

Scoped explicitly by Dylan (offered three options: finish the staff
side of what exists / customer read-only views / admin ops screens --
"finish the staff side" chosen), rather than attempting all ~20
remaining endpoints in one pass.

- **Staff checklist review** (`Checklists.tsx` extended): `Checklists()`
  now branches on `useAuth()`'s legacy session role -- `"admin"` gets
  `StaffChecklists`, everyone else gets the existing customer flow.
  Staff enter an organization id manually (no organization-directory
  endpoint exists yet -- same gap as the work queue below, tracked as a
  follow-up, not invented this pass) then get the full
  `getForStaff()` view: every item (both audiences), a per-item
  `staffAssess` control (verify checkbox, internal note, and a met
  Yes/No for staff-audience items only -- customer-audience items show
  the customer's own answer/comment read-only, never overridable here),
  and submission-level "Mark verified" / "Return for changes" (which
  requires a reason, matching `checklistStore.js`'s own requirement).
- **Staff ticket work queue** (`Tickets.tsx` extended): same role
  branch -- `"admin"` gets `StaffWorkQueue`, backed by the existing
  `work-queue.js` (F051, built in an earlier session, the one
  legitimate cross-org query in this codebase). Lists every open ticket
  grouped by priority with an inline status-transition control per
  ticket. There is still no single-ticket-fetch endpoint to build a
  separate detail page against, so this list doubles as the detail/
  transition surface, per the directive's actual constraint rather than
  inventing a new backend route. The dropdown offers every ticket
  status and lets `tickets.js`'s real `ticketLifecycle.js` state machine
  accept or reject the choice -- the frontend does not duplicate the
  legal-transition rules.
- No backend changes this step -- pure frontend work reusing endpoints
  already built and live-verified in earlier steps. `763/763` unit
  tests unaffected; `care-hub-app` builds and type-checks cleanly.

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
- Full suite (steps 1-2): 637/637 passing, up from 618 at the end of
  Session 19.
- mfaCrypto.js: 11 cases (encrypt/decrypt round-trip, random IV per
  call, wrong-key rejection, tampered-ciphertext rejection, malformed
  key rejection, recovery code shape/alphabet, deterministic generation
  with injected randomness, hash/verify round-trip incl.
  case/whitespace tolerance, wrong-code rejection, malformed-hash
  tolerance).
- totp.js: 9 cases (secret generation/uniqueness, otpauth URI shape,
  correct/incorrect code, clock-skew window tolerance, malformed-input
  tolerance, wrong-secret rejection).
- auth_utils.js (`json()`): 4 cases for the new `multiValueHeaders`
  support.
- auth-login.js: 8 new cases (non-admin unaffected, admin with/without
  prior enrollment, wrong password never reaches the MFA branch,
  unverified account still blocked first, rate limiting, method
  guard).
- mfa-enroll.js: 12 cases (missing/invalid pending token, already-
  enrolled guard, start generates+stores an encrypted pending secret and
  audits it, rate limiting on both actions, confirm rejects/accepts a
  code with correct audit outcome, confirm activates MFA + issues
  recovery codes + upgrades to a real session, a full real-otpauth
  round-trip, unknown action, method guard).
- mfa-verify.js: 12 cases (missing/invalid pending token, no-code-or-
  recovery-code guard, not-yet-enrolled guard, rate limiting, correct/
  incorrect TOTP code with correct audit outcome and cookie behavior,
  valid recovery code consumed exactly once, reuse of a consumed code
  denied, unknown recovery code denied, recovery code takes precedence
  over a simultaneously-supplied TOTP code, a full real-otpauth
  round-trip, method guard).
- mfa-manage.js: 9 cases (missing session, non-admin role denied,
  unknown action, missing password short-circuits before rate limiting,
  rate limiting, wrong password denied+audited+state unchanged, disable
  clears state+audits+revokes sessions, reset has the same effect under
  a distinct audit action, method guard).
- Full suite (all of Session 20): **702/702 passing**.
- `docs/development/evidence/migrations/session-20-rbac-audit-endpoint-live-smoke-test.txt`
  -- 11 checks against the real Neon database (steps 1-2, unchanged from
  the first pass of this session).
- `docs/development/evidence/migrations/session-20-mfa-live-smoke-test.txt`
  -- 15 checks against the real Neon database (audit trail only --
  Blobs, where the actual user records live, has no working local
  emulator, so the user store was faked and only the Postgres audit
  writes were verified live, matching this project's established hybrid
  smoke-test pattern): a real enrollment start, a real enrollment
  confirm using an actual otpauth-generated code, a real successful
  challenge, a real failed challenge, a real recovery-code redemption,
  a real disable, then a fresh `audit-log.js` query confirming all six
  `mfa.*` actions landed as real rows. **15/15 PASS**.
- `docs/development/evidence/migrations/session-20-migration-004-checklist-split.txt`
  -- live migration 004 run (a first successful pass, plus a second
  invocation confirming it correctly rejects re-application rather than
  silently no-op'ing).
- `docs/development/evidence/migrations/session-20-checklist-customer-staff-split-live-smoke-test.txt`
  -- the full checklist lifecycle above, **23/23 PASS** against real
  Neon (22/23 on the first pass, before the `reviewChecklistSubmission()`
  stale-`reviewNote` fix above).
- checklistStore.js: rewritten, 24 cases (was 4) -- every function above
  plus the stale-reviewNote regression test.
- checklists.js: rewritten, 19 cases (was 6).
- checklistSubmissionWorkflow.js (new): 11 cases.
- readinessChecklist.js domain (new test file): 15 cases for the new
  asserts/constants.
- readinessChecklist.js policy: existing cases updated for the new
  required `audience` field.
- rbac.js: +1 case (`checklist.answer` granted to org_owner/org_member,
  not read_only_customer).
- my-memberships.js (new): 5 cases.
- Full suite: **763/763 passing**, up from 702 at the end of step 5.

### Step 9 -- legal drafts (data-flow inventory, Privacy Policy, ToS, launch checklist)

Documentation only, no code -- Dylan chose this over step 10
(a11y/security/e2e testing) and step 8 (Square/email, which needs
externally-supplied credentials this session cannot accept). All four
deliverables live under `docs/development/legal/`, each explicitly
marked DRAFT per the standing rule against inventing final,
attorney-approved legal wording:

- **`00_LEGAL_DRAFTS_README.md`** -- orientation: what's in the folder,
  why now, how the Care Hub drafts relate to the existing public-site
  `privacy.html`/`terms.html` (separate documents, not a rewrite), and
  what was deliberately not invented (Square and F060 AI are described
  as planned/not-active, not live).
- **`DATA_FLOW_AND_SUBPROCESSORS.md`** -- the factual source of truth
  the other three documents are built from: every data category
  actually collected (cross-referenced against `migrations/001-004`
  and the Blobs stores), every real sub-processor (Netlify, Neon,
  Resend, planned Square), and the Session 17 retention targets
  (30-day/12-month/24-month/7-year/90-day) explicitly flagged as
  *approved policy, not yet enforced by code*.
- **`CARE_HUB_PRIVACY_POLICY_DRAFT.md`** -- scoped to the authenticated
  portal specifically, written to name Resend as a sub-processor
  (closing part of what open audit finding F007 flags as missing from
  the *public* site) and to accurately describe the full data model
  (open audit finding F006's gap) for the Care Hub itself. Drafting
  notes at the bottom flag that this does not resolve F006/F007
  against `privacy.html` -- that's the audit process's job, not this
  draft's.
- **`CARE_HUB_TERMS_OF_SERVICE_DRAFT.md`** -- covers accounts, roles,
  acceptable use, content ownership, and termination from what's
  actually built (invite-only registration, RBAC roles, service
  records). Liability/indemnification and governing-law/dispute
  clauses are left as explicit placeholders, not generic boilerplate,
  since those require attorney judgment this session isn't positioned
  to invent.
- **`LAUNCH_LEGAL_REVIEW_CHECKLIST.md`** -- every open item gating real
  customer accounts, organized as blocking-now / blocking-before-Square
  / blocking-before-AI / should-resolve / verify-before-launch, so a
  future session or Dylan directly can see exactly what's left without
  re-deriving it.
- A new `DECISION_LOG.md` entry records why the Care Hub drafts stay
  separate from (not merged into) the public site's existing policies.
- No test/build impact -- this step touched no application code.
  `npm test` (763/763) and `care-hub-app`'s `npm run build` were
  re-verified after this step purely to confirm the doc-only nature of
  the change, not because anything here could plausibly break them.

## What's still not done

Step 7 closed the two staff-side gaps called out at the end of step 6
(staff checklist review, staff ticket work queue/transition). Step 9
delivered the legal drafts. Steps 8 and 10 of Dylan's directive are
**not started** -- each is substantial enough to be its own session(s):

1. Wiring the remaining endpoints into real screens beyond tickets and
   checklists -- the typed client covers all of them, but only
   `Dashboard.tsx`, `Tickets.tsx`, and `Checklists.tsx` actually call one
   from a rendered route.
2. Square Sandbox integration and fail-closed email configuration --
   blocked on Dylan supplying real Square/Resend credentials via
   Netlify environment variables (cannot be pasted into chat or
   committed).
3. Accessibility, security, responsive, and end-to-end testing at
   real-feature scale.
4. QR-code rendering for MFA enrollment (currently manual-entry key
   only).
5. A live smoke test of the real sign-in -> MFA -> dashboard ->
   tickets/checklists path against `netlify dev` -- this session
   verified the backend live (Postgres) and the frontend's build/
   typecheck/component logic, but could not get a faked authenticated
   session rendering in the browser preview (see step 6's "frontend
   verification limits" note above). Still applies to step 7's new
   staff screens.
6. The pre-existing `org_owner` ticket-capability gap surfaced in step 6
   (`org_owner` lacks `request.submit`/`request.view` in `rbac.js`,
   unlike `org_member`) -- flagged for Dylan's attention, not fixed,
   since it predates this session and changing it wasn't requested.
7. No organization-directory/list-all-orgs endpoint exists, so the new
   staff checklist review screen requires staff to manually type an
   `organizationId` into a text input rather than picking from a list --
   documented as a stopgap in `staffOrgPickerHelp`, not built out this
   pass since it was out of step 7's chosen scope.
8. No single-ticket-fetch-by-id endpoint exists on `tickets.js` -- the
   staff ticket work queue (`work-queue.js`, cross-org, open tickets
   only) doubles as the "detail" surface via an inline per-row
   status-transition control, rather than a dedicated detail page.
9. Everything itemized in `docs/development/legal/
   LAUNCH_LEGAL_REVIEW_CHECKLIST.md` -- attorney review of the new
   drafts, resolving audit findings F006/F007 against the *existing*
   `privacy.html`, filling in the Terms of Service's placeholder
   liability/governing-law sections, and the several pricing/
   object-storage owner decisions those drafts depend on.

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
- New (step 3, MFA): `src/security/totp.js`, `src/security/totp.test.js`,
  `src/security/mfaCrypto.js`, `src/security/mfaCrypto.test.js`,
  `netlify/functions/mfa-enroll.js`,
  `netlify/functions/mfa-enroll.test.js`,
  `netlify/functions/mfa-verify.js`,
  `netlify/functions/mfa-verify.test.js`,
  `netlify/functions/mfa-manage.js`,
  `netlify/functions/mfa-manage.test.js`,
  `netlify/functions/_lib/auth_utils.test.js`,
  `netlify/functions/auth-login.test.js`.
- Modified (step 3, MFA): `netlify/functions/_lib/auth_utils.js`
  (`mfaPendingCookie`/`clearMfaPendingCookie`, `multiValueHeaders`
  support in `json()`), `netlify/functions/auth-login.js` (platform_admin
  MFA branching), `package.json`/`package-lock.json` (+`otpauth`
  dependency, which pulls in `@noble/hashes`).
- New evidence:
  `docs/development/evidence/migrations/session-20-rbac-audit-endpoint-live-smoke-test.txt`,
  `docs/development/evidence/migrations/session-20-mfa-live-smoke-test.txt`.
- Modified: `docs/development/DEV_STATE.json`,
  `docs/development/DEV_INDEX.md`, `docs/development/DECISION_LOG.md`
  (+4 entries for step 3), `docs/development/DEPLOYMENT_PLAN.md`
  (`MFA_ENCRYPTION_KEY` documented).
- New (step 4, Care Hub scaffold): `care-hub-app/` (new project --
  `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`,
  `README.md`, and under `src/`: `main.tsx`, `App.tsx`,
  `vite-env.d.ts`, `api/{client,errors,http,types}.ts`,
  `components/AppShell.tsx`, `components/states/{StateScreen,Loading,
  EmptyState,ErrorState,UnauthorizedState,SessionExpiredState}.tsx`,
  `hooks/useApi.ts`, `routes/{Dashboard,ComingSoon,NotFound}.tsx`,
  `strings/en.ts`, `styles/{tokens,global,app-shell}.css`).
- New: `.netlifyignore` (excludes `care-hub-app/` from the publish
  upload).
- Modified: `netlify.toml` (+`build.command` scoped to `care-hub-app/`,
  +`/care-hub/*` SPA-fallback redirect before the existing catch-all),
  `.gitignore` (+`/care-hub/`, the gitignored build output directory),
  `robots.txt` (+`Disallow: /care-hub/`).
- New (step 5, auth/account shell): `care-hub-app/src/auth/
  {AuthContext,RequireAuth}.tsx`, `care-hub-app/src/routes/
  {Login,MfaEnroll,MfaVerify}.tsx`, `care-hub-app/src/styles/auth.css`.
- Modified (step 5): `care-hub-app/src/App.tsx` (real routing +
  `AuthProvider`/`RequireAuth` wiring, replacing the always-rendered
  shell), `care-hub-app/src/components/AppShell.tsx` (`userName` prop,
  real `onSignOut` via `AuthContext`), `care-hub-app/src/strings/en.ts`
  (+auth/MFA UI strings), `care-hub-app/src/main.tsx` (+`auth.css`
  import).
- New (step 6, backend): `netlify/functions/my-memberships.js` +
  `.test.js`, `src/policy/checklistSubmissionWorkflow.js` + `.test.js`,
  `src/domain/readinessChecklist.test.js`,
  `migrations/004_checklist_customer_staff_split.sql`.
- Modified (step 6, backend): `src/domain/readinessChecklist.js`
  (audience field + new asserts), `src/policy/readinessChecklist.js`
  test fixtures (audience added), `src/db/checklistStore.js` (full
  rewrite: `recordCustomerAnswer`/`recordStaffAssessment`/
  `submitChecklistForReview`/`reviewChecklistSubmission`/
  `getChecklistForCustomer`/`getChecklistForStaff`/
  `listChecklistDefinitions`, replacing `recordChecklistResponse`/
  `getChecklistScore`), `src/db/checklistStore.test.js` (rewritten,
  +stale-reviewNote regression case), `netlify/functions/checklists.js`
  (rewritten: role-based GET shape, 4-action PATCH dispatch, list mode),
  `netlify/functions/checklists.test.js` (rewritten), `src/policy/rbac.js`
  (+`checklist.answer`), `src/policy/rbac.test.js` (+1 case).
- New evidence: `docs/development/evidence/migrations/session-20-migration-004-checklist-split.txt`,
  `docs/development/evidence/migrations/session-20-checklist-customer-staff-split-live-smoke-test.txt`.
- New (step 6, frontend): `care-hub-app/src/api/memberships.ts`,
  `care-hub-app/src/hooks/useMemberships.ts`,
  `care-hub-app/src/routes/Tickets.tsx`,
  `care-hub-app/src/routes/Checklists.tsx`.
- Modified (step 6, frontend): `care-hub-app/src/api/types.ts` (checklist
  types redesigned: `ChecklistItemAnswer`-shaped `CustomerChecklistAnswer`/
  `StaffChecklistAnswer`, `ChecklistSubmission`, `CustomerChecklistView`,
  `StaffChecklistView`, `ChecklistDefinitionSummary`),
  `care-hub-app/src/api/client.ts` (`checklists` namespace rewritten to
  match: `list`/`getForCustomer`/`getForStaff`/`answer`/`submit`/
  `staffAssess`/`review`), `care-hub-app/src/App.tsx` (real `Tickets`/
  `Checklists` routes replacing `ComingSoon`), `care-hub-app/src/strings/en.ts`
  (+tickets/checklists sections).
- Modified (step 7, frontend -- no backend changes this step): `care-hub-app/
  src/routes/Tickets.tsx` (top-level `Tickets()` now branches on
  `authState.user.role === "admin"`; new `StaffWorkQueue`/`StaffTicketRow`
  components reusing `work-queue.js` (F051) for a cross-org open-tickets
  view grouped by priority, with an inline status-transition dropdown per
  ticket calling `api.tickets.transition()`; original customer components
  renamed to `CustomerTickets` and preserved unchanged),
  `care-hub-app/src/routes/Checklists.tsx` (same branching pattern; new
  `StaffChecklists`/`StaffChecklistsForOrg`/`StaffChecklistDetail`/
  `StaffChecklistItemRow` components for staff review -- per-item
  `staffVerified`/`staffNote`/`met` (staff-audience items only) via
  `api.checklists.staffAssess()`, plus submission-level Return-for-changes/
  Mark-verified via `api.checklists.review()`; original customer
  components renamed to `CustomerChecklists` and preserved unchanged),
  `care-hub-app/src/strings/en.ts` (+`tickets.workQueueTitle`/
  `workQueueEmptyTitle`/`workQueueEmptyBody`/`organizationLabel`/
  `priorityLabels`/`statusLabel`/`transitionButton`/`transitioning`,
  +`checklists.staffOrgPickerLabel`/`staffOrgPickerHelp`/`staffLoadButton`/
  `staffVerifiedLabel`/`staffNoteLabel`/`staffAnswerLabel`/
  `saveAssessment`/`savingAssessment`/`returnForChanges`/
  `returnReasonLabel`/`returnButton`/`verifyButton`/`reviewing`/
  `scoreLabel`/`audienceLabels`).
- New (step 9, legal drafts -- docs only, no code):
  `docs/development/legal/00_LEGAL_DRAFTS_README.md`,
  `docs/development/legal/DATA_FLOW_AND_SUBPROCESSORS.md`,
  `docs/development/legal/CARE_HUB_PRIVACY_POLICY_DRAFT.md`,
  `docs/development/legal/CARE_HUB_TERMS_OF_SERVICE_DRAFT.md`,
  `docs/development/legal/LAUNCH_LEGAL_REVIEW_CHECKLIST.md`.
- Modified (step 9): `docs/development/DECISION_LOG.md` (+1 entry on
  keeping the Care Hub legal drafts separate from the public site's
  `privacy.html`/`terms.html`).
