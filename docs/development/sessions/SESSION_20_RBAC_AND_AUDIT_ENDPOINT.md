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

## What's still not done

Steps 4-10 of Dylan's directive are **not started** -- each is
substantial enough to be its own session(s), and none was silently
begun or partially built this session:

1. **The React/Vite/TypeScript Care Hub itself** -- no UI exists
   anywhere for any Care Hub feature, including no MFA enrollment/
   challenge screens for the backend built this session. This is the
   single largest remaining body of work.
2. Authentication and account shell inside that UI.
3. Tickets and checklists UI, including the customer/staff data split
   for readiness checklists (`customerEditable`/`audience` property,
   separate staff-only notes/verification/approval fields) -- not yet
   built at the persistence or endpoint layer either.
4. Wiring the remaining 22 endpoints into the UI.
5. Square Sandbox integration and fail-closed email configuration.
6. The legal drafts (data-flow/processor inventory, draft Privacy
   Policy, draft Care Hub Terms of Service, launch-time legal review
   checklist) -- all explicitly DRAFT-only per Dylan's directive.
7. Accessibility, security, responsive, and end-to-end testing.

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
