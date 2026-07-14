# Development Index

Human-readable index of the LTS Business Care Hub development effort. See `DEV_STATE.json` for machine-readable state and `00_DEV_CONTROL.md` for process/ground rules.

## Documents

| Doc | Covers |
|---|---|
| [00_DEV_CONTROL.md](00_DEV_CONTROL.md) | Process, ground rules, how to resume cold |
| [DEV_STATE.json](DEV_STATE.json) | Machine-readable session/wave/blocker state |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Current-state architecture (with diagrams), module reuse classification, 9-spec-overlap table, target architecture proposal |
| [REQUIREMENTS_CATALOG.json](REQUIREMENTS_CATALOG.json) | F001–F060 lightweight catalog + recommended build sequence |
| [DATA_MODEL.md](DATA_MODEL.md) | Current Blobs schema, target common data model, privacy data categories |
| [AUTHORIZATION_MODEL.md](AUTHORIZATION_MODEL.md) | Current 2-tier/no-tenant auth vs. target 6-role org-scoped model |
| [API_CATALOG.md](API_CATALOG.md) | Current 12 functions + 9 spec-only functions vs. target API standards |
| [DECISION_LOG.md](DECISION_LOG.md) | Engineering decisions made in-session, with reasoning |
| [OWNER_DECISIONS.md](OWNER_DECISIONS.md) | 10 decisions only Dylan can make, with options/consequences/recommendations |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | Migration protocol + known future migrations (org-id retrofit, possible Postgres move) |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Target test coverage by layer, tooling recommendation, release gates |
| [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md) | How Care Hub work fits the existing vN-folder deploy model |
| [ROLLBACK_PLAN.md](ROLLBACK_PLAN.md) | Rollback mechanics, current and required |
| [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) | Requirement → code → test → status mapping (started Session 1) |
| [sessions/SESSION_00_DISCOVERY.md](sessions/SESSION_00_DISCOVERY.md) | Narrative record of Session 0 |
| [sessions/SESSION_01_FOUNDATION.md](sessions/SESSION_01_FOUNDATION.md) | Narrative record of Session 1 |
| [sessions/SESSION_02_CUSTOMER_WORKSPACE.md](sessions/SESSION_02_CUSTOMER_WORKSPACE.md) | Narrative record of Session 2 |
| [sessions/SESSION_03_TICKETING.md](sessions/SESSION_03_TICKETING.md) | Narrative record of Session 3 |
| [sessions/SESSION_04_COMMERCIAL.md](sessions/SESSION_04_COMMERCIAL.md) | Narrative record of Session 4 |
| [sessions/SESSION_05_IT_SERVICES.md](sessions/SESSION_05_IT_SERVICES.md) | Narrative record of Session 5 |
| [sessions/SESSION_06_WEBSITE_CARE.md](sessions/SESSION_06_WEBSITE_CARE.md) | Narrative record of Session 6 |

**Not yet created** (start when there's something to populate them with): `RELEASE_NOTES.md` (first release), `SECURITY_REVIEW.md` (before first production-affecting change).

## Source code

`src/domain/` (types + validators for nearly every function through F048, plus F031/F033/F035-F042/F043 website-care and IT types), `src/policy/` (F005 RBAC, F015 file validation, F016 approvals, F019 ticket submission, F020 triage, F021 priority, F022 assignment, F023/F029 ticket lifecycle, F026 scope versioning, F028 payment reconciliation, F044 IT support classification, F046/F047 readiness checklist, F049 entitlement check, F050 pricing engine, F052 subscription lifecycle, F036 incident status), `src/audit/` (F008), `src/settings/` (F056), `src/notifications/` (F012 delivery policy), `src/timeline/` (F017), `src/dashboard/` (F009), `src/tracking/` (F025 time), `src/reminders/` (F048, reused by F037), `src/reporting/` (F040/F042 evidence categorization + monthly report assembler), `test/fixtures/` (synthetic two-org fixtures). Plain JSDoc-typed CommonJS, no build step yet — see `DECISION_LOG.md`'s Session 1 entry for why TypeScript/esbuild was deferred rather than adopted immediately. `npm test` runs everything (`node --test`, zero added runtime dependencies).

## Evidence

`evidence/{builds,tests,accessibility,security,migrations,smoke-tests}/` — supporting raw evidence as sessions produce it. Session 0's baseline-command evidence is under `evidence/builds/`; Session 1–6 test runs are under `evidence/tests/`.

## Current state at a glance

- **Session:** 6 complete (partial — see blockers). Sessions 0–6 done. Working autonomously, unattended, session-by-session, without stopping to ask (standing instruction, 2026-07-14) — owner-decision blockers are documented in `OWNER_DECISIONS.md`, not asked about. Nothing published/pushed.
- **Workspace:** `LTS Stand Alone Software`, branch `feature/business-care-hub`, copied from `v23` @ `1570734`. `v23` untouched. Everything stays local for the entire build (standing instruction, `DECISION_LOG.md`).
- **Built so far:** 22 functions with real tested logic (F005 through F052, see `DEV_STATE.json` → `implementedFunctions`), 200 passing unit tests, no endpoints wired yet. Session 6 added a structural implementation of the Website Care requirement that every customer report distinguish verified fact / automated observation / technician interpretation / recommendation / customer action, and rejects "guaranteed" language outright.
- **Blockers:** see `DEV_STATE.json` → `ownerDecisionsRequired` and `blockedFunctions`. Same handful of owner decisions (primary data store, pricing, plan limits, checklist/rule-table content) now block the majority of the codebase's logic layer from doing anything real. F035/F036/F038/F039/F040 also still need their check-EXECUTION engines built (HTTP fetch, DOM parsing, SSRF protection) — deliberately deferred to adapt the existing `website-audit` spec rather than rebuild from scratch.
