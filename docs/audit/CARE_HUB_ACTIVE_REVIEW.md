# Care Hub Post-Claude Code Review

**Status:** Remediation in progress; code stop-ships repaired, operational release gates remain
**Reviewed baseline:** commit `b2772e9` on 2026-07-15; no tracked worktree changes were present when verification began
**Purpose:** Preserve fix-ready Care Hub findings until they are reconciled into the numbered security, backend, and quality audit sessions.

## Reconciliation update — 2026-07-16

The sections below (dated 2026-07-15) describe findings against baseline
`b2772e9`. **Commit `ddc2cad` ("fix: harden Care Hub launch blockers"),
authored by Dylan the same day, landed after that baseline and was never
reconciled into this document** -- the per-finding "Status:" fields below
are stale. Every claim in this update was verified today by directly
reading the current code (not by trusting `ddc2cad`'s own commit message
or this document's top summary), the same independent-verification
standard used for the original IDOR discovery.

**Confirmed resolved as of current `main` (`ea16f1d`):**

- **CH-P0-01** (approval atomicity) -- `src/db/approvalStore.js`'s
  `applyApprovalDecision` uses one `WITH changed AS (UPDATE ... WHERE
  status = 'pending' ... RETURNING *), audited AS (INSERT ... FROM changed
  RETURNING id) SELECT ...` statement. A forced-concurrent test (two
  simultaneous decisions against the same row) now allows exactly one
  winner.
- **CH-P0-02** (MFA fail-open) -- `netlify/functions/mfa-enroll.js` fails
  closed (503, enrollment not activated) when confirmation email cannot
  be delivered; no fallback to immediate activation exists.
  `mfaChallengeStore.js`'s `claimMfaEnrollmentChallenge` atomically
  consumes the confirmation token (`UPDATE ... WHERE consumed_at IS NULL
  ... RETURNING`).
  - **Still genuinely open:** there is still no separate, strongly-
    authenticated break-glass recovery path for a platform_admin who
    gets fail-closed out by a real email outage during first enrollment
    -- that's an intentional trade (fail closed, don't silently fall
    back), but it means a real Resend outage during enrollment currently
    has no recovery path at all. Worth a decision, not urgent given
    Resend is already live.
- **CH-H-05** (MFA link auto-fires on mount) --
  `care-hub-app/src/routes/MfaEnrollVerify.tsx` shows a "confirm" phase
  with a real button (`onClick={handleConfirm}`); the confirmation POST
  never fires from a mount-time effect.
- **CH-H-01** (parent ownership on creation) -- `scope-of-work.js` validates
  the ticket's `organizationId` before creating a scope; `change-orders.js`
  validates the referenced scope's `organizationId` before creating a
  change order; `payment-requests.js`'s `subjectBelongsToOrganization()`
  validates the scope/change-order/subscription subject before creating a
  payment request.
- **CH-M-02** (staff sees customer payment card) --
  `care-hub-app/src/auth/roles.ts` now has both `isStaffRole()` (admin OR
  technician -- used to hide the customer payment card from any staff
  account) and a narrower `isPlatformAdminRole()` (admin only -- used for
  platform_admin-only screens). `Dashboard.tsx` uses the former.
- **CH-H-06** (legal disclosures incomplete in 15 languages) -- resolved
  via the alternative this document itself proposed: `privacy.html`'s
  legal content is `lang="en" dir="ltr" data-legal-english-only`, and
  `js/i18n.js` skips translating/replacing text inside that container, so
  a non-English visitor sees a clearly-marked, internally-consistent
  English document rather than mixed-language text. Not a translation --
  a deliberate, correctly-executed English-only presentation.
- **CH-M-05** (frontend dev-dependency vulnerabilities) -- `care-hub-app`
  was upgraded to Vite 8 / Vitest 4 / `@vitejs/plugin-react` 6. Re-checked
  today: `npm audit` (with and without `--omit=dev`) reports **0
  vulnerabilities**.

**Fixed today (2026-07-16), building on the same pattern `ddc2cad`
established -- CH-H-02 was only partially closed by that commit
(approvals, tickets, subscriptions, and payment-request transitions got
the atomic-CTE treatment; scope versioning, change-order creation, and
invitation acceptance did not):**

- `src/db/scopeOfWorkStore.js`'s `createNextScopeVersion` -- the supersede-
  update, next-version insert, and audit event are now one statement;
  a concurrent re-versioning of the same scope loses cleanly instead of
  both succeeding.
