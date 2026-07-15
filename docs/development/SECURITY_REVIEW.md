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

1. **Critical, now partially mitigated (Session 20 step 8) — MFA
   enrollment still has no *preventive* defense against a password-only
   compromise being used to hijack the *first* enrollment.**
   `mfa-enroll.js`'s only precondition for `start`/`confirm` is
   possession of the short-lived `lts_mfa_pending` cookie, which
   `auth-login.js` issues to anyone who supplies the correct password
   for a platform_admin account. There is still no secondary check
   (email confirmation, existing-device approval, admin notification)
   *gating* who gets to be the first person to enroll a TOTP device on
   an account — enrollment still activates immediately on a correct
   code, before any notification is sent. **Exploit:** an attacker who
   obtains a platform_admin's password (phishing, credential stuffing, a
   leaked hash) but not their physical device can sign in, receive
   `enrollmentRequired: true`, and complete enrollment with their own
   authenticator app before the real owner ever sets one up —
   permanently locking the legitimate owner out (their own
   correct-password login now demands a code from the attacker's
   device). **What step 8 added:** a best-effort security notification
   email now fires the moment enrollment completes (and on every
   `mfa-manage.js` disable/reset), and every send's delivery outcome is
   independently audited (`mfa.enroll.notification`,
   `mfa.disable.notification`, `mfa.reset.notification` —
   `outcome: "failure"` with a `reason` if not delivered). This gives
   the legitimate owner a chance to notice and react quickly (e.g.
   contact Dylan to have the account locked/reset before the attacker
   does anything further), and makes the notification gap itself visible
   in `audit-log.js` rather than silent. **This is a detective control,
   not a preventive one — it does not stop the hijack from happening.**
   The real fix (require an out-of-band confirmation, e.g. clicking an
   emailed link, before enrollment activates — not just after) is a
   bigger change than this pass makes and should still be treated as the
   outstanding P0, now that the notification prerequisite (a working
   email path) exists. In the interim: the practical exposure is limited
   to platform_admin accounts (a small, Dylan-provisioned population,
   not self-registered), and every login attempt is already
   rate-limited and audited (`auth-login.js`), so a brute-forced
   password is unlikely — the residual risk is specifically a *leaked or
   phished* password, not a guessed one. Note also that the notification
   email itself does nothing until `RESEND_API_KEY`/`EMAIL_FROM` are set
   in Netlify — see `DEPLOYMENT_PLAN.md`.
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

---

## Session 20 step 8 addendum — MFA security notifications (email hardening)

Step 8 (Square Sandbox + email) is otherwise blocked on Dylan supplying
real credentials. The email-hardening half was scoped independently and
completed: `mfa-enroll.js`'s confirm step and `mfa-manage.js`'s
disable/reset actions now send a best-effort security-notification email
to the account owner, and — regardless of whether the send actually
succeeds — every attempt is independently audited
(`mfa.enroll.notification`, `mfa.disable.notification`,
`mfa.reset.notification`, `outcome: "success"`/`"failure"` with a
`reason` on failure). See the Critical finding write-up above (now
marked "partially mitigated") and `DECISION_LOG.md` for why this is a
**detective control, not a preventive one** — it does not stop the
underlying enrollment-hijack exploit, it makes the notification gap
itself visible and gives a legitimate owner a chance to react. The real
preventive fix (an out-of-band confirmation step required *before*
enrollment activates, not just a notification *after*) remains
outstanding and should stay the actual P0.

`_lib/email.js`'s `sendEmail()` itself was deliberately left as
best-effort/non-throwing for every caller (see `DECISION_LOG.md` for why
— every other caller, including account verification and invitations,
depends on that behavior to keep the whole platform functional before an
email provider is configured). "Fail-closed" was implemented at the
call-site level for security-critical sends specifically, via mandatory
audit-of-delivery-outcome, not by changing the shared helper's contract.

Verification: `npm test` — **781/781 passing** (up from 777; +4 new
cases across `mfa-enroll.test.js`/`mfa-manage.test.js` covering
successful-delivery and failed-delivery audit paths for both flows).
`npm audit --omit=dev`: unaffected (no new dependencies).

---

## Correction — Session 20 post-step-8: step 10's "RBAC/IDOR: clean" was WRONG

**This correction supersedes step 10's RBAC/org-scoping/IDOR conclusion
above.** A file (`docs/audit/CARE_HUB_ACTIVE_REVIEW.md`) authored by an
independent reviewer -- not this session's own work, discovered
unexpectedly in the working tree while finalizing this session -- found
a real, confirmed **Critical cross-tenant IDOR** that step 10's review
missed. Verified directly against the actual code (not taken on faith)
before acting:

### CH-P0-01 (their ID) — confirmed and fixed

`netlify/functions/approvals.js`'s `PATCH` handler authorized the
*caller* against a client-supplied `organizationId`, then called
`applyApprovalDecision(approvalId, ...)` -- which fetched and updated
`approval_requests` **by `id` alone**, with no `organization_id`
predicate anywhere in the query. An authenticated `org_owner` of Org A,
supplying their own `organizationId` (to pass authentication) alongside
an `approvalId` belonging to Org B, could read **and mutate** Org B's
approval. This is a real cross-tenant data breach + unauthorized write,
not a theoretical gap -- confirmed by reading `src/db/approvalStore.js`
directly. **Fixed**: `applyApprovalDecision` now requires
`decision.organizationId` and includes it in both the `SELECT` and
`UPDATE` WHERE clauses; a mismatched org now produces the same
not-found-shaped error as a genuinely missing id (no existence leak).
Also added a `subjectType` cross-check the same reviewer flagged (a
caller could otherwise claim the wrong `subjectType` to route through
the wrong RBAC capability).

