# Care Hub Active Code Review

**Status:** Working review while development is active  
**Reviewed baseline:** commit `4852545`, plus targeted observations of the uncommitted Square dashboard and MFA-enrollment work visible on 2026-07-15  
**Purpose:** Preserve fix-ready findings without assigning formal `F037+` IDs or changing `AUDIT_STATE.json` while the branch is moving.

This is an audit artifact, not an implementation. Temporary identifiers in
this file use `CH-*`. They must be reconciled into the appropriate numbered
audit sessions after the development baseline is stable.

## Executive result

The Care Hub is not release-ready. The root test suite passes (781/781), the
React application type-checks and builds, and the supplied Square Payment Link
resolves to Little Technical Solutions LLC's hosted checkout. Those successes
do not cover tenant isolation, concurrent writes, provider reconciliation, or
the browser application. Four actual handlers currently return a different
organization's record after authorizing only the caller-supplied organization;
one of those paths mutates the other organization's approval.

Release posture: **stop-ship until CH-P0-01 and CH-P0-02 are repaired and the
new negative/concurrency tests pass.** The static Square link may remain only
as an explicitly manual development payment path; it must not automatically
change a Care Hub payment state.

## Reproduction evidence

A read-only injected-store diagnostic called the real handler functions with
an active `org_owner` authorization context for `org-a`, while the fake SQL
adapter returned rows owned by `org-b`. Current results:

| Handler | Requested authorization scope | Stored row owner | Result |
|---|---:|---:|---:|
| `PATCH /approvals` | `org-a` | `org-b` | `200`, approval changed/returned |
| `GET /scope-of-work` | `org-a` | `org-b` | `200`, versions returned |
| `GET /change-orders` | `org-a` | `org-b` | `200`, change order returned |
| `GET /payment-requests` | `org-a` | `org-b` | `200`, payment request returned |

This is a code-path proof using dependency injection, not a production-data
probe. No live record was read or changed.

## Stop-ship findings

### CH-P0-01 — Approval decision permits a cross-tenant mutation

**Severity:** Critical  
**Status:** Open

`netlify/functions/approvals.js:51-68` selects the capability and authorizes
against `organizationId` and `subjectType` supplied by the caller. It then
passes only `approvalId` into the store. `src/db/approvalStore.js:94-108`
selects and updates solely by that ID. The stored approval's organization and
subject type are never required to match the authorized values.

The update is also a read/decide/unconditional-write sequence. Two concurrent
decisions can both observe `pending`; the last write can overwrite the first.

**Required repair:**

1. Resolve the approval before authorization, derive organization and subject
   type from the stored record, and authorize those derived values. Return a
   uniform not-found response for an inaccessible ID.
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

The pending MFA cookie is signed after password authentication, but the
server does not require an independent, out-of-band confirmation before first
enrollment becomes active (`netlify/functions/mfa-enroll.js:106-201`). A
password-only compromise can therefore register an attacker's authenticator.
The notification sent after activation is detective, not preventive.

Additional gaps remain:

- `netlify/functions/_lib/auth_utils.js:97-100` calls the pending credential a
  single-use token, but its `jti` is not stored or consumed server-side.
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

**In-flight rewrite advisory:** the uncommitted rewrite inspected after this
finding was recorded does add an email-confirmation link, but deliberately
falls back to immediate activation when email is unconfigured or delivery
fails. That is still fail-open for the exact password-only enrollment attack
and therefore does **not** resolve this stop-ship finding. A mandatory control
must fail closed; administrative recovery belongs in a separate, strongly
authenticated break-glass procedure. The new link consumption also remains a
Blobs read/check/write sequence: concurrent requests can both observe
`used: false`, and the token is marked used before activation succeeds. Make
consumption and state transition atomic/idempotent, and do not mark the
Critical resolved until failure and concurrency tests prove it.

## High findings

### CH-H-01 — Three customer reads are scoped by child ID, not tenant

**Severity:** High  
**Status:** Open

- `netlify/functions/scope-of-work.js:61-74` authorizes the named organization,
  but `src/db/scopeOfWorkStore.js:125-128` queries only `ticket_id`.
- `netlify/functions/change-orders.js:62-81` authorizes the named organization,
  but `src/db/changeOrderStore.js:81-84` queries only `id`.
- `netlify/functions/payment-requests.js:62-77` authorizes the named
  organization, but `src/db/paymentRequestStore.js:140-143` queries only
  `subject_type` and `subject_id`.

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
**Status:** Open

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
**Status:** In active uncommitted code; recheck after Claude's next commit

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

### CH-M-04 — Generic webhook verifier is provider-incompatible by design

**Severity:** Medium now; High if wired to a provider  
**Status:** Open

`src/webhooks/webhookVerification.js:1-50` claims to be a shared primitive for
future providers. Signature schemes are provider-specific. Square signs exact
notification URL plus raw request body and sends a Base64 signature;
Cloudinary notification verification uses its own payload/timestamp format.
Keep provider adapters separate and share only neutral replay/idempotency and
audit utilities.

## Required repair order

1. Freeze a reviewed commit after Claude finishes the current development
   cycle. Preserve his work; do not audit a moving diff as if it were final.
2. Repair CH-P0-01 and CH-H-01 as one tenant-ownership sweep. Add the negative
   tests first, then constrain handler/store/database boundaries.
3. Repair MFA enrollment, single-use challenges, recovery/TOTP consumption,
   and session revocation; run parallel-request security tests.
4. Introduce atomic conditional transitions and transactional audit writes.
   Cover approval, scope versioning, change orders, payments, invitations,
   checklists, tickets, subscriptions, and entitlements.
5. Reconcile frontend types with backend contracts and add contract tests.
6. Keep the fixed Square URL explicitly manual. Build full provider
   reconciliation only after the database can persist a canonical amount and
   correlation identifiers.
7. Implement Cloudinary behind a storage-provider interface with private
   delivery, scanning/quarantine, tenant ownership, retention, and deletion.
8. Finish customer/staff routes and execute unit, integration, e2e,
   accessibility, deploy-preview, provider-sandbox, backup/restore, and
   rollback gates.
9. Update `SECURITY_REVIEW.md`, `DEV_STATE.json`, traceability, legal/data-flow
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
- Root tests, Care Hub unit/contract tests, production build, e2e, automated
  accessibility, live/sandbox smoke tests, migration rehearsal, rollback, and
  restore exercise all have captured pass evidence.

## Current checks

- `npm test`: 781/781 pass at reviewed baseline.
- `care-hub-app npm run typecheck`: pass with the current uncommitted Square
  dashboard work.
- `care-hub-app npm run build`: pass; 61 modules transformed.
- No Care Hub frontend test files were found.
- No Square transaction, Netlify deployment, Cloudinary write, or production
  data mutation was performed by this audit.