- `src/db/changeOrderStore.js`'s `createChangeOrder` -- the change-order
  insert, its paired approval-request insert, and both audit events are
  now one statement (previously four separate writes; a change order
  could exist with no approval request if the process died mid-sequence).
- `src/db/invitationStore.js`'s `acceptInvitation` -- its `UPDATE` now
  repeats the status predicate it already read (`WHERE status = ...`),
  closing a race where two simultaneous accepts of the same token could
  both return success, creating two membership/consent records for one
  invitation.
- All three verified with new concurrency-specific regression tests;
  full suite 892/892 passing (root) after these changes.

**Still genuinely open (verified today, not just carried forward):**

- **CH-P0-03** -- `NETLIFY_BLOBS_TOKEN` still needs a real provider-side
  rotation (a new token issued, the old one revoked); re-entering the same
  value doesn't address the exposure. Requires Dylan directly in Netlify's
  dashboard.
- **CH-H-02, cross-provider portion** -- `invitation-accept.js`'s endpoint
  still spans Netlify Blobs (user record) and Postgres (membership,
  consent) with no shared transaction boundary. This needs an actual
  saga/outbox design, not a quick patch; today's fix only closed the
  single-table Postgres race inside `acceptInvitation` itself.
- **CH-H-03** -- Square is still a static, non-integrated payment link.
- **CH-H-04** -- Cloudinary is still not integrated; documents remain
  base64 in Blobs.
- **CH-M-01** -- frontend/backend type contracts (approval subject-type
  naming, payment status enums, scope line-item pricing shape) have not
  been reconciled; not re-verified today.
- **CH-M-03** -- no browser/e2e/accessibility test suite exists for
  `care-hub-app` (component/unit tests only).
- **CH-M-04** -- the generic webhook verifier remains provider-
  incompatible; moot until CH-H-03 is actually built.
- **Infrastructure, not code:** `DATABASE_URL` is confirmed absent from
  the live Netlify project's environment variables as of 2026-07-16 --
  every Postgres-backed function above is unreachable in production
  until it's set. The local dev Neon database itself was verified today
  (42 tables, all expected tables present, real accumulated smoke-test
  data) -- the database is ready; only the production environment
  variable is missing.

This is an audit artifact, not an implementation. Temporary identifiers in
this file use `CH-*`. They must be reconciled into the appropriate numbered
audit sessions after the development baseline is stable.

## Executive result

The Care Hub is not release-ready. Claude's final changes did close the four
previously demonstrated cross-tenant read/write paths, and the final baseline
passes all 791 backend tests plus the React production build. Those are real
improvements.

Three stop-ship conditions remain: approval decisions are still non-atomic,
the new MFA email gate fails open and its supposedly single-use state is
raceable, and two credentials documented as exposed in the development
transcript have not been rotated. Parent-resource ownership, multi-write
transactions, legal-page localization, frontend contracts, and browser
quality gates also remain incomplete.

Release posture: **stop-ship until CH-P0-01, CH-P0-02, and CH-P0-03 are
repaired and their negative/concurrency/rotation evidence passes.** The static
Square link is accepted for Dylan's current manual-link-only scope; it must
remain visibly manual and must not automatically change a Care Hub payment
state.

## Codex remediation update — 2026-07-15

The following audit findings are repaired in the current worktree and covered
by automated evidence:

- **CH-P0-01:** approval decisions now use one conditional `UPDATE` CTE with
  the success audit insert in the same SQL statement. Lost races return no
  changed row; simultaneous decisions permit one winner.
- **CH-P0-02:** first enrollment fails closed if confirmation email cannot be
  delivered. Raw email tokens are not stored; Postgres challenges expire,
  bind to a unique pending enrollment, invalidate older enrollments, and are
  atomically consumed. TOTP counters and recovery-code hashes use
  database-authoritative conditional claims. Parallel tests allow only one
  session for each credential. The React email landing page requires an
  explicit button click and has a component regression test proving mount is
  side-effect free.
- **CH-H-01:** scope, change-order, and payment-request creation validate the
  stored parent organization's ownership. Migration `005` adds matching
  composite ownership constraints for ticket/scope/change-order relations.