### CH-H-01 (their ID) — confirmed and fixed, same pattern

Three more read paths had the identical structural bug -- authorize the
caller against `organizationId`, then query the actual resource by a
child foreign key alone:

- `scopeOfWorkStore.listScopeVersionsForTicket(ticketId, ...)` — queried
  by `ticket_id` alone.
- `changeOrderStore.getChangeOrderById(id, ...)` — queried by `id` alone.
- `paymentRequestStore.listPaymentRequestsForSubject(subjectType, subjectId, ...)`
  — queried by subject alone.

All three now require and apply `organizationId` in their query
predicate (verified by reading each store file directly, same as
CH-P0-01). A ticket/change-order/subject belonging to another
organization now returns empty/null, same as genuinely not existing.
**Root cause, systemic:** this codebase's convention is
"`authenticateForOrg()` proves the caller belongs to the *stated* org,"
which several endpoints incorrectly treated as sufficient — it does
NOT prove the *specific resource being fetched* belongs to that org
when the resource is looked up by a child ID the caller also controls.
Every endpoint written after this fix should double-check: does the
store query actually filter by `organization_id`, or only by a
child/foreign key that a caller can supply arbitrarily?

### Findings from the same review NOT acted on this pass (tracked, not dismissed)

- **CH-H-02 — non-atomic multi-write workflows.** Nearly every store in
  this codebase does select→decide→unconditional-UPDATE without a SQL
  transaction, including the ones just fixed above. A concurrent
  duplicate decision could theoretically race. This is a pre-existing,
  codebase-wide pattern (not introduced this session) and a real
  architectural gap — fixing it properly means introducing transactions
  across every relational workflow, a larger undertaking than this
  correction pass. Tracked for a dedicated session.
- **CH-P0-02 critique of the MFA preventive fix.** The reviewer
  correctly points out that this session's MFA-enrollment fix (deferred
  activation behind an emailed confirmation link) still falls back to
  immediate activation when email is unconfigured, which remains
  fail-open for the exact password-only-compromise attack in that case.
  This is accurate and was already disclosed, not missed — see
  `DECISION_LOG.md`'s entry on this design tradeoff (a hard requirement
  on email risks permanently locking out mandatory platform_admin MFA
  if email breaks). The reviewer's position is that a mandatory control
  must fail closed, with break-glass recovery handled as a separate,
  strongly-authenticated procedure — a reasonable alternative design,
  not built this pass. Also flagged: the pre-auth `lts_mfa_pending`
  cookie's `jti` (single-use claim) is never actually stored/consumed
  server-side (stateless, relies only on its 5-minute TTL), and the new
  email-confirmation token's Blobs read/check/write is not atomic
  (same non-transactional pattern as CH-H-02). Both real, both
  low-severity given short TTLs and narrow attack windows, neither
  fixed this pass.
- **CH-H-03/CH-H-04 — Square/Cloudinary integration design
  requirements.** Detailed, well-reasoned specs for what a *real*
  Square webhook integration and a *real* Cloudinary private-asset
  pipeline need (signature verification, idempotency, private delivery,
  scanning/quarantine, etc.). Both integrations remain unbuilt this
  session (Square: a static dev Payment Link only; Cloudinary: decision
  recorded, no code) — these requirements should inform whoever builds
  them, not something to retrofit onto code that doesn't exist yet.
- **CH-M-01 — frontend/backend contract drift.** `care-hub-app/src/api/types.ts`
  has hand-maintained interfaces that have drifted from real backend
  domain values in several places (e.g. approval `subjectType` naming,
  payment status enum values). Confirmed real, not fixed this pass —
  needs a proper contract-testing or schema-generation approach, not a
  point patch.
- **CH-M-02 — Dashboard.tsx's staff check.** Confirmed: `isStaff` only
  checks `role === "admin"`, so a `role: "staff"` account (if any exist)
  would see the customer payment card. No `staff` role currently exists
  in the live user base per this session's own work, but the check
  should use the same role list `rbac.js` treats as staff-equivalent.
  Not fixed this pass.
- **CH-M-03 — no browser/component/accessibility test suite for
  `care-hub-app`.** Confirmed, unchanged from this session's own
  repeated disclosure that step 10 (a11y/e2e testing) was never
  started.

### Why this correction matters more than any other finding in this document

Step 10's own review process (three parallel research agents) explicitly
checked for exactly this class of bug and reported "No IDOR found in
tickets.js or checklists.js" — true for those two files, but the
conclusion was over-generalized in this document's summary to "RBAC/IDOR:
clean" across the whole app, which was not warranted from a two-endpoint
sample. The actual bug was in `approvals.js`/`scope-of-work.js`/
`change-orders.js`/`payment-requests.js` — not reviewed as carefully in
that pass. Lesson for future review passes in this codebase: verify the
*specific store query*, not just that an org-scoped auth check runs
somewhere in the call path; and don't generalize a review's conclusion
beyond the files actually traced.

Verification: `npm test` — **791/791 passing** (up from 788; +3 new
regression tests: `applyApprovalDecision requires decision.organizationId`,
the cross-tenant-rejection test, and the subjectType-mismatch test, plus
updated assertions on the three list/get functions proving their SQL
text includes `organization_id`). `care-hub-app npm run build`:
unaffected (backend-only fix).
