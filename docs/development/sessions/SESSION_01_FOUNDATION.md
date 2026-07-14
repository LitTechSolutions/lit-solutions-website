# Session 01 — Platform Foundation (Wave 1)

**Date:** 2026-07-14
**Scope:** F001, F002, F003, F004, F005, F006, F007, F008, F056, F058, F059 per `REQUIREMENTS_CATALOG.json`'s Wave 1. Actual scope narrowed by open owner decisions — see below.

## What happened

Session 0 left 5 of these 11 functions explicitly blocked in `DEV_STATE.json` (F001, F002, F005, F007, F058), pending owner decisions that hadn't been answered yet when this session started. Per the master instruction's §8 process ("record the issue... mark the affected function blocked... continue with independent work where possible"), this session split Wave 1 into three groups rather than stopping entirely or barreling through with unfounded assumptions:

1. **Built for real, storage-agnostic and unblocked:** F005 (RBAC — the decision *logic* doesn't depend on which database is eventually chosen, only its persistence layer does), F008 (audit event shaping/recording — same reasoning), F056 (settings/feature flags — same reasoning). All three got a Blobs-backed adapter too (reusing the existing `_lib/blob_store.js` wrapper), written but not integration-tested (no live Netlify Blobs credentials in this environment).
2. **Domain types only, persistence deliberately not built:** F001 (organization/membership shape), F002 (invitation shape) — these are still blocked on the primary-data-store and registration-model owner decisions respectively, but the *shape* of the data doesn't depend on either answer, so drafting it now avoids redoing that work later.
3. **Not touched:** F007, F058 remain fully blocked (open Critical privacy audit findings, retention policy). F003, F004 were assessed and found to already be adequately covered by existing code (`auth-login.js`, `auth-password-reset.js` — see `AUTHORIZATION_MODEL.md`), so no new code was written for them. F006, F059 were judged premature (F006 depends on F001/F003 context; F059's backup mechanics depend materially on the primary-data-store decision) and deferred rather than built speculatively.

While writing the fixture-based integration test for the RBAC engine, a real gap surfaced: `authorize()` had no concept of membership status, so a suspended member's role would still pass if a caller forwarded it — a direct violation of SYS-AUTH-005. This was fixed in `rbac.js` (added a fail-closed `actorMembershipStatus` check) rather than left as a documented caller responsibility. See `DECISION_LOG.md` for the full reasoning.

This is also the first session with actual code, so `REQUIREMENTS_TRACEABILITY.md` was created.

## Code written

- `src/domain/organization.js`, `invitation.js`, `auditEvent.js`, `settings.js` — JSDoc-typed validators, no persistence.
- `src/policy/rbac.js` — F005 decision engine: default deny, 6-role capability map transcribed from the Roles & Permissions sheet, organization-scope enforcement, membership-status enforcement, technician-assignment enforcement, automated-service explicit-grant enforcement.
- `src/audit/auditLog.js`, `blobsAuditSink.js` — F008 event shaping/validation, an in-memory sink for tests, and a Netlify-Blobs-backed sink for real use.
- `src/settings/settingsStore.js`, `blobsSettingsStore.js` — F056 document logic (settings + feature flags, fail-closed unknown flags) and its Blobs adapter.
- `test/fixtures/organizations.js` — synthetic two-organization tenant-isolation fixture set (Org A, Org B, owner, member, suspended member, cross-org owner).
- `package.json` — added `scripts.test` (`node --test`); no new dependencies.

Written as plain CommonJS + JSDoc, not TypeScript — see `DECISION_LOG.md` for why the build-step recommendation from `ARCHITECTURE.md` was deliberately deferred rather than adopted this session.

## Tests run

44 unit tests, all passing, first automated tests this repository has ever had. `evidence/tests/session-01-test-run.txt`. All storage-agnostic/unit-level — no integration, authorization-with-real-storage, API, component, E2E, accessibility, performance, or security tests yet (expected: no endpoint or UI code exists yet).

## Requirements traceability

See `REQUIREMENTS_TRACEABILITY.md`. Nothing reaches "Verified" status this session (that requires endpoint/UI wiring and the fuller test pyramid) — F005/F008/F056 are "domain logic complete and tested," F001/F002 are "types only," the rest are blocked or not-started-by-design.

## Files changed

New: `src/domain/*.js` (4), `src/policy/rbac.js`, `src/policy/rbac.test.js`, `src/audit/auditLog.js`, `src/audit/auditLog.test.js`, `src/audit/blobsAuditSink.js`, `src/settings/settingsStore.js`, `src/settings/settingsStore.test.js`, `src/settings/blobsSettingsStore.js`, `test/fixtures/organizations.js`, `test/fixtures/organizations.test.js`, `docs/development/REQUIREMENTS_TRACEABILITY.md`, `docs/development/evidence/tests/session-01-test-run.txt`, `docs/development/sessions/SESSION_01_FOUNDATION.md`. Modified: `package.json` (added `scripts.test`), `DEV_STATE.json`, `DEV_INDEX.md`, `DECISION_LOG.md`. No Netlify Function endpoints, no HTML/CSS, no `v23`.

## Owner decisions still required

Unchanged from Session 0 — see `OWNER_DECISIONS.md`. The primary-data-store decision (#1) is the single highest-leverage one: resolving it unblocks F001/F002 persistence and lets F005/F008/F056's Blobs adapters either be confirmed or replaced before more code is built on top of them.

## Next recommended session

Continue Wave 1 once the primary-data-store decision (and ideally the registration-model decision) are made — that unblocks F001/F002 persistence and real Netlify Function endpoints for F005/F008/F056. Until then, the next safe increment is Session 2's storage-agnostic groundwork (shared client boilerplate extraction, route shell) if Dylan wants to keep moving before those decisions land, per `ARCHITECTURE.md` §4's "low-risk development" list.
