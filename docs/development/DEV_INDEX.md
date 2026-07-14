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

**Not yet created** (start when there's something to populate them with): `RELEASE_NOTES.md` (first release), `SECURITY_REVIEW.md` (before first production-affecting change).

## Source code

`src/domain/` (types + validators), `src/policy/rbac.js` (F005), `src/audit/` (F008), `src/settings/` (F056), `test/fixtures/` (synthetic two-org fixtures). Plain JSDoc-typed CommonJS, no build step yet — see `DECISION_LOG.md`'s Session 1 entry for why TypeScript/esbuild was deferred rather than adopted immediately. `npm test` runs everything (`node --test`, zero added runtime dependencies).

## Evidence

`evidence/{builds,tests,accessibility,security,migrations,smoke-tests}/` — supporting raw evidence as sessions produce it. Session 0's baseline-command evidence is under `evidence/builds/`; Session 1's test run is under `evidence/tests/`.

## Current state at a glance

- **Session:** 1 complete (partial — see blockers). Sessions 0–1 done.
- **Workspace:** `LTS Stand Alone Software`, branch `feature/business-care-hub`, copied from `v23` @ `1570734`. `v23` untouched. Everything stays local for the entire build (standing instruction, `DECISION_LOG.md`).
- **Built this session:** F005 (RBAC engine), F008 (audit trail), F056 (settings/flags) — domain/policy layer, 44 passing unit tests, no endpoints wired yet.
- **Blockers:** see `DEV_STATE.json` → `ownerDecisionsRequired` and `blockedFunctions`. Primary data store is the highest-priority open decision.
