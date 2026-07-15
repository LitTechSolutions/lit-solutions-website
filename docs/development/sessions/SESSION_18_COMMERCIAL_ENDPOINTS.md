# Session 18 — The Full Commercial Flow, Live Over HTTP

## Summary

Dylan said "continue" after Session 17's report. Following the priority
order from Session 17's originating directive (customer-facing endpoints
next, after registration), this session built the three endpoints that
together form the entire "quote a job, get it approved, get paid" flow:
`scope-of-work.js` (F026), `change-orders.js` (F027), and
`payment-requests.js` (F028). All three were live-verified end to end in
one continuous chain against the real Neon database.

## What was built

### `netlify/functions/scope-of-work.js`

`POST` drafts the initial (version 1) scope for a ticket; `PATCH` creates
the next version; `GET` lists all versions. Creation/versioning is
technician-only, gated by the same per-resource `assigned` fact
`tickets.js` already established (Session 15) — a technician can only
draft a scope for a ticket they're actually assigned to, verified via
`getAssignedTechnician()`, never a client-supplied claim. Viewing is
available to all three customer roles plus technician.

### `netlify/functions/change-orders.js`

`POST` creates a change order against an existing scope; `GET` fetches
one or lists all for an org. `changeOrderStore.createChangeOrder()`
already pairs every change order with a real `ApprovalRequest` (Session
11 design, unchanged) — this endpoint doesn't touch approval logic at
all, it only authors the change order record. **A real gap was found and
fixed**: `changeOrderStore.js` had no `listChangeOrdersForOrganization()`
— every other store in this codebase has a list function; this one
didn't. Added it, with a test, before building the endpoint on top of it.

### `netlify/functions/payment-requests.js`

`POST` computes and persists a payment schedule (via the existing
`paymentSchedule.js` engine from Session 14) for a priced piece of work;
`PATCH` transitions a payment request's status; `GET` lists requests for
a subject. Creation and transitions are `platform_admin`-only, reusing
the existing `billing.reconcile` capability rather than inventing a new
one — billing is a platform/admin concern, not technician or org_owner
work, and `billing.reconcile` already existed for exactly this.

## Three new, honest rbac.js capabilities

Following the pattern established in Sessions 16–17: add a capability
only where nothing existing actually fits, never approximate.

- **`scope.create`/`scope.view`** — technician (assigned-scoped) drafts
  and all customer roles + technician view.
- **`change_order.create`/`change_order.view`** — same shape.
- **`payment.view`** — all three customer roles, deliberately **not**
  granted to technician (billing isn't a technician concern) or
  `platform_admin` beyond the existing `billing.reconcile` it already had
  for the write side.

All six were added to `ORG_SCOPED_ACTIONS` alongside the roles that need
them (except where an existing action already covered the concern), and
all are covered by `rbac.test.js`'s regression guard requiring every
technician/customer-role capability to be properly scoped — the same
guard that's caught bad designs in every prior session.

## A known, honest limitation carried forward

`change-orders.js`'s `GET` for a single `changeOrderId` cannot currently
authorize a technician — same limitation `tickets.js`'s `GET` already
has (Session 15): the org-scope check for technician needs an `assigned`
fact, and resolving that would require fetching the change order's scope
and ticket before the auth check even runs. Left as a known follow-up
(customer roles are unaffected) rather than worked around with a
fabricated `assigned: true`.

## Test results

- `scope-of-work.test.js` — 9 cases
- `change-orders.test.js` — 10 cases, plus `changeOrderStore.test.js`'s
  new list-function case
- `payment-requests.test.js` — 10 cases
- `rbac.test.js` — 7 new cases
- Full suite: **541/541 passing**, up from 504 at the end of Session 17.
- `docs/development/evidence/migrations/session-18-commercial-endpoints-live-smoke-test.txt`
  — 12 checks against the real Neon database, chained end to end: created
  a real organization and ticket, assigned a real technician, drafted a
  real scope of work as that technician (denied for a customer), drafted
  a real change order against that scope with its real paired approval,
  computed a real $500+ deposit/balance schedule as `platform_admin`
  (denied for a technician), and transitioned a real payment request to
  `paid` with a provider reference. **12/12 PASS.**

## What's still not done

- **13 more endpoints** for the rest of the persistence layer (activity
  events, entitlements, subscriptions, technology assets, backups,
  reminders, IT support classification, checklists, metrics, templates,
  webhook events).
- Everything else from Session 17's originating directive remains
  unstarted: MFA for administrators, the retention/deletion/legal-hold
  system, Privacy Policy content, remote-support/automation boundaries,
  F060 AI, and F001–F060 workbook regeneration. Approved defaults for all
  of these remain recorded in `DEV_STATE.json`.

## Files changed

- New: `netlify/functions/scope-of-work.js` (+test), `netlify/functions/change-orders.js` (+test), `netlify/functions/payment-requests.js` (+test)
- Modified: `src/db/changeOrderStore.js` (+`listChangeOrdersForOrganization`, +test), `src/policy/rbac.js` (+6 capabilities), `src/policy/rbac.test.js` (+7 cases)
- Modified: `docs/development/REQUIREMENTS_TRACEABILITY.md`, `docs/development/DEV_STATE.json`, `docs/development/DEV_INDEX.md`
- New evidence: `docs/development/evidence/migrations/session-18-commercial-endpoints-live-smoke-test.txt`, `docs/development/evidence/tests/session-18-commercial-endpoints.txt`
