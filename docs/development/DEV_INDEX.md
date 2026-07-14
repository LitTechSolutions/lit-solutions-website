# Development Index

Human-readable index of the LTS Business Care Hub development effort. See `DEV_STATE.json` for machine-readable state and `00_DEV_CONTROL.md` for process/ground rules.

**Start here if resuming cold:** `DEV_STATE.json` → `releaseRecommendation`, then `OWNER_DECISIONS.md` (item #1 resolved 2026-07-14 — Postgres on Neon; the other 9 are still open), then `sessions/SESSION_10_DATA_STORE_DECIDED.md` for the latest work.

## Documents

| Doc | Covers |
|---|---|
| [00_DEV_CONTROL.md](00_DEV_CONTROL.md) | Process, ground rules, how to resume cold |
| [DEV_STATE.json](DEV_STATE.json) | Machine-readable session/wave/blocker state + release recommendation |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current-state architecture, module reuse classification, target architecture — data-store section now reflects the decided Postgres/Neon design |
| [REQUIREMENTS_CATALOG.json](REQUIREMENTS_CATALOG.json) | F001–F060 lightweight catalog + recommended build sequence |
| [DATA_MODEL.md](DATA_MODEL.md) | Current Blobs schema + decided Postgres schema, privacy data categories |
| [AUTHORIZATION_MODEL.md](AUTHORIZATION_MODEL.md) | Current 2-tier/no-tenant auth vs. target 6-role org-scoped model |
| [API_CATALOG.md](API_CATALOG.md) | Current 12 functions + 9 spec-only functions vs. target API standards |
| [DECISION_LOG.md](DECISION_LOG.md) | Engineering decisions + the post-Session-9 owner decision record |
| [OWNER_DECISIONS.md](OWNER_DECISIONS.md) | 10 decisions only Dylan can make — **#1 resolved 2026-07-14, 9 still open** |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | Migration protocol; next infrastructure step is provisioning Neon and running `migrations/001_initial_schema.sql` |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Target test coverage by layer, tooling recommendation, release gates |
| [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md) | Standing local-only instruction; new `DATABASE_URL` environment variable requirement |
| [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md) | Rollback mechanics, current and required |
| [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | Session 9: what was and wasn't reviewable given no live deployment; one open finding (CSV formula-injection guard) |
| [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) | Requirement → code → test → status mapping, now including F001/F005/F008 persistence |
| [sessions/SESSION_00_DISCOVERY.md](sessions/SESSION_00_DISCOVERY.md) | Discovery: real repo location, static-site architecture, audit findings |
| [sessions/SESSION_01_FOUNDATION.md](sessions/SESSION_01_FOUNDATION.md) | F005 RBAC, F008 audit trail, F056 settings |
| [sessions/SESSION_02_CUSTOMER_WORKSPACE.md](sessions/SESSION_02_CUSTOMER_WORKSPACE.md) | F009, F012, F015, F016, F017 |
| [sessions/SESSION_03_TICKETING.md](sessions/SESSION_03_TICKETING.md) | F019–F023/F029, F025 |
| [sessions/SESSION_04_COMMERCIAL.md](sessions/SESSION_04_COMMERCIAL.md) | F026, F028, F049, F050, F052 |
| [sessions/SESSION_05_IT_SERVICES.md](sessions/SESSION_05_IT_SERVICES.md) | F044, F046/F047, F048 |
| [sessions/SESSION_06_WEBSITE_CARE.md](sessions/SESSION_06_WEBSITE_CARE.md) | F036, F037 (reuse), F040/F042 evidence categorization |
| [sessions/SESSION_07_REPORTING_OPERATIONS.md](sessions/SESSION_07_REPORTING_OPERATIONS.md) | F051, F053, F054, F055, F057 |
| [sessions/SESSION_08_AI_ASSISTANCE.md](sessions/SESSION_08_AI_ASSISTANCE.md) | Gate-status record — F060 not started, 7-gate table |
| [sessions/SESSION_09_RELEASE_REVIEW.md](sessions/SESSION_09_RELEASE_REVIEW.md) | Final review of the original 9-session sequence: not ready, here's exactly why |
| [sessions/SESSION_10_DATA_STORE_DECIDED.md](sessions/SESSION_10_DATA_STORE_DECIDED.md) | Data store decided (Postgres/Neon); F001/F005/F008 persistence built |

**Not yet created** (start when there's something to populate them with): `RELEASE_NOTES.md` (first real release).

## Source code

`src/domain/` (types + validators for nearly every function), `src/policy/` (F005 RBAC, F015 file validation, F016 approvals, F019 ticket submission, F020 triage, F021 priority, F022 assignment, F023/F029 ticket lifecycle, F026 scope versioning, F028 payment reconciliation, F044 IT support classification, F046/F047 readiness checklist, F049 entitlement check, F050 pricing engine, F052 subscription lifecycle, F036 incident status), `src/audit/` (F008, Blobs-backed), `src/db/` (**new** — `pgClient.js`, F001/F005/F008 Postgres persistence), `src/settings/` (F056), `src/notifications/` (F012 delivery policy), `src/timeline/` (F017), `src/dashboard/` (F009), `src/tracking/` (F025 time), `src/reminders/` (F048, reused by F037), `src/reporting/` (F040/F042), `src/admin/` (F051), `src/templates/` (F055), `src/webhooks/` (F057), `src/export/` (F053), `src/analytics/` (F054), `test/fixtures/` (synthetic two-org fixtures), `migrations/` (**new** — `001_initial_schema.sql`). Plain JSDoc-typed CommonJS, no build step. `npm test` runs everything (`node --test`). Two dependencies total: `@netlify/blobs` (existing) and `@neondatabase/serverless` (new). 259 tests, all passing.

## Evidence

`evidence/{builds,tests,accessibility,security,migrations,smoke-tests}/` — supporting raw evidence as sessions produce it. Session 0's baseline-command evidence is under `evidence/builds/`; every test run (Session 1 through the Session 10 persistence-layer run) is under `evidence/tests/`.

## Current state at a glance

- **Sessions 0–9 complete** (the master instruction's full defined sequence), **plus a post-Session-9 continuation** once Dylan resolved the primary-data-store decision directly. Worked unattended throughout, with bypass permission granted for this continuation. Nothing published or pushed at any point.
- **Workspace:** `LTS Stand Alone Software`, branch `feature/business-care-hub`, copied from `v23` @ `1570734`. `v23` untouched throughout. Everything stays local for the entire build.
- **Built:** 27 functions with tested domain/policy logic, plus real (unit-tested, not-yet-live) persistence for F001/F005/F008 on Postgres/Neon. 259 passing unit tests.
- **Release status:** **not ready**, but materially closer — see `DEV_STATE.json` → `releaseRecommendation`.
- **Immediate next step:** Dylan provisions a Neon project, sets `DATABASE_URL`, and the migration gets run for real. **Next owner decision to unblock the most additional work:** pricing (`OWNER_DECISIONS.md` #2) — F026/F027/F028/F050/F052 are all engine-complete and waiting on it.
