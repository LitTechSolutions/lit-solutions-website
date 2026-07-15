# Session 14 — Pricing/Plan-Limit Owner Decision Resolved, Final Engine + Persistence Batch

## Summary

Dylan supplied the two remaining highest-leverage owner decisions verbatim in
chat: Care Hub custom-work payment timing, and the Website Care Plan / Small
Business IT Support Plan included scope. This resolved `OWNER_DECISIONS.md`
items #2 and #3, unblocking the last six functions (F026, F027, F028, F049,
F050, F052) that had complete pure engines but no real business values to
run them against.

This session built the two remaining pure engines the policy required
(payment-timing scheduling, overage billing), then persisted all five
commercial functions that were engine-complete but not yet wired to
Postgres: scope of work, change orders, payment requests, entitlements/
usage, and subscriptions. Real plan-limit values were seeded into the live
Neon database.

## What Dylan provided (verbatim, recorded in `OWNER_DECISIONS.md` and
`DECISION_LOG.md`)

1. **Care Hub custom work / change orders**: work under $500 is paid in full
   upfront after quote approval; work at $500+ requires a 50% deposit before
   work begins with the balance due on completion; third-party expenses
   (hardware, licenses, subscriptions) are always paid upfront regardless of
   size; no out-of-scope work begins without written approval.
2. **Website Care Plan ($39/mo)**: one website, routine checks, up to 30
   minutes of small content edits across at most 2 requests per billing
   month (resets, no rollover), overage at $85/hr billed in 15-minute
   increments with approval required, new pages/redesigns/SEO/etc. out of
   scope and separately quoted.
3. **Small Business IT Support Plan ($79/mo)**: one location, up to 5
   devices, up to 60 minutes of remote support across at most 2
   sessions/tickets per billing month (resets, no rollover), additional
   remote support at $95/hr, on-site at $125/hr with a 1-hour minimum,
   anything expected to exceed 2 hours or involving major project work
   converts to a separately approved fixed-price quote.

## What was built

### Pure engines (no persistence dependency)

- **`src/policy/paymentSchedule.js`** (F028) — `determinePaymentSchedule(totalAmount, options)`.
  $500 deposit threshold, 50% deposit / 50% balance split, third-party
  expenses always `full_upfront` regardless of amount. 7 tests.
- **`src/policy/overageBilling.js`** (F049/F050) — three functions:
  `calculateCarePlanOverage` ($85/hr), `calculateItPlanRemoteOverage`
  ($95/hr), `calculateItPlanOnsite` ($125/hr, 1-hour minimum). All bill in
  15-minute increments, rounding up. 11 tests. One documented assumption:
  Dylan's policy doesn't explicitly say whether on-site time *beyond* the
  1-hour minimum also rounds to 15-minute increments — applied the same
  rounding for consistency with the rest of the policy, flagged in-code as
  an assumption to confirm later if it matters.

### Persistence (Postgres, following the established fetch-validate-persist
pattern, each wired to its existing pure engine rather than duplicating
logic)

- **`src/db/scopeOfWorkStore.js`** (F026) — wraps `scopeVersioning.js`'s
  `createNextVersion()`; old version marked superseded and new version
  inserted together, never mutated in place. 8 tests.
- **`src/db/changeOrderStore.js`** (F027) — deliberately reuses
  `approvalStore.createApprovalRequest()` instead of a second approval
  mechanism. A `ChangeOrder` has no `status` field of its own — approval
  state lives entirely on the paired `ApprovalRequest`, which is a
  structural guarantee (not just convention) that no change order can be
  "approved" without going through the same approval workflow every other
  approval uses. 4 tests.
- **`src/db/paymentRequestStore.js`** (F028) — combines
  `paymentSchedule.js` (how many payments, what amounts) with
  `paymentReconciliation.js` (the requested→paid→reconciled state
  machine). `amount_ref` stays an opaque pointer per
  `domain/paymentRequest.js`'s existing contract — no raw dollar figure is
  ever written to the database; one test explicitly asserts this. 10 tests.
- **`src/db/entitlementStore.js`** (F049) — wraps
  `entitlementCheck.js`'s `checkEntitlement()`. Usage is only ever
  persisted after the pure comparator confirms it fits within the
  remaining allowance; monthly-reset usage buckets to the 1st of the
  current UTC month, total-reset usage to a single fixed period. 12 tests.
- **`src/db/subscriptionStore.js`** (F052) — wraps
  `subscriptionLifecycle.js`'s `transitionSubscriptionStatus()`; confirms
  `cancelled` is genuinely terminal (rejects reactivation, matching the
  domain comment that a cancelled subscription is re-subscribed as a new
  record). 8 tests.

### Live data seed

Seeded real plan-limit rows into the live Neon `entitlement_limits` table
via a temporary root-level script (deleted after use, following the
Session 13 lesson that `require()` resolves `node_modules` relative to the
script's own directory, not `cwd`):

| plan_key | usage_key | limit | reset_period |
|---|---|---|---|
| website_care | monthly_edit_minutes | 30 | monthly |
| website_care | monthly_edit_requests | 2 | monthly |
| small_business_it | monthly_support_minutes | 60 | monthly |
| small_business_it | monthly_support_tickets | 2 | monthly |
| small_business_it | covered_device_count | 5 | total |

Verified present via a live `SELECT * FROM entitlement_limits`. This is the
second table (after Session 13's smoke-test rows) to hold real,
owner-approved data rather than synthetic test fixtures.

## Test results

389/389 unit tests passing (`node --test 'src/**/*.test.js'`), up from 335
at the end of Session 12 — +54 new tests this session across 7 new files.
Evidence: `evidence/tests/session-14-pricing-persistence.txt`.

## What this unblocks

Every function in the F001–F060 catalog now either (a) has both a complete
pure engine and Postgres persistence, (b) is deliberately deferred with a
documented reason, or (c) is gated on one of the 7 remaining open owner
decisions or the AI Assistance gate. No function remains blocked solely on
"engine built, waiting on the data-store decision" or "engine built,
waiting on pricing content" — both of those blanket blockers, which
governed most of Sessions 10–13, are now resolved.

## What's still not done

- No Netlify Function HTTP endpoints exist for any Care Hub feature yet —
  everything built through Session 14 is domain/policy/persistence layer
  only, callable from Node but not reachable over HTTP or from a browser.
- No UI.
- 7 owner decisions remain open (registration model, retention/legal
  wording, new paid providers, remote-support/device-agent scope, AI
  provider/policy, and the missing individual F001–F060 workbooks).
- Only 5 of 28 persisted functions have been live-smoke-tested end to end
  (the rest are schema-verified but not individually exercised against the
  real database).

## Files changed

- New: `src/policy/paymentSchedule.js` (+test), `src/policy/overageBilling.js` (+test)
- New: `src/db/scopeOfWorkStore.js` (+test), `src/db/changeOrderStore.js` (+test),
  `src/db/paymentRequestStore.js` (+test), `src/db/entitlementStore.js` (+test),
  `src/db/subscriptionStore.js` (+test)
- Modified: `docs/development/OWNER_DECISIONS.md`, `docs/development/DECISION_LOG.md`,
  `docs/development/REQUIREMENTS_TRACEABILITY.md`, `docs/development/DEV_STATE.json`
- New evidence: `docs/development/evidence/tests/session-14-pricing-persistence.txt`
- Live database: 5 rows seeded into `entitlement_limits` (no schema change — table already existed from the Session 13 migration)
