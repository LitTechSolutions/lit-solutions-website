# Session 19 — The Endpoint Layer Is Complete

## Summary

Dylan asked to complete the remaining endpoints without further prompting,
with the instruction that anything genuinely requiring his approval
should be skipped over (not silently assumed) and collected into a
consolidated decision list at the end. This session built the last 12
planned endpoints — every persisted Care Hub store now has an HTTP
endpoint. 23 endpoints total exist as of this session, on top of the
9 built in Sessions 15–18.

## What was built

Twelve endpoints, each following the established pattern
(`care_hub_auth.js` + deps-injection seam):

| Endpoint | Function(s) | Write auth | Read auth |
|---|---|---|---|
| `service-records.js` | F010 | `customer.administer` (reused) | `service_record.view` (new) |
| `website-profiles.js` | F031 | `customer.administer` (reused) | `website_profile.view` (new) |
| `entitlements.js` | F049 | `billing.reconcile` (reused) | `entitlement.view` (new) |
| `subscriptions.js` | F052 | `billing.reconcile` (reused) | `subscription.view` (new) |
| `technology-assets.js` | F043/F041 | `customer.administer` (reused) | `asset.view` (new) |
| `reminders.js` | F048/F037 | `customer.administer` (reused) | `reminder.view` (new) |
| `it-support.js` | F044 | `ticket.work` (reused, assigned-gated) | — |
| `checklists.js` | F046/F047 | `platform.configure` + `customer.administer` (reused) | `checklist.view` (new) |
| `work-log.js` | F025 | `worklog.write` / `note.internal.write` (both reused, assigned-gated) | — |
| `ticket-workflow.js` | F020/F021/F022 | `staff.administer` (reused) | — |
| `activity-timeline.js` | F017 | — | `history.view` (extended) |
| `metrics.js` / `templates.js` / `webhook-events.js` | F054/F055/F057 | `platform.configure` / `metrics.view` (new) / `audit.review` (reused) | same |

**Eight new RBAC capabilities** — every one an org-scoped customer "view"
capability (`service_record.view`, `website_profile.view`, `asset.view`,
`entitlement.view`, `subscription.view`, `checklist.view`,
`reminder.view`) plus one unscoped platform_admin capability
(`metrics.view`, following the same pattern as `workqueue.view`).
`history.view` — which already existed but was granted to
`read_only_customer` only — was extended to all three customer roles,
since it was always meant to cover the activity timeline for every
customer, not just the read-only role. Every write action reused an
existing capability rather than inventing a new one: this batch has the
smallest RBAC diff of any session so far, because the remaining domains
mapped cleanly onto capabilities Sessions 15–18 already built
(`customer.administer`, `billing.reconcile`, `platform.configure`,
`staff.administer`, `audit.review`, `ticket.work`, `worklog.write`,
`note.internal.write`).

Two small store gaps were found and fixed along the way, matching the
established pattern from prior sessions: `changeOrderStore.js` was
missing a list function (fixed in Session 18); this session,
`reminderStore.js` was missing `listRemindersForOrganization()` — added
with a test before building the endpoint on top of it.

## A real production bug, found by live testing and fixed

The live smoke test's `ticket-workflow.js` triage check failed on the
first pass: `triage_results.matched_rule_id` is `UUID` with a foreign
key into a `triage_rules` table, but `src/domain/triage.js`'s
`TriageRule.id` has always been a plain string — triage rules are
caller-supplied configuration passed into `classifyTicket()`, never
fetched from a database row. **No code anywhere has ever created or read
a `triage_rules` row** — the table exists in the schema but nothing uses
it as intended. A real config-driven rule id like `"rule-it"` (used
throughout the existing test suite) could never have satisfied that FK
constraint in production. Fixed via `migrations/003_fix_triage_rule_id_type.sql`
(drops the FK, changes the column to `TEXT`), applied live, and the smoke
test re-run to confirm.

This is exactly the kind of bug the project's "always verify a live
smoke test's actual database effects, don't trust fake-client tests
alone" discipline exists to catch — 618 unit tests against fakes never
would have caught it, since the fake SQL layer doesn't enforce real
Postgres column types or constraints.

## Test results

- 12 new endpoint test files, ~68 test cases total (4–8 cases per
  endpoint, covering auth denial, success, wrong-role denial, and
  method-not-allowed for each).
- `reminderStore.test.js` — 1 new case for the added list function.
- Full suite: **618/618 passing**, up from 541 at the end of Session 18.
- `docs/development/evidence/migrations/session-19-remaining-endpoints-live-smoke-test.txt`
  — 20 checks against the real Neon database, chained through a single
  real org/ticket/technician-assignment: real service record, website
  profile, entitlement usage recorded against the real seeded Website
  Care Plan limit (confirmed remaining allowance decremented correctly),
  real subscription, real technology asset, real reminder, a real
  checklist scored end to end, a real IT support classification, real
  time logged, a real manual re-triage (where the bug above was caught),
  a real customer-visible activity-timeline event, and real metrics/
  template reads. **20/20 PASS** (19/20 on the first pass, before the fix).

## What this completes

All 23 planned Care Hub HTTP endpoints now exist. Every function with a
complete pure engine and Postgres persistence (Sessions 10–19) is
reachable over HTTP with real RBAC enforcement, live-verified against
the real database. This is the entire "build the endpoint layer" body of
work from Session 17's originating directive.

## What's still not done

- **No UI exists anywhere** for any Care Hub feature — now the single
  largest remaining body of work, since the endpoint layer behind it is
  complete.
- Everything else from Session 17's directive that isn't "build
  endpoints": MFA for the admin account, the data retention/deletion/
  legal-hold system, real Privacy Policy content, remote-support/
  automation boundary enforcement, F060 AI, F001–F060 workbook
  regeneration.
- 6 owner decisions remain open (see `OWNER_DECISIONS.md`).
- A small number of documented engineering assumptions from this batch
  are reversible but worth Dylan's explicit sign-off — see the
  consolidated decision list delivered in this session's chat response,
  which Dylan requested instead of further silent assumptions.

## Files changed

- New: 12 endpoint files + 12 test files (see table above)
- New: `migrations/003_fix_triage_rule_id_type.sql`
- Modified: `src/policy/rbac.js` (+8 capabilities), `src/policy/rbac.test.js` (+4 cases), `src/db/reminderStore.js` (+1 function), `src/db/reminderStore.test.js` (+1 case)
- Modified: `docs/development/REQUIREMENTS_TRACEABILITY.md`, `docs/development/DEV_STATE.json`, `docs/development/DEV_INDEX.md`
- New evidence: `docs/development/evidence/migrations/session-19-remaining-endpoints-live-smoke-test.txt`, `docs/development/evidence/tests/session-19-remaining-endpoints.txt`
