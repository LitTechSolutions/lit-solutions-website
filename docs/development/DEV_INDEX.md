# Development Index

Human-readable index of the LTS Business Care Hub development effort. See `DEV_STATE.json` for machine-readable state and `00_DEV_CONTROL.md` for process/ground rules.

**Start here if resuming cold:** `DEV_STATE.json` → `releaseRecommendation`, then `OWNER_DECISIONS.md` (all 10 items are still open as of Session 9 — that's what unblocks the next round of work), then `sessions/SESSION_09_RELEASE_REVIEW.md` for the full final assessment.

## Documents

| Doc | Covers |
|---|---|
| [00_DEV_CONTROL.md](00_DEV_CONTROL.md) | Process, ground rules, how to resume cold |
| [DEV_STATE.json](DEV_STATE.json) | Machine-readable session/wave/blocker state + final release recommendation |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current-state architecture (with diagrams), module reuse classification, 9-spec-overlap table, target architecture proposal |
| [REQUIREMENTS_CATALOG.json](REQUIREMENTS_CATALOG.json) | F001–F060 lightweight catalog + recommended build sequence |
| [DATA_MODEL.md](DATA_MODEL.md) | Current Blobs schema, target common data model, privacy data categories |
| [AUTHORIZATION_MODEL.md](AUTHORIZATION_MODEL.md) | Current 2-tier/no-tenant auth vs. target 6-role org-scoped model |
| [API_CATALOG.md](API_CATALOG.md) | Current 12 functions + 9 spec-only functions vs. target API standards |
| [DECISION_LOG.md](DECISION_LOG.md) | Engineering decisions made in-session, with reasoning |
| [OWNER_DECISIONS.md](OWNER_DECISIONS.md) | 10 decisions only Dylan can make — **all still open as of Session 9** |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | Migration protocol + known future migrations (org-id retrofit, possible Postgres move) |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Target test coverage by layer, tooling recommendation, release gates |
| [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md) | How Care Hub work fits the existing vN-folder deploy model; standing local-only instruction |
| [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md) | Rollback mechanics, current and required |
| [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | Session 9: what was and wasn't reviewable given no live deployment; one open finding (CSV formula-injection guard) |
| [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) | Requirement → code → test → status mapping for all 27 built functions |
| [sessions/SESSION_00_DISCOVERY.md](sessions/SESSION_00_DISCOVERY.md) | Discovery: real repo location, static-site architecture, audit findings |
| [sessions/SESSION_01_FOUNDATION.md](sessions/SESSION_01_FOUNDATION.md) | F005 RBAC, F008 audit trail, F056 settings |
| [sessions/SESSION_02_CUSTOMER_WORKSPACE.md](sessions/SESSION_02_CUSTOMER_WORKSPACE.md) | F009, F012, F015, F016, F017 |
| [sessions/SESSION_03_TICKETING.md](sessions/SESSION_03_TICKETING.md) | F019–F023/F029, F025 |
| [sessions/SESSION_04_COMMERCIAL.md](sessions/SESSION_04_COMMERCIAL.md) | F026, F028, F049, F050, F052 |
| [sessions/SESSION_05_IT_SERVICES.md](sessions/SESSION_05_IT_SERVICES.md) | F044, F046/F047, F048 |
| [sessions/SESSION_06_WEBSITE_CARE.md](sessions/SESSION_06_WEBSITE_CARE.md) | F036, F037 (reuse), F040/F042 evidence categorization |
| [sessions/SESSION_07_REPORTING_OPERATIONS.md](sessions/SESSION_07_REPORTING_OPERATIONS.md) | F051, F053, F054, F055, F057 |
| [sessions/SESSION_08_AI_ASSISTANCE.md](sessions/SESSION_08_AI_ASSISTANCE.md) | Gate-status record — F060 not started, 7-gate table |
| [sessions/SESSION_09_RELEASE_REVIEW.md](sessions/SESSION_09_RELEASE_REVIEW.md) | Final release recommendation: not ready, here's exactly why |

**Not yet created** (start when there's something to populate them with): `RELEASE_NOTES.md` (first real release).

## Source code

`src/domain/` (types + validators for nearly every function through F060's dependencies), `src/policy/` (F005 RBAC, F015 file validation, F016 approvals, F019 ticket submission, F020 triage, F021 priority, F022 assignment, F023/F029 ticket lifecycle, F026 scope versioning, F028 payment reconciliation, F044 IT support classification, F046/F047 readiness checklist, F049 entitlement check, F050 pricing engine, F052 subscription lifecycle, F036 incident status), `src/audit/` (F008), `src/settings/` (F056), `src/notifications/` (F012 delivery policy), `src/timeline/` (F017), `src/dashboard/` (F009), `src/tracking/` (F025 time), `src/reminders/` (F048, reused by F037), `src/reporting/` (F040/F042 evidence categorization + monthly report assembler), `src/admin/` (F051 work queue), `src/templates/` (F055), `src/webhooks/` (F057), `src/export/` (F053 CSV), `src/analytics/` (F054), `test/fixtures/` (synthetic two-org fixtures). Plain JSDoc-typed CommonJS, no build step — see `DECISION_LOG.md`'s Session 1 entry for why TypeScript/esbuild was deferred. `npm test` runs everything (`node --test`, zero added runtime dependencies). 93 source files, 30 test files, 236 tests, all passing.

## Evidence

`evidence/{builds,tests,accessibility,security,migrations,smoke-tests}/` — supporting raw evidence as sessions produce it. Session 0's baseline-command evidence is under `evidence/builds/`; every session's test run (1 through the final Session 9 regression) is under `evidence/tests/`.

## Current state at a glance

- **Sessions 0–9 complete** — the master instruction's entire defined session sequence. Worked unattended, session-by-session, per Dylan's standing instruction (2026-07-14) — owner-decision blockers documented in `OWNER_DECISIONS.md` throughout rather than asked about. Nothing published or pushed at any point.
- **Workspace:** `LTS Stand Alone Software`, branch `feature/business-care-hub`, copied from `v23` @ `1570734`. `v23` untouched throughout. Everything stays local for the entire build (standing instruction, `DECISION_LOG.md`).
- **Built:** 27 of 60 functions with real, tested domain/policy logic. 236 passing unit tests. Zero endpoints, zero UI, zero persistence — deliberate, given zero of the 10 `OWNER_DECISIONS.md` items were resolved along the way.
- **Release status:** **not ready** — see `DEV_STATE.json` → `releaseRecommendation` and `sessions/SESSION_09_RELEASE_REVIEW.md` for the full assessment.
- **What unblocks the next round of work:** Dylan resolving `OWNER_DECISIONS.md`, starting with #1 (primary data store) — that single decision unblocks the most downstream work (F001/F005 architecture finalization, which nearly everything else depends on).
