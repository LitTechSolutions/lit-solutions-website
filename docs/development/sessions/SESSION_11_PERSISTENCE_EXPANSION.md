# Session 11 — Persistence Expansion

**Date:** 2026-07-14
**Trigger:** Direct continuation of Session 10, under Dylan's bypass permission ("take care of everything without interruption... keep everything local"). Realized the primary-data-store decision unblocked far more than the three functions built in Session 10 — every function previously marked "types drafted, persistence blocked on primary-data-store decision" and nothing else was equally unblocked.

## What happened

Built real Postgres persistence for 12 more functions, all following the pattern established in Session 10: validate with the existing domain type, then either a straightforward insert/update, or — where a pure engine already decides what's legal — fetch, run the engine, persist only if allowed.

**Wired to existing engines, not re-implemented:**
- `approvalStore.js` (F016) fetches the current approval, runs it through `approvalWorkflow.js`'s `transitionApproval()`, and only writes if the transition is legal — an illegal transition (e.g. approving an already-decided or expired request) throws before any UPDATE runs.
- `ticketStore.js` (F019/F023/F029) creates tickets through `ticketSubmission.js` (so the placeholder-junk rejection from audit finding F018 applies at the persistence layer too) and transitions status through `ticketLifecycle.js`'s state machine, same fetch-validate-persist shape as approvals.
- `ticketWorkflowStore.js` bundles F020/F021/F022 (triage, priority, assignment) since each is "persist the outcome of one engine call" — `triageEngine.classifyTicket()`, `priorityScoring.scorePriority()`, `assignmentQueue.selectAssignee()` respectively.
- `activityEventStore.js` (F017) — an integration test proves persisted rows correctly filter by customer visibility once fetched and passed through `activityTimeline.js`'s `buildTimeline()`.
- `workLogStore.js` (F025) — `getTotalMinutesForTicket()` fetches rows and hands them to `timeTracking.js`'s aggregator rather than summing in SQL.
- `reminderStore.js` (F037/F048) — `listDueReminders()` fetches all unsent reminders and filters through `lifecycleReminders.js`'s `evaluateReminder()`, proving at the persistence layer that the same engine really does serve both functions (the Session 6 reuse decision).

**Simple CRUD, no engine to wire (the domain type IS the validation):** `serviceRecordStore.js` (F010), `websiteProfileStore.js` (F031), `assetStore.js` (F041 backups + F043 technology assets).

**A real bug, caught and fixed:** `assetStore.js`'s `markBackupRestoreVerified()` originally wrote `SET restore_verified = true` as a raw SQL literal instead of binding it as a parameter (`${true}`) — inconsistent with every other write in this batch and in Session 10. The test asserting on bound values caught it immediately; fixed before commit, not left as a known issue. Small, but exactly the kind of inconsistency that's worth catching mechanically rather than trusting review alone.

## Code written

12 new `src/db/*.js` files + their test files: `serviceRecordStore.js`, `approvalStore.js`, `activityEventStore.js`, `ticketStore.js`, `ticketWorkflowStore.js`, `workLogStore.js`, `websiteProfileStore.js`, `assetStore.js`, `reminderStore.js` (9 files; `ticketWorkflowStore.js` covers 3 functions).

52 new tests, 311 total, all passing.

## Tests run

`npm test` → 311/311 passing. `evidence/tests/session-11-persistence-expansion.txt`.

## Requirements traceability

See `REQUIREMENTS_TRACEABILITY.md`'s new "Post-Session-10" section — full function-by-function breakdown of what's wired to what.

## Files changed

New: 9 `src/db/*.js` files + 9 test files, `evidence/tests/session-11-persistence-expansion.txt`, this file. Modified: `REQUIREMENTS_TRACEABILITY.md`, `DEV_STATE.json`, `DEV_INDEX.md`. No Netlify Function endpoints, no HTML/CSS, no `v23`. Nothing pushed.

## What's still needed before any of this is trusted live

Unchanged from Session 10, now covering more code: provision a Neon project, set `DATABASE_URL`, run `migrations/001_initial_schema.sql`, re-run the full `src/db/` test suite against the live database (currently 75 tests across 12 files run only against fake injected clients).

## Natural next batch (no owner decision needed)

F044 (IT support classification), F046/F047 (readiness checklists), F051 (admin work queue), F053 (CSV export — as a persisted record of what was exported, if that's wanted), F054 (metrics), F055 (templates), F057 (webhooks — as a persisted log of verified events) are all engine-complete from Sessions 5 and 7 and, like this session's batch, need no business content decided first — just persistence wiring. Continuing there next, unless redirected.
