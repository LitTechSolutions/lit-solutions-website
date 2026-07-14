# Session 02 — Customer Workspace (F009–F018)

**Date:** 2026-07-14
**Scope:** F009–F018 per the master instruction's §13 Session 2 assignment. Working autonomously per Dylan's standing instruction (2026-07-14) — no check-ins between sessions; owner-decision blockers are documented, not asked about.

## What happened

Same triage approach as Session 1: assessed each of the 10 functions against what's genuinely buildable without the still-open primary-data-store decision (`OWNER_DECISIONS.md` #1), which by this session blocks persistence for more functions than it did in Session 1 (every customer-owned entity ultimately needs `organizationId`-scoped storage).

Built for real: **F015** (file upload validation — size/MIME/magic-byte policy, config-overridable via F056 settings), **F016** (approval inbox state machine, generalized from the already-designed `quote-acceptance`/`project-status` specs rather than invented), **F012** (notification delivery-decision logic — which channels fire at which urgency, fail-safe toward over-notifying on unrecognized urgency rather than silently dropping something important), **F017** (activity timeline merge/permission-filter/sort over already-fetched event arrays, bounded pagination per SYS-API-005), **F009** (dashboard view-model assembler that shapes already-authorized data slices into a display-ready summary, explicitly excluding plan-usage data with a stated reason rather than faking a zero).

Domain types only (persistence blocked): **F010** (service/project record), **F013** (message-thread org-scoping extension — existing `messages.js` mechanics stay as-is), **F014** (document org-scoping + kind extension — existing `documents.js` reused with a correction: `storageRef` is modeled as opaque rather than a data URI, since base64-in-Blobs doesn't meet the target file-storage requirement).

Deferred by priority, not blocked: **F011** (Global Search — Phase 2) and **F018** (Knowledge Base — Phase 2) were skipped entirely this session since they're not MVP and nothing else depends on them yet.

## Code written

- `src/domain/serviceRecord.js`, `document.js`, `fileAsset.js`, `approval.js`, `activityEvent.js`, `notificationPreference.js`, `messageThread.js` — JSDoc-typed validators.
- `src/policy/fileValidation.js` — F015: size/MIME-allowlist/magic-byte validation, 8 tests including a spoofed-MIME-type case.
- `src/policy/approvalWorkflow.js` — F016: `pending → approved/rejected/expired` state machine, including the race case (approval expires the instant it's approved — resolves to expired), 8 tests. Deliberately doesn't decide *who* may approve (that's `rbac.js`'s job).
- `src/notifications/deliveryPolicy.js` — F012: urgency-based channel decision, 6 tests, fails safe toward over- not under-notifying.
- `src/timeline/activityTimeline.js` — F017: multi-source merge, org-scope + customer-visibility filtering, bounded pagination, 6 tests.
- `src/dashboard/dashboardViewModel.js` — F009: view-model assembly with a defensive cross-org-contamination check (throws if a caller hands it mis-scoped data), 5 tests.

77 total unit tests now, up from 44 after Session 1, all passing, zero new dependencies.

## Tests run

`npm test` → 77/77 passing. `evidence/tests/session-02-test-run.txt`.

## Requirements traceability

See `REQUIREMENTS_TRACEABILITY.md` (updated). Nothing reaches "Verified" — same reasoning as Session 1: no endpoint or UI wiring exists yet, so nothing has been exercised end-to-end.

## Files changed

New: 7 domain type files, `src/policy/fileValidation.js` (+test), `src/policy/approvalWorkflow.js` (+test), `src/notifications/deliveryPolicy.js` (+test), `src/timeline/activityTimeline.js` (+test), `src/dashboard/dashboardViewModel.js` (+test), `evidence/tests/session-02-test-run.txt`, this file. Modified: `REQUIREMENTS_TRACEABILITY.md`, `DEV_STATE.json`, `DEV_INDEX.md`. No Netlify Function endpoints, no HTML/CSS, no `v23`.

## Owner decisions still required

Unchanged — see `OWNER_DECISIONS.md`. The primary-data-store decision is now blocking persistence for F001, F002, F010, F013, F014 and the storage target for F015 — its priority only grows each session.

## Next recommended session

Session 3 (Ticketing & Service Workflow: F019–F025, F029–F030) — same triage approach applies: the ticket lifecycle state machine (F023) and priority/impact assessment (F021) are plausibly buildable as pure logic (F023 can follow the same generalize-from-`project-status` approach as F016; F021 needs care not to invent scoring weights that aren't in the provided requirements — likely types-only unless a defensible, requirements-derived formula exists). Continuing without further check-ins per standing instruction.