- **CH-H-05:** resolved by the explicit-confirmation landing page.
- **CH-H-06 / F006 / F007:** legal content is now deliberately one coherent
  English document, marked `lang="en" dir="ltr"`, with a clear English-only
  notice. The language engine skips that legal container so stale dictionaries
  cannot produce mixed or under-disclosing text. The factual data-flow map now
  reflects Blobs plus Postgres MFA storage accurately.
- **CH-M-01 / CH-M-02 / CH-M-05:** frontend domain values and invitation
  responses match backend contracts; technician and admin roles are both
  treated as staff; Vite was upgraded and the full frontend dependency audit
  is clean.
- **CH-M-03 (partial):** the frontend now has component/auth/role tests and
  preserves network/server failures as an error instead of falsely signing
  the user out. A full browser/e2e/accessibility deployment gate is still
  required before launch.

Additional conditional state transitions for tickets, payment requests, and
subscriptions now bind the expected old status (and ticket version) and write
their success audit in the same SQL statement. CH-H-02 remains open for the
remaining multi-write creation/versioning/invitation/checklist/entitlement
workflows and all cross-provider saga/outbox design.

Operationally, a new `LTS_SESSION_SECRET` has been set as a write-only Netlify
secret for production/deploy-preview/branch-deploy and rotated locally. It
will take effect on the next deployment; no deployment was performed because
the standing project decision keeps this branch local until Dylan explicitly
ships it. The exposed account-level `NETLIFY_BLOBS_TOKEN` still requires a
provider-side create-new/revoke-old rotation after confirming the token is not
shared by other projects. No secret value was read or recorded.

## Historical reproduction evidence (closed at `3fb896b`)

A read-only injected-store diagnostic called the real handler functions with
an active `org_owner` authorization context for `org-a`, while the fake SQL
adapter returned rows owned by `org-b`. Pre-fix results were:

| Handler | Requested authorization scope | Stored row owner | Result |
|---|---:|---:|---:|
| `PATCH /approvals` | `org-a` | `org-b` | `200`, approval changed/returned |
| `GET /scope-of-work` | `org-a` | `org-b` | `200`, versions returned |
| `GET /change-orders` | `org-a` | `org-b` | `200`, change order returned |
| `GET /payment-requests` | `org-a` | `org-b` | `200`, payment request returned |

This is a code-path proof using dependency injection, not a production-data
probe. No live record was read or changed.

## Stop-ship findings

### CH-P0-01 — Approval isolation is fixed, but decision finality is not atomic

**Severity:** Critical

**Status:** Partially resolved at `3fb896b`; stop-ship concurrency portion open

`src/db/approvalStore.js:120-138` now requires `organization_id` in both the
read and write predicates and rejects a caller-supplied `subjectType` that
does not match the stored row. That closes the demonstrated cross-tenant IDOR
and capability-confusion path.

The update is still a read/decide/unconditional-write sequence. The `UPDATE`
does not require the old status to remain `pending`, has no `RETURNING` row
count check, and writes the audit event separately. A post-Claude injected-SQL
diagnostic forced simultaneous approve/reject calls to read the same pending
row: **both returned success, both issued an update, and neither update had a
pending-status guard.** The last database write wins even though two success
responses and two success audit events can exist.

**Required repair:**

1. Keep the new tenant/subject predicates and add a handler-level regression
   test that exercises them through the real endpoint boundary.
2. Make the decision a conditional atomic operation (`WHERE id = ? AND
   organization_id = ? AND status = 'pending' ... RETURNING *`) or an
   equivalent transactional statement. The request body must not select its
   own permission.
3. Insert the success audit event in the same database transaction/statement.
4. Add negative tests for an Org A owner supplying an Org B approval ID, a
   caller/body subject-type mismatch, expired decisions, and simultaneous
   approve/reject attempts. Exactly one concurrent decision may succeed.

### CH-P0-02 — MFA enrollment and challenge state are not preventive or atomic

**Severity:** Critical  
**Status:** Open (partly acknowledged in `docs/development/SECURITY_REVIEW.md`)

The final code now emails an out-of-band link, but deliberately bypasses that
control whenever email is unconfigured or delivery fails
(`netlify/functions/mfa-enroll.js:308-359`). A password-only compromise can
therefore still register an attacker's authenticator during any provider or
configuration failure. The existing unit test at
`netlify/functions/mfa-enroll.test.js:142-173` proves the fail-open behavior
and expects a real session plus recovery codes.

