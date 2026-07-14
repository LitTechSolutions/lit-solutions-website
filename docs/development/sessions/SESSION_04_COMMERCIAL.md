# Session 04 — Commercial Control (F026–F028, F049–F052)

**Date:** 2026-07-14
**Scope:** F026–F028, F049–F052 per the master instruction's §13 Session 4 assignment — explicitly flagged there as the highest-risk session ("Do not change approved business values... No customer can alter protected amount or payment reference values"). Working unattended per Dylan's standing instruction — no check-ins, nothing published or pushed.

## What happened

Every function in this wave sits directly on top of pricing, plan-limit, or payment-timing owner decisions that are still open (`OWNER_DECISIONS.md` #2, #3). Rather than treat that as a full session-stop, the same "engine, not policy" pattern established in Session 3 for triage/priority was applied across the board: every function's *mechanism* was built and tested, with real business values (prices, discounts, plan limits) left as caller-supplied configuration rather than invented.

The pricing engine (F050) specifically mirrors the subtotal-then-additive-discounts pattern already live in `netlify/functions/website-designer.js` rather than inventing a new calculation shape — once Dylan approves an actual price sheet, F050 can become the one authoritative implementation the master instruction's centralization principle (§9.3) calls for, replacing the Website Designer's necessarily-duplicated client/server copies, instead of being a third, inconsistent one.

F027 (Change Order Approval) turned out to need no new workflow logic at all: F016's approval state machine (built Session 2) already includes `"change_order"` as a subject type, so F027 only needed its own record shape (`ChangeOrder`), not a second approval engine.

By the end of this session, most of what's been built across Sessions 1–4 is functionally inert pending the same handful of owner decisions — which is the expected, correct outcome of the master instruction's blocking process, not a sign of stalled progress: the mechanisms are done, tested, and ready to activate the moment real values exist.

## Code written

- `src/domain/scopeOfWork.js`, `changeOrder.js`, `paymentRequest.js`, `entitlement.js`, `priceSheet.js`, `subscription.js` — JSDoc-typed validators. Every dollar-amount field is an opaque `priceRef`/`amountRef`, never a raw number.
- `src/policy/scopeVersioning.js` — F026: immutable version history (SYS-NFR-011), 5 tests.
- `src/policy/paymentReconciliation.js` — F028: `requested → paid → reconciliation_pending → reconciled/failed` state machine, 7 tests, modeling states a manual or future-webhook flow would move through (no webhook infra exists anywhere in this codebase).
- `src/policy/entitlementCheck.js` — F049: generic usage-vs-limit comparator, 7 tests, takes the limit as input.
- `src/policy/pricingEngine.js` — F050: subtotal + stacked percentage/fixed/bundle discounts, 9 tests, mirrors the existing Website Designer pattern.
- `src/policy/subscriptionLifecycle.js` — F052: `active/paused/cancelled` state machine, 4 tests.

155 total unit tests now, up from 123 after Session 3, all passing, zero new dependencies.

## Tests run

`npm test` → 155/155 passing. `evidence/tests/session-04-test-run.txt`.

## Requirements traceability

See `REQUIREMENTS_TRACEABILITY.md` (updated). Nothing reaches "Verified" — same reasoning as prior sessions; additionally, none of this session's engines have real business configuration behind them yet, so even once wired to persistence they'd need real prices/limits before doing anything customer-facing.

## Files changed

New: 6 domain type files, `src/policy/scopeVersioning.js` (+test), `paymentReconciliation.js` (+test), `entitlementCheck.js` (+test), `pricingEngine.js` (+test), `subscriptionLifecycle.js` (+test), `evidence/tests/session-04-test-run.txt`, this file. Modified: `REQUIREMENTS_TRACEABILITY.md`, `DEV_STATE.json`, `DEV_INDEX.md`. No Netlify Function endpoints, no HTML/CSS, no `v23`.

## Owner decisions still required

Unchanged in kind — see `OWNER_DECISIONS.md`. This session makes the cost of *not* deciding pricing/plan-limits concrete and visible: F026, F027, F028, F049, F050, F052 are all engine-complete and fully tested, and all six are simultaneously blocked from doing anything real by the same 2-3 open decisions.

## Next recommended session

Session 5 (IT Services: F043–F048). Less blocked than Session 4 — asset inventory (F043) and service history (F045) don't depend on pricing, though F044 (IT Support Request) shares F019's shape and F046/F047 (Security Readiness, MFA Checklist) need to stay carefully within the product's stated boundaries ("not... A remote-monitoring agent... A password manager" — master instruction Product Definition). Continuing unattended per standing instruction.
