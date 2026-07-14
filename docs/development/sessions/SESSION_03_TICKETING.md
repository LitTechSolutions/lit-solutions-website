# Session 03 — Ticketing & Service Workflow (F019–F025, F029–F030)

**Date:** 2026-07-14
**Scope:** F019–F025, F029, F030 per the master instruction's §13 Session 3 assignment. Working unattended per Dylan's standing instruction (2026-07-14) — no check-ins, continuing session-by-session, nothing published or pushed.

## What happened

Same triage discipline as Sessions 1–2, with one new wrinkle this session: two functions (F020 triage, F021 priority) need real business configuration (routing rules, scoring weights) that doesn't exist in the Global Requirements, Master Function Index, or — since they don't exist — the individual F020/F021 workbooks. Rather than invent plausible-looking categories or weights (which the master instruction explicitly prohibits — "never invent... business facts"), both were built as **engines that take that configuration as input**, tested against synthetic rule tables/weights, with real content left for Dylan to supply later. This is the same pattern already used for F056 (settings) and F015 (file-validation defaults): build the interpreter, not the invented policy.

Built for real: **F023/F029** (ticket lifecycle state machine, generalized from the existing `project-status` spec's shape — golden path plus the waiting-on-customer loop plus a reopen-window check), **F020** (triage rule-table interpreter — throws rather than silently defaulting when nothing matches), **F021** (priority scorer for 4 of the objective's 5 stated factors — impact, urgency, safety, security; the 5th, entitlement, is skipped because it needs F049, blocked), **F022** (technician assignment — least-loaded matching among technicians explicitly assigned to the organization, mirroring `rbac.js`'s assignment contract), **F025** (time-entry aggregation with zero dollar amounts anywhere — cost tracking needs pricing, blocked), **F019** (ticket submission shaping — and this one directly fixes an open audit finding: F018, "Intake form's 'just type 4' instruction," by rejecting placeholder-junk values in optional fields at the validation layer).

Not modified: **F024** (Ticket Conversation & Attachments) — assessed as fully composable from F013 (messaging) + F015 (files), no new module judged necessary. **F030** (Satisfaction Survey) — Phase 2, not MVP, deferred by the same priority rule used for F011/F018 in Session 2.

One naming collision surfaced directly this session, not just in the abstract: function **F018** (Knowledge Base, deferred as Phase 2) and audit finding **F018** ("just type 4") are two completely different things that happen to share an ID — and this session's F019 work fixes the *finding* while having nothing to do with the *function*. Documented explicitly in `DEV_STATE.json` as a concrete instance of the collision `DECISION_LOG.md` already flagged in Session 0.

## Code written

- `src/domain/ticket.js`, `triage.js`, `priority.js`, `assignment.js`, `workLog.js` — JSDoc-typed validators.
- `src/policy/ticketLifecycle.js` — F023/F029: 8-state machine + 14-day reopen window (engineering default), 12 tests including the golden path and the "closed can only go to reopened, not straight back to in_progress" rule.
- `src/policy/triageEngine.js` — F020: priority-ordered rule-table matcher, 8 tests, throws on no match rather than guessing.
- `src/policy/priorityScoring.js` — F021: weighted impact/urgency scorer with safety/security override-to-critical, 8 tests, weights/thresholds fully configurable.
- `src/policy/assignmentQueue.js` — F022: least-loaded eligible-technician selection, 6 tests.
- `src/tracking/timeTracking.js` — F025: per-ticket and per-technician minute aggregation, 5 tests, explicitly no cost fields.
- `src/policy/ticketSubmission.js` — F019: intake shaping/validation, 7 tests including the placeholder-junk rejection that fixes audit finding F018.

123 total unit tests now, up from 77 after Session 2, all passing, zero new dependencies.

## Tests run

`npm test` → 123/123 passing. `evidence/tests/session-03-test-run.txt`.

## Requirements traceability

See `REQUIREMENTS_TRACEABILITY.md` (updated). Nothing reaches "Verified" — same reasoning as prior sessions.

## Files changed

New: 5 domain type files, `src/policy/ticketLifecycle.js` (+test), `triageEngine.js` (+test), `priorityScoring.js` (+test), `assignmentQueue.js` (+test), `src/tracking/timeTracking.js` (+test), `src/policy/ticketSubmission.js` (+test), `evidence/tests/session-03-test-run.txt`, this file. Modified: `REQUIREMENTS_TRACEABILITY.md`, `DEV_STATE.json`, `DEV_INDEX.md`. No Netlify Function endpoints, no HTML/CSS, no `v23`.

## Owner decisions still required

Unchanged in kind, growing in scope — see `OWNER_DECISIONS.md`. New this session: F020's actual triage rule table and F021's actual priority weights are both waiting on either the missing individual workbooks or Dylan's direct input (`OWNER_DECISIONS.md` #10) — the engines exist and are tested, but do nothing real until fed real configuration.

## Next recommended session

Session 4 (Commercial Control: F026–F028, F049–F052) is explicitly the highest-risk session per the master instruction ("Do not change approved business values... Pricing must come from one authoritative versioned source... No customer can alter protected amount or payment reference values"). Nearly every function in it is already blocked (`OWNER_DECISIONS.md` #1, #2, #3) — F026, F027, F028, F049, F050, F052 are all pricing/plan/payment-timing dependent. Expect Session 4 to be almost entirely documentation (what the pricing engine's *shape* should be once values are approved) rather than working code, continuing unattended per standing instruction.