Additional gaps remain:

- `netlify/functions/_lib/auth_utils.js:97-100` calls the pending credential a
  single-use token, but its `jti` is not stored or consumed server-side.
- `netlify/functions/mfa-enroll.js:165-185` performs confirmation-token
  read/check/write, user activation, and session issuance separately. A
  post-Claude parallel diagnostic made two requests consume the same token;
  **both returned 200 and two sessions were issued**.
- `netlify/functions/mfa-verify.js:70-148` reads the old recovery/TOTP state,
  changes a Blobs record, audits, and issues a session as separate operations.
  Concurrent requests can both validate the same previously unused state.
- Enroll/disable/reset, security audit, notification outcome, and session
  revocation span independent writes. Partial failure can leave security state
  inconsistent.

**Required repair:** use server-recorded, expiring, one-use MFA challenges;
require an out-of-band confirmation before activating first enrollment; store
security-critical counters/recovery-code consumption in a persistence layer
with atomic conditional updates; revoke/rotate sessions and challenges on
state changes; and test real concurrent consumption, not only sequential
replay.

**Final rewrite result:** the committed rewrite does add an email-confirmation
link, but deliberately falls back to immediate activation when email is
unconfigured or delivery fails. That is still fail-open for the exact
password-only enrollment attack
and therefore does **not** resolve this stop-ship finding. A mandatory control
must fail closed; administrative recovery belongs in a separate, strongly
authenticated break-glass procedure. The new link consumption also remains a
Blobs read/check/write sequence: concurrent requests can both observe
`used: false`, and the token is marked used before activation succeeds. Make
consumption and state transition atomic/idempotent, and do not mark the
Critical resolved until failure and concurrency tests prove it.

### CH-P0-03 — Documented credential exposure has not been remediated

**Severity:** Critical

**Status:** Open; operational rotation required before release

`docs/development/DEV_STATE.json` → `releaseRecommendation` records that the
live `LTS_SESSION_SECRET` and `NETLIFY_BLOBS_TOKEN` were printed in plaintext
to the development transcript and explicitly says they were not rotated. The
final MFA encryption key was not exposed.

Treat both exposed values as compromised regardless of who is expected to see
the transcript. Rotate the Netlify Blobs credential, rotate the session
signing secret (accepting that current sessions will be invalidated), revoke
the old credentials, and review provider/access logs for unexpected use.
Capture only the rotation result and time in audit evidence—never the new
values.

## High findings

### CH-H-01 — Customer reads are fixed; parent ownership on creation is not

**Severity:** High

**Status:** Partially resolved at `3fb896b`

The three customer reads now include `organization_id` in their SQL
predicates (`scopeOfWorkStore.js:136-139`, `changeOrderStore.js:90-93`, and
`paymentRequestStore.js:149-152`). The original cross-tenant disclosures are
closed.

Creation paths still accept an organization and a parent/subject ID as
independent inputs without proving they belong together:

- scope creation passes the body `organizationId` and `ticketId` directly to
  the insert (`scope-of-work.js:41-55`, `scopeOfWorkStore.js:28-45`);
- change-order creation loads `originalScopeId` but never requires the
  scope's stored organization to equal the body organization
  (`change-orders.js:35-55`);
- payment-request creation does not resolve or validate the supplied subject
  before inserting (`payment-requests.js:43-56`).

The schema uses independent foreign keys and has no composite ownership
constraint (`migrations/001_initial_schema.sql:262-300`). A staff/admin error
or compromised staff session can therefore create cross-tenant references
that later appear inside the wrong customer's correctly scoped reads.

**Required repair:** make organization scope mandatory in each store API and
SQL predicate, validate parent ownership on creation, and add database
constraints where the model carries both a parent ID and `organization_id`.
Add cross-organization child-ID negative tests at both handler and real-
database levels. Review every remaining child lookup against the same rule;
passing an organization ID through RBAC is not sufficient unless the resource
query is constrained by it.

### CH-H-02 — Multi-write workflows and their audit records are not atomic

**Severity:** High

**Status:** Open

`src/db/pgClient.js:17-31` exposes individual Neon HTTP queries. The installed
driver supports non-interactive transactions, but the stores do not use them.
Representative partial-state paths include:

- scope supersede, next-version insert, audit:
  `src/db/scopeOfWorkStore.js:90-115`;
