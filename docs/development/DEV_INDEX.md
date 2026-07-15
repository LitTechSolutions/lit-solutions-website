# Development Index

Human-readable index of the LTS Business Care Hub development effort. See `DEV_STATE.json` for machine-readable state and `00_DEV_CONTROL.md` for process/ground rules.

**Start here if resuming cold:** `DEV_STATE.json` → `releaseRecommendation`, then `OWNER_DECISIONS.md` (item #1 resolved 2026-07-14 — Postgres on Neon; pricing, #2, is now the highest-leverage remaining item), then `sessions/SESSION_12_PERSISTENCE_FINAL_BATCH.md` for the latest work.

## Documents

| Doc | Covers |
|---|---|
| [00_DEV_CONTROL.md](00_DEV_CONTROL.md) | Process, ground rules, how to resume cold |
| [DEV_STATE.json](DEV_STATE.json) | Machine-readable session/wave/blocker state + release recommendation |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current-state architecture, module reuse classification, target architecture — data-store section reflects the decided Postgres/Neon design |
| [REQUIREMENTS_CATALOG.json](REQUIREMENTS_CATALOG.json) | F001–F060 lightweight catalog + recommended build sequence |
| [DATA_MODEL.md](DATA_MODEL.md) | Current Blobs schema + decided Postgres schema, privacy data categories |
| [AUTHORIZATION_MODEL.md](AUTHORIZATION_MODEL.md) | Current 2-tier/no-tenant auth vs. target 6-role org-scoped model |
| [API_CATALOG.md](API_CATALOG.md) | Current 12 functions + 9 spec-only functions vs. target API standards |
| [DECISION_LOG.md](DECISION_LOG.md) | Engineering decisions + the post-Session-9 owner decision record |
| [OWNER_DECISIONS.md](OWNER_DECISIONS.md) | 10 decisions only Dylan can make — **#1 resolved 2026-07-14, 9 still open, pricing (#2) is highest-leverage** |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | Migration protocol; next infrastructure step is provisioning Neon and running `migrations/001_initial_schema.sql` (~31 tables) |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Target test coverage by layer, tooling recommendation, release gates |
| [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md) | Standing local-only instruction; `DATABASE_URL` environment variable requirement |
| [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md) | Rollback mechanics, current and required |
| [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | Session 9: what was and wasn't reviewable given no live deployment; one open finding (CSV formula-injection guard) |
| [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) | Requirement → code → test → status mapping — 34 functions with logic, 21 with persistence |
| [sessions/SESSION_00_DISCOVERY.md](sessions/SESSION_00_DISCOVERY.md) | Discovery: real repo location, static-site architecture, audit findings |
| [sessions/SESSION_01_FOUNDATION.md](sessions/SESSION_01_FOUNDATION.md) | F005 RBAC, F008 audit trail, F056 settings |
| [sessions/SESSION_02_CUSTOMER_WORKSPACE.md](sessions/SESSION_02_CUSTOMER_WORKSPACE.md) | F009, F012, F015, F016, F017 |
| [sessions/SESSION_03_TICKETING.md](sessions/SESSION_03_TICKETING.md) | F019–F023/F029, F025 |
| [sessions/SESSION_04_COMMERCIAL.md](sessions/SESSION_04_COMMERCIAL.md) | F026, F028, F049, F050, F052 |
| [sessions/SESSION_05_IT_SERVICES.md](sessions/SESSION_05_IT_SERVICES.md) | F044, F046/F047, F048 |
| [sessions/SESSION_06_WEBSITE_CARE.md](sessions/SESSION_06_WEBSITE_CARE.md) | F036, F037 (reuse), F040/F042 evidence categorization |
| [sessions/SESSION_07_REPORTING_OPERATIONS.md](sessions/SESSION_07_REPORTING_OPERATIONS.md) | F051, F053, F054, F055, F057 (engines) |
| [sessions/SESSION_08_AI_ASSISTANCE.md](sessions/SESSION_08_AI_ASSISTANCE.md) | Gate-status record — F060 not started, 7-gate table |
| [sessions/SESSION_09_RELEASE_REVIEW.md](sessions/SESSION_09_RELEASE_REVIEW.md) | Final review of the original 9-session sequence: not ready, here's exactly why |
| [sessions/SESSION_10_DATA_STORE_DECIDED.md](sessions/SESSION_10_DATA_STORE_DECIDED.md) | Data store decided (Postgres/Neon); F001/F005/F008 persistence built |
| [sessions/SESSION_11_PERSISTENCE_EXPANSION.md](sessions/SESSION_11_PERSISTENCE_EXPANSION.md) | 12 more functions' persistence built, wired to existing pure engines |
| [sessions/SESSION_12_PERSISTENCE_FINAL_BATCH.md](sessions/SESSION_12_PERSISTENCE_FINAL_BATCH.md) | Final 6 functions' persistence; persistence layer now essentially complete |
| [sessions/SESSION_13_LIVE_DATABASE_VERIFIED.md](sessions/SESSION_13_LIVE_DATABASE_VERIFIED.md) | Migration run live, 4-function smoke test passed, a rejected prompt-injection attempt |

**Not yet created** (start when there's something to populate them with): `RELEASE_NOTES.md` (first real release).

## Source code

`src/domain/`, `src/policy/`, `src/audit/` (Blobs-backed F008 shaping), `src/settings/`, `src/notifications/`, `src/timeline/`, `src/dashboard/`, `src/tracking/`, `src/reminders/`, `src/reporting/`, `src/admin/`, `src/templates/`, `src/webhooks/`, `src/export/`, `src/analytics/` — the pure domain/policy layer built across Sessions 1–7, unchanged in this round. `src/db/` — **21 files**, real Postgres persistence for every engine-complete function, built across the post-Session-9 continuation (Sessions 10–12): `pgClient.js`, `organizationStore.js`, `membershipStore.js`, `pgAuditSink.js`, `serviceRecordStore.js`, `approvalStore.js`, `activityEventStore.js`, `ticketStore.js`, `ticketWorkflowStore.js`, `workLogStore.js`, `websiteProfileStore.js`, `assetStore.js`, `reminderStore.js`, `itSupportStore.js`, `checklistStore.js`, `workQueueQuery.js`, `metricsStore.js`, `templateStore.js`, `webhookEventStore.js`. `migrations/001_initial_schema.sql` — ~31 tables, not yet run against a live database. `test/fixtures/` (synthetic two-org fixtures). Plain JSDoc-typed CommonJS, no build step. `npm test` runs everything (`node --test`). Two dependencies: `@netlify/blobs` (existing), `@neondatabase/serverless` (new). **335 tests, all passing.**

## Evidence

`evidence/{builds,tests,accessibility,security,migrations,smoke-tests}/` — supporting raw evidence as sessions produce it. Session 0's baseline-command evidence is under `evidence/builds/`; every test run (Session 1 through the Session 12 final persistence batch) is under `evidence/tests/`.

## Current state at a glance

- **Sessions 0–9 complete** (the master instruction's full defined sequence), **plus four post-Session-9 continuation sessions (10–13)** once Dylan resolved the primary-data-store decision directly and granted bypass permission to continue unattended. Nothing published or pushed at any point.
- **Workspace:** `LTS Stand Alone Software`, branch `feature/business-care-hub`, copied from `v23` @ `1570734`. `v23` untouched throughout. Everything stays local for the entire build.
- **Built:** 34 functions with tested domain/policy logic, 21 with real Postgres persistence. 335 passing unit tests. **The database is now live** — `migrations/001_initial_schema.sql` ran against real Neon, 37 tables confirmed, and a 4-function smoke test (F001/F005/F008/F019/F023) passed end to end. Zero endpoints, zero UI still.
- **Release status:** **not ready** — see `DEV_STATE.json` → `releaseRecommendation`.
- **Next milestone:** the pricing decision (`OWNER_DECISIONS.md` #2), unblocking F026/F027/F028/F050/F052 — the last five engine-complete functions waiting on real business values. After that: Netlify Function endpoints and a UI are the two largest remaining bodies of work.
