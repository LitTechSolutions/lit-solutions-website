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
| [sessions/SESSION_00_DISCOVERY.md](sessions/SESSION_00_DISCOVERY.md) | Narrative record of this session |

**Not yet created** (start when there's something to populate them with): `REQUIREMENTS_TRACEABILITY.md` (Session 1, once functions are implemented), `RELEASE_NOTES.md` (first release), `SECURITY_REVIEW.md` (before first production-affecting change).

## Evidence

`evidence/{builds,tests,accessibility,security,migrations,smoke-tests}/` — supporting raw evidence as sessions produce it. Session 0's baseline-command evidence is under `evidence/builds/`.

## Current state at a glance

- **Session:** 0 complete, Session 1 (Platform Foundation: F001–F008, F056, F058, F059) recommended next, pending Dylan's review of `OWNER_DECISIONS.md`.
- **Workspace:** `LTS Stand Alone Software`, branch `feature/business-care-hub`, copied from `v23` @ `1570734`. `v23` untouched.
- **Blockers:** see `DEV_STATE.json` → `ownerDecisionsRequired` and `blockedFunctions`.