- change-order insert, approval insert, two audits:
  `src/db/changeOrderStore.js:47-71`;
- deposit/balance payment rows and audits:
  `src/db/paymentRequestStore.js:42-78`;
- invitation accept, Blobs user creation, membership, and two consent records:
  `netlify/functions/invitation-accept.js:98-130`.

State transitions are commonly select/decide/unconditional update, including
approvals, payments, tickets, checklist review, subscriptions, invitation
redemption, and entitlement consumption. Audit presence is not audit
integrity: a business write may commit even if its success audit fails.

**Required repair:** replace transition writes with conditional
`UPDATE ... RETURNING`, use a single SQL statement/transaction for each
relational workflow and its audit events, define idempotency keys, and add
failure-injection plus parallel-request tests. Cross-provider/Blobs workflows
need an explicit saga/outbox and repairable states rather than pretending to
be atomic.

### CH-H-03 — Static Square link is not a payment integration

**Severity:** High if represented as reconciled Care Hub billing; acceptable
only as a clearly manual development path  
**Status:** Accepted for the current manual-link-only scope; full integration deferred

The active dashboard work adds the supplied fixed URL. Its own comment
correctly states that it carries no Care Hub payment request, organization,
computed amount, or webhook correlation. The underlying model compounds that
limitation:

- `netlify/functions/payment-requests.js:43-55` accepts `totalAmount` from an
  admin request;
- `src/db/paymentRequestStore.js:42-78` returns each calculated amount only in
  memory and does not persist amount/currency/due condition;
- `netlify/functions/payment-requests.js:80-100` permits a manual admin status
  transition and arbitrary provider reference;
- `src/webhooks/webhookVerification.js:20-50` implements a generic
  timestamp-dot-payload hex HMAC. It is not Square's webhook signature
  algorithm and must not be reused as though it were provider-compatible.

**Development-safe rule:** the fixed link may open Square Checkout, but the
Care Hub must keep the request in a manual/unverified state until staff verify
the Square record. Do not label a request paid merely because the link opened
or the user returned.

**Full integration requirements:** persist expected amount in integer minor
units, currency, merchant/location, Square payment-link/order/payment IDs,
idempotency key, provider event ID, timestamps, reconciliation outcome, and a
distinct manual-override reason. Generate a checkout for the stored amount
where possible; validate Square's signature using the exact notification URL
and raw body; deduplicate event IDs; tolerate duplicate and out-of-order
delivery; query/validate canonical Square state; require amount/currency/order
and merchant matches; and update payment plus audit atomically.

The existing public `payment.html` terms checkbox remains bypassable through
the direct Square URL (formal audit finding F011). The Care Hub should record
accepted legal-document versions server-side before presenting an integrated
checkout; a browser-only checkbox cannot serve as the control.

### CH-H-04 — Cloudinary needs a private asset boundary, not a URL swap

**Severity:** High for customer documents  
**Status:** Design required before implementation

The legacy `netlify/functions/documents.js:101-117` stores complete data URIs
in Netlify Blobs and trusts a declared prefix rather than decoded magic bytes.
`netlify/functions/admin-images.js:51-59` similarly checks only a data-URI
prefix. The Care Hub relational model already has an opaque `storage_ref`, but
no complete Cloudinary-backed file lifecycle.

**Required Cloudinary design:** API secret only on the server; short-lived
server-signed upload parameters; server-generated opaque public IDs;
`overwrite=false`; authenticated delivery (including derivatives) for private
customer material; authorization before issuing a time-limited signed URL;
strict type, magic-byte, size, pixel/page, and archive limits; active formats
such as SVG/HTML disabled by default; malware scanning/quarantine before
availability; stored `asset_id`, public ID, resource/delivery type, version,
bytes, digest, owner org, uploader, scan status, and retention state; signed
notification verification; idempotent destroy plus CDN invalidation; and
audited upload/view/delete operations.

Cloudinary's default `upload` delivery type is public. It must not be used for
contracts, invoices, reports, or other customer-private files. Confirm the
selected Cloudinary plan and data-processing terms support the required
private document behavior before treating this provider decision as complete.

### CH-H-05 — Visiting the MFA email link performs the security action immediately

**Severity:** High
**Status:** Open

