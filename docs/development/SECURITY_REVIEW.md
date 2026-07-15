# Security Review — Session 9 (Release Readiness), updated Session 20 step 10

**Session 20 step 10 addendum is at the bottom of this file.** Everything
above the `## Session 20 step 10` heading is the original Session 9
review, preserved as written — by then, 25 real HTTP endpoints, a live
Postgres database, TOTP MFA, and a React frontend exist, so most of
Session 9's "not applicable yet" caveats no longer hold. Read the
addendum for the current state; the original text below is historical
context for how the review evolved.

This review covers what exists as of Session 9: 27 functions' worth of domain/policy logic (`src/`), zero Netlify Function endpoints, zero UI. Most standard security review activities (penetration testing, auth bypass testing against a live endpoint, dependency scanning against a real deploy) are **not applicable yet** because there is nothing deployed to test — noted explicitly below rather than skipped silently, per the master instruction's "no silent caps" principle.

## What exists and was reviewed

### Authorization (F005 — `src/policy/rbac.js`)
- Default-deny confirmed by test (`rbac.test.js`, 18 cases): unknown role, unknown action, and missing context all deny.
- Two-organization tenant isolation confirmed by test: `org_owner`/`org_member`/`read_only_customer` of Org A cannot act on Org B resources; `platform_admin` correctly bypasses this for platform-scoped actions.
- Membership-status enforcement (SYS-AUTH-005) confirmed: a suspended membership is denied even acting within its own organization; omitting `actorMembershipStatus` entirely fails closed rather than defaulting to allowed. This was a real bug caught by testing during Session 1 and fixed before merge — see `DECISION_LOG.md`.
- Automated-service actions require an explicit per-call grant and cannot cross organization boundaries even with a grant (SYS-AUTH-008 — cannot impersonate a human approver).
- **Not yet reviewable:** whether `rbac.js` is actually *called* on every real request path — it isn't wired to any endpoint yet, so this is a policy-correctness review, not a coverage review.

### Audit trail (F008 — `src/audit/`)
- Event shaping rejects non-primitive metadata values (SYS-SEC-012 — no arbitrary payloads in audit logs), confirmed by test.
- The Blobs-backed sink (`blobsAuditSink.js`) is written but **not integration-tested** — no live Netlify Blobs credentials are available in this environment. Flagged as a required smoke test before this sink is trusted in production.
- **Not yet reviewable:** no function in the codebase actually calls the audit recorder yet, so there's no real audit coverage to verify.

### File upload validation (F015 — `src/policy/fileValidation.js`)
- Size limit, MIME allowlist, and magic-byte verification all confirmed by test, including a deliberate MIME-spoofing case (declares PDF, bytes are actually PNG) that's correctly rejected.
- Defaults (25MB, specific MIME allowlist) are engineering defaults, not an owner-reviewed policy — flagged in `OWNER_DECISIONS.md`/`DEV_STATE.json` throughout.
- **Not yet reviewable:** no malware-scanning/quarantine integration exists; `FileAsset.scanStatus` is modeled but nothing sets it.

### Webhook verification (F057 — `src/webhooks/webhookVerification.js`)
- HMAC signature verification, timestamp/replay-window rejection, tampered-payload rejection, and wrong-secret rejection all confirmed by test. Uses `crypto.timingSafeEqual` (not a naive string comparison) to avoid timing side-channels, with a length-mismatch guard so a malformed signature fails cleanly instead of throwing.
- **Not yet reviewable:** no actual webhook integration exists to verify signatures for.

### Data minimization
- `MetricEvent` (F054) has exactly 3 allowed fields and structurally no payload field — verified by test that extra fields are rejected.
- `ChecklistResponse` (F046/F047) is boolean-only (`met: true/false`) — structurally cannot carry a credential or secret value, verified by test.
- `assertValidSetting` (F056) rejects values that pattern-match common secret-like strings (heuristic, documented as imperfect defense-in-depth, not a hard guarantee).
- `evidenceCategorization.js` (F040/F042) rejects "guaranteed"/"100% secure"/"fully WCAG compliant"/"certified secure" language anywhere evidence text is added — a regex heuristic, same caveat.

### Template rendering (F055)
- Two independent allowlist checks confirmed by test: a template cannot reference an undeclared variable, and a caller cannot supply a variable the template didn't declare. Both are needed — either alone leaves a data-leak path open.