`care-hub-app/src/routes/MfaEnrollVerify.tsx:29-52` calls the activation API
from a mount-time `useEffect`. There is no review screen or explicit “Confirm”
button. Email-security scanners and link-preview systems that execute page
JavaScript can therefore consume the token and activate MFA without a human
choosing the action. This is especially risky because the token is marked
used before activation/session creation finishes.

The landing page should validate and describe the pending action without
changing state. A deliberate button should perform the POST, and the server
should atomically consume a challenge bound to the exact pending enrollment.

### CH-H-06 — Legal disclosure fixes are incomplete in 15 languages

**Severity:** High

**Status:** Open; formal findings F006/F007 reopened

The English `privacy.html` now names Care Hub data categories, Neon, Resend,
and Square. The 15 non-English dictionaries do not contain the new Care Hub
keys, while existing keys such as `privacy.section1_intro` and
`privacy.section3_body` still contain the old, under-disclosing text. For
example, `i18n/es.json` still says only directly supplied data is collected
and names only Netlify and Square; the new Care Hub paragraphs remain English
on the otherwise-Spanish page because their keys are missing.

That makes the policy internally mixed-language and materially incomplete for
any visitor with a saved non-English selection. Either supply professionally
reviewed translations for the legal additions or deliberately present the
entire legal document in English with a clear notice until translations are
ready. Attorney review remains required.

The supporting inventory also says MFA secrets and recovery codes are stored
in Postgres (`docs/development/legal/DATA_FLOW_AND_SUBPROCESSORS.md:24-25`),
but production code stores them in the Netlify Blobs `users` record
(`mfa-enroll.js:108-120`, `blob_store.js:7-11`). Correct the factual data map
before relying on it for policy text or a data-processing review.

## Medium/correctness findings

### CH-M-01 — Frontend contracts have drifted from backend domain values

**Severity:** Medium

**Status:** Open

- `care-hub-app/src/api/types.ts:38-43` says a scope approval uses
  `scope_of_work`, while `src/domain/approval.js:25-28` and
  `netlify/functions/approvals.js:22-25` require `scope`.
- `care-hub-app/src/api/types.ts:112-121` models payment states as
  `pending/paid/failed/refunded`, while `src/domain/paymentRequest.js:11-27`
  uses `requested/paid/reconciliation_pending/reconciled/failed`.
- the scope frontend line item uses `unitPriceCents`, while the backend domain
  requires an opaque `priceRef`.
- invitation create/resend client contracts claim the raw token is returned,
  while the server deliberately emails it and does not return it.

The TypeScript build passes because these hand-maintained interfaces are not
generated or contract-tested against handler responses.

**Required repair:** define one schema source (OpenAPI/JSON Schema/Zod or
equivalent), generate or validate both sides, and add handler-to-client
contract tests for every endpoint.

### CH-M-02 — Current Square dashboard role check exposes the button to staff

**Severity:** Medium  
**Status:** Confirmed in final baseline

`care-hub-app/src/routes/Dashboard.tsx:25-60` considers only the legacy
`admin` role to be staff. `AuthenticatedUser.role` also includes `staff`
(`care-hub-app/src/api/types.ts:373-378`), so technicians see the customer
payment card. The payment card also lacks a specific invoice/request amount or
reference, which makes accidental misapplication more likely.

### CH-M-03 — Browser quality gates are missing

**Severity:** Medium  
**Status:** Open

The root tests cover backend/domain code, but `care-hub-app/src` has no
component, browser, accessibility, or contract tests. Its package scripts have
no lint, unit-test, or end-to-end command. Only dashboard, tickets, checklists,
and a placeholder account route are wired. A release gate needs keyboard and
screen-reader checks, axe/a11y automation, auth/MFA browser tests, all-role
navigation, cross-org negative tests, session expiry/network-failure behavior,
and a deploy-preview smoke test against real backend dependencies.

`care-hub-app/src/auth/AuthContext.tsx:39-48` currently converts every account
fetch failure—including a network or server failure—into `signedOut`, losing
the distinction between unauthenticated and temporarily unavailable.

The product surface is also narrower than the backend inventory: roughly 18
resource endpoints have no Care Hub screen, and `/account` is still a
`ComingSoon` placeholder. This can be an acceptable limited MVP only if Dylan
explicitly defines launch scope as dashboard + tickets + checklists + manual
Square link; it is not completion of the broader Care Hub requirements.

### CH-M-04 — Generic webhook verifier is provider-incompatible by design

**Severity:** Medium now; High if wired to a provider  
**Status:** Open

`src/webhooks/webhookVerification.js:1-50` claims to be a shared primitive for
future providers. Signature schemes are provider-specific. Square signs exact
notification URL plus raw request body and sends a Base64 signature;
Cloudinary notification verification uses its own payload/timestamp format.
Keep provider adapters separate and share only neutral replay/idempotency and
audit utilities.

### CH-M-05 — Frontend development dependencies have known vulnerabilities

**Severity:** Medium

**Status:** Open; production bundle dependencies are clean

`care-hub-app npm audit` reports one High and one Moderate development-tool
finding through Vite/esbuild, including a Vite development-server path
traversal advisory. `npm audit --omit=dev` is clean, so these packages are not
shipped in the browser bundle, but the unqualified “0 vulnerabilities in both
workspaces” statements in development status are inaccurate.

Upgrade Vite and its toolchain through a tested migration rather than running
the suggested forced major update blindly. Until then, keep the development
server bound to localhost and do not expose it to an untrusted network.

## Required repair order

1. Rotate and revoke the two exposed credentials in CH-P0-03, invalidate old
   sessions, and capture non-secret completion evidence.
2. Make MFA fail closed; atomically bind and consume the exact enrollment
   challenge; require a deliberate confirmation click; make TOTP/recovery-code
   consumption atomic; and add real parallel-request tests.
3. Make approval decisions a conditional atomic update with the audit write in
   the same transaction. The simultaneous approve/reject test must allow
   exactly one success.
4. Finish the tenant-ownership sweep by validating parent ownership on every
   create/update path and adding database constraints where possible.
5. Introduce atomic conditional transitions and transactional audit writes.
   Cover approval, scope versioning, change orders, payments, invitations,
   checklists, tickets, subscriptions, and entitlements.
6. Reopen F006/F007 until the legal text is coherent in all selectable
   languages, correct the data-flow inventory, and obtain attorney review.
7. Reconcile frontend types with backend contracts and add contract tests.
8. Keep the fixed Square URL explicitly manual. Build full provider
   reconciliation only after the database can persist a canonical amount and
   correlation identifiers.
9. Implement Cloudinary behind a storage-provider interface with private
   delivery, scanning/quarantine, tenant ownership, retention, and deletion.
10. Finish customer/staff routes and execute unit, integration, e2e,
   accessibility, deploy-preview, provider-sandbox, backup/restore, and
   rollback gates.
11. Update `SECURITY_REVIEW.md`, `DEV_STATE.json`, traceability, legal/data-flow
   documents, and the formal audit state only after evidence matches reality.

## Verification gates

- Every org-owned query and mutation includes an ownership predicate derived
  from stored data; cross-org handler tests return a uniform denial/not-found.
- At most one concurrent approval, invitation redemption, payment transition,
  checklist transition, entitlement consumption, and MFA-code consumption
  succeeds.
- A forced audit-write failure cannot leave an unaudited successful relational
  mutation.
- Square duplicate/out-of-order/tampered events cannot alter payment state;
  amount, currency, order, merchant/location, and event id are verified.
- Cloudinary assets are not anonymously retrievable; signatures expire; a
  user cannot sign, view, overwrite, or delete another organization's asset.
- A legal page never presents stale or partially English privacy/terms text
  while declaring another language, and its factual data locations match code.
- Old session/Blobs credentials are revoked and cannot authenticate.
- Root tests, Care Hub unit/contract tests, production build, e2e, automated
  accessibility, live/sandbox smoke tests, migration rehearsal, rollback, and
  restore exercise all have captured pass evidence.

## Current checks

- `npm test`: 791/791 pass at `b2772e9`.
- `care-hub-app npm run build`: pass; TypeScript clean, 62 modules transformed.
- Root `npm audit --omit=dev`: 0 vulnerabilities.
- Care Hub `npm audit --omit=dev`: 0 production vulnerabilities; full
  `npm audit`: 1 High + 1 Moderate development-tool vulnerability.
- Forced parallel approval diagnostic: both approve and reject returned
  success; two unguarded updates were issued.
- Forced parallel MFA email-token diagnostic: both requests returned 200 and
  two sessions were issued from the same token.
- No Care Hub frontend/component/e2e/accessibility test files were found.
- No Square transaction, Netlify deployment, Cloudinary write, or production
  data mutation was performed by this audit.