### Export (F053)
- CSV export requires an explicit column allowlist per call — confirmed by test that fields not in the allowlist never appear in output, even if present on the source row object.
- Proper CSV injection-relevant escaping (quotes doubled, fields with commas/quotes/newlines quoted) confirmed by test. **Note:** this does not address CSV formula injection (a field value starting with `=`, `+`, `-`, or `@` being interpreted as a formula by spreadsheet software) — not currently guarded against. Flagged here as a gap to address before F053's export endpoint is built, not fixed speculatively since the actual export UI doesn't exist yet to know what values might reach it.

## Explicitly not applicable at this stage

Per the master instruction's Session 9 checklist, the following require a live deployment, real endpoints, or a chosen provider — none of which exist yet in this workspace (standing instruction: stay local, nothing pushed):

- Penetration/injection testing against a running server
- CSRF/CORS/session-cookie header testing (F003's existing mechanics are reused as-is, unmodified — see `AUTHORIZATION_MODEL.md`; nothing new to test here)
- Rate-limit testing against real traffic
- Dependency vulnerability scan (only `@netlify/blobs` is a dependency; `npm audit` was not run this session since no new dependencies were added — worth running before any deploy)
- Secret-scanning of deployed environment variables (none were touched this session)
- Backup/restore rehearsal (no primary data store has been chosen yet — `OWNER_DECISIONS.md` #1)
- Provider sandbox tests (no provider integrations exist)

## Findings summary

| Severity | Finding | Status |
|---|---|---|
| Fixed | `rbac.js` didn't check membership status, allowing a suspended member's role to pass through if a caller forwarded it | **Fixed in Session 1**, regression test in place |
| Open | CSV export (`csvExport.js`) doesn't guard against formula injection in spreadsheet software | **Open**, to address when F053's real export endpoint is built |
| Open | `blobsAuditSink.js`, `blobsSettingsStore.js` are untested against live Netlify Blobs | **Open**, needs a smoke test once any endpoint uses them |
| Open | Secret-detection heuristics (`settings.js`, `evidenceCategorization.js`) are pattern-match only, not semantic | **Open by design**, documented as defense-in-depth, not a guarantee |
| N/A | Everything else in the master instruction's Session 9 security checklist | **Not applicable** — no live deployment exists |

## Recommendation

Not ready for a production security review in the full sense the master instruction describes — that review needs real endpoints, a chosen data store, and at least one deployed environment to test against. What exists today (the domain/policy layer) has been reviewed to the extent it can be: authorization logic, audit shaping, file validation, webhook verification, template/export data-leak prevention, and data-minimization boundaries all have passing tests exercising their security-relevant behavior. The one bug this process caught (the `rbac.js` membership-status gap) was fixed, not just documented — a sign the test-first approach is doing its job. Re-run this review once F001 persistence and at least one real endpoint exist.

---

## Session 20 step 10 — full application review (RBAC/IDOR, MFA, SQL/XSS/input, audit trail)

Everything Session 9 flagged as "not applicable yet" now applies: 25 live
HTTP endpoints, a real Postgres database (Neon), TOTP MFA for
platform_admin, and a React frontend (`care-hub-app/`) all exist. This
pass reviewed the actual code across three areas in parallel (RBAC/
org-scoping/IDOR on every endpoint, the MFA/auth-flow implementation,
and SQL injection/XSS/input validation), then fixed what was cleanly
fixable and documented the rest. `npm audit --omit=dev` on both the
backend and `care-hub-app/`: **0 vulnerabilities** in either.

### RBAC, org-scoping, and IDOR — clean

Every one of the ~28 Care Hub endpoints under `netlify/functions/` calls
the shared auth bridge (`authenticateForOrg()`/`authenticatePlatformAction()`
in `_lib/care_hub_auth.js`) before touching a store. Specifically traced
`tickets.js` and `checklists.js` — the two endpoints the new staff-side
UI (step 7) lets platform_admin pass an arbitrary, manually-typed
`organizationId` into — and confirmed the server independently verifies
the authenticated caller's own membership in that org via a real
`SELECT ... FROM organization_memberships` lookup
(`src/db/membershipStore.js`) before returning anything; a forged or
cross-org id fails closed (403), regardless of what the UI sends.
`platform_admin`/staff-only actions (audit-log viewing, the ticket work
queue, checklist review) are independently re-checked server-side
(`actorRole === "platform_admin"`), not just hidden in frontend
branching. **No IDOR found.**

### SQL injection and XSS — clean

All 24 files in `src/db/` use either the Neon tagged-template
`sql\`...${value}...\`` form (auto-parameterized) or, for
`pgAuditSink.js`'s one genuinely dynamic query, a `conditions`/`params`
array with positional placeholders — never string concatenation. No
dynamic `ORDER BY`/column-name interpolation exists anywhere. On the
frontend, `grep -rn "dangerouslySetInnerHTML|innerHTML"
care-hub-app/src/` returns zero matches — all user-submitted content
(ticket subject/description, checklist comments/notes) renders through
plain JSX text interpolation, which React escapes by default. **No
issue found in either category.**

### Fixed this pass

1. **Missing audit trail on 12 stores backing state-changing endpoints**
   (`scopeOfWorkStore.js`, `changeOrderStore.js`, `paymentRequestStore.js`,
   `subscriptionStore.js`, `assetStore.js`, `reminderStore.js`,
   `serviceRecordStore.js`, `websiteProfileStore.js`, `itSupportStore.js`,
   `workLogStore.js`, `approvalStore.js`, `entitlementStore.js`,
   `templateStore.js`) — the same class of bug already found and fixed
   for `ticketStore.js`/`ticketWorkflowStore.js` in step 1, recurring
   because each of these stores was built in an earlier session before
   the `resolveAuditRecorder(deps)` pattern was established, and nothing
   enforced it retroactively. All ~20 mutating functions across these
   files now record an audit event on every create/transition/status-change,
   with `actorId` threaded from each endpoint's `auth.session.userId`,
   following the exact pattern in `ticketStore.js`/`invitationStore.js`.
   Dollar amounts, free-text note/description bodies, and other
   potentially sensitive values are deliberately excluded from audit
   `metadata` (primitives only, per SYS-SEC-012) — matching the file
   headers' existing discipline (e.g. `paymentRequestStore.js` never
   persists a raw amount, and the audit event doesn't either).
   **Impact if left unfixed:** a compromised or malicious technician/
   org_owner account could create or alter change orders, payment
   requests, subscriptions, service records, approve/reject approvals,
   or falsify backup-verification records with zero audit trail —
   directly undermining `audit-log.js` (platform_admin's only visibility
   tool) for roughly a third of all Care Hub endpoints. Two functions
   (`markBackupRestoreVerified`, `updateServiceRecordStatus`) didn't
   previously fetch the row before updating it (no `organizationId` was
   in scope to audit with) — both now fetch first, matching
   `applyPaymentStatusTransition`'s existing fetch-then-persist shape,
   and now throw on a not-found id instead of silently no-op'ing.
2. **TOTP replay** (`src/security/totp.js`, `mfa-verify.js`,
   `mfa-enroll.js`) — `verifyTotpCode()` had no anti-replay tracking: a
   valid 6-digit code could be submitted a second time within its own
   validity window (~90s, given the ±1 period clock-skew tolerance) and
   would validate again. **Exploit:** an attacker who intercepts a code
   in transit (shoulder-surfing, a malicious proxy, exfiltration of the
   POST body) could replay it to obtain their own session before the
   window closes. Fixed by adding `validateTotpToken()`, which returns
   the absolute 30-second period counter that matched (not just a
   boolean), and persisting `user.mfaLastUsedCounter` after every
   successful verification — `mfa-verify.js` now rejects any code whose
   counter isn't strictly greater than the last accepted one, and
   `mfa-enroll.js`'s confirm step seeds the initial counter. `40/40`
   tests passing across `totp.test.js`, `mfa-verify.test.js`,
   `mfa-enroll.test.js`, including new cases for reject-on-replay,
   reject-on-stale-counter, and accept-on-genuinely-new-counter.

### Documented, not fixed this pass (with reasons)

1. **Critical — MFA enrollment has no defense against a password-only
   compromise being used to hijack the *first* enrollment.**
   `mfa-enroll.js`'s only precondition for `start`/`confirm` is
   possession of the short-lived `lts_mfa_pending` cookie, which
   `auth-login.js` issues to anyone who supplies the correct password
   for a platform_admin account. There is no secondary check (email
   confirmation, existing-device approval, admin notification) gating
   who gets to be the first person to enroll a TOTP device on an
   account. **Exploit:** an attacker who obtains a platform_admin's
   password (phishing, credential stuffing, a leaked hash) but not their
   physical device can sign in, receive `enrollmentRequired: true`, and
   complete enrollment with their own authenticator app before the real
   owner ever sets one up — permanently locking the legitimate owner out
   (their own correct-password login now demands a code from the
   attacker's device). **Why not fixed this pass:** the standard
   mitigation (email the account holder when MFA is enrolled, or require
   a confirmation link before the first enrollment activates) needs a
   working email integration, which is step 8 of this directive and is
   blocked on Dylan supplying real Resend credentials. Attempting a
   different, ad hoc mitigation (e.g. requiring the invitation token
   used at account creation) would be a real design decision, not a
   drive-by fix, and risks getting it wrong for a security-critical flow.
   Flagged here prominently so it's picked up as a P0 alongside step 8,
   not lost in a backlog. In the interim: the practical exposure is
   limited to platform_admin accounts (a small, Dylan-provisioned
   population, not self-registered), and every login attempt is already
   rate-limited and audited (`auth-login.js`), so a brute-forced
   password is unlikely — the residual risk is specifically a *leaked or
   phished* password, not a guessed one.
2. **Medium — no server-side length cap on free-text fields.** Ticket
   `description` has no validation at all (not even a presence check,
   `src/domain/ticket.js`); checklist `comment`/`staffNote` and
   organization `name` are only type-checked, never length-checked.
   Every write also flows into an audit-log `metadata` entry, so this is
   a storage-abuse and audit-log-bloat vector, not a confidentiality/
   integrity issue. **Why not fixed this pass:** picking real limits is
   a product decision (what's a reasonable ticket description length?),
   not something to invent unilaterally; recommend Dylan set explicit
   caps the next time `src/domain/ticket.js`/`readinessChecklist.js`/
   `organization.js` are touched.
3. **Medium, currently dormant — CSV formula injection still unguarded.**
   Carried forward from the Session 9 review: `src/export/csvExport.js`
   still only escapes `"`, `,`, `\r`, `\n` — a value starting with `=`,
   `+`, `-`, or `@` would be interpreted as a formula by Excel/Sheets.
   Confirmed **no production endpoint currently calls it** (`metrics.js`,
   `activity-timeline.js`, etc. don't import `toCsv`), so this is latent,
   not exploitable today — but becomes a real risk (ticket descriptions,
   checklist notes, and org names are all unbounded, per finding 2) the
   moment any export endpoint is wired to it. Fix alongside whenever
   that endpoint is built, not speculatively now.
4. **Low — generic error-message catch blocks.** `tickets.js`,
   `checklists.js`, and similar endpoints wrap store calls in
   `catch (err) { return json(400/404, { error: err.message }) }`. Today
   every error these stores throw is a clean domain-validation message,
   not a raw driver exception, so no leak was observed — but the pattern
   doesn't structurally distinguish "safe to relay" domain errors from
   "should be logged and replaced with a generic message" infrastructure
   errors. A future change that lets a raw Postgres constraint-violation
   message reach one of these catches would leak column/constraint names
   to the client. Worth tightening opportunistically, not urgent.
5. **Low/Informational — rate-limit counter has a narrow TOCTOU race.**
   `auth_utils.js`'s `rateLimited()` does a read-modify-write on a blob
   store with no atomic increment or lock; concurrent parallel requests
   could race past the limit by a small margin. Bounded impact given the
   8-attempt window still limits brute force to a negligible fraction of
   the TOTP code space.
6. **Informational — no recovery path if an admin loses their device
   AND exhausts all 10 recovery codes.** Not a vulnerability (the
   account stays secure), but an availability gap: nothing in
   `mfa-manage.js` offers an out-of-band recovery short of a direct
   database intervention. Worth a support runbook entry, not a code fix.

### Verification

`npm test` (repo root): **777/777 passing** (up from 763 before this
step — new audit-trail assertions across 12 store test files plus 5 new
TOTP anti-replay test cases). `care-hub-app`'s `npm run build`: clean,
unaffected (this step touched no frontend code). `npm audit --omit=dev`:
0 vulnerabilities, both workspaces.

### Recommendation

**Still NOT READY for production**, but materially improved: the
systemic audit-trail gap (arguably the most consequential finding, since
it undermined the platform's own compliance/incident-response tooling
across a third of its endpoints) is closed, and TOTP replay is closed.
The one Critical finding (MFA enrollment hijack) is a real, unresolved
risk that should be treated as a blocking item alongside step 8 (email),
not deferred indefinitely — it's the single highest-severity gap in the
current build. Everything else documented above is Medium or lower and
can reasonably wait for the relevant feature work (export endpoint,
domain-validator touch-ups) to land normally.
