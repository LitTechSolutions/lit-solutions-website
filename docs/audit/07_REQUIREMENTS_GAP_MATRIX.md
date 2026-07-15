# Session 7 — Requirements Gap Matrix

Scope: classify the 9 spec-only candidate functions
(`netlify/functions/*/REQUIREMENTS.md`, no code yet) against what exists
today, their real business value, and their build risk. No code changes
were made in this session — this is a classification exercise, per
`00_AUDIT_CONTROL.md`. Read for this session: `00_AUDIT_CONTROL.md`,
`AUDIT_STATE.json`, Sessions 1–6's docs, `NEW_FUNCTIONS_README.md`, and
all 9 `REQUIREMENTS.md` files in full.

## 1. Current state, confirmed

All 9 folders are spec-only — no `.js` entry point exists for any of
them, confirmed by directory listing (each contains only
`REQUIREMENTS.md`). Every spec carries a "Decisions (resolved
2026-07-14)" section recording Dylan's actual answers to every open
question the original review raised — these are unusually
build-ready specs, not rough drafts. `quote-session` has already been
scoped down to "no backend function needed at all" (pure `localStorage`
in `js/website-designer.js`) and correctly excluded from the function
count elsewhere in this codebase's own documentation.

## 2. Gap matrix

| Function | Business value | Build risk | Blocking dependency | Ready to build? |
|---|---|---|---|---|
| `leads-dashboard` | **High** — connective tissue; makes every other lead-related feature (existing and planned) actually usable day to day | Medium — no new store, but is explicitly "the most sensitive aggregation of customer data anywhere in this codebase" per its own §9; access control must be correct from the first line of code | `website-designer.js` needs one small change (stamp a `source` field) | **Yes** — recommended first, per its own spec and `NEW_FUNCTIONS_README.md` |
| `project-status` | **High** — direct customer-facing value (visible pipeline), reduces "just checking in" calls | Medium — the lead-to-account email-matching step **must** require a verified account email (already correctly called out as a hard requirement in its own §9); this is the one place a shortcut would create a real cross-customer data leak | None blocking — natural to build alongside `leads-dashboard` | **Yes** |
| `quote-acceptance` (Phase 1) | High relative to effort — closes a real workflow gap (no way to reflect "sent"/"signed & paid" anywhere in the system today) for a few hours of work | Low — two buttons in an existing admin view, no new external integration | None | **Yes** |
| `quote-acceptance` (Phase 2) | Medium-High, but the true end goal (full automation) | Medium — DocuSign Connect webhooks require signature verification (well-specified already); unresolved whether a second payment-processor integration is also needed | **Owner-Decision**: DocuSign API plan upgrade has a real monthly cost Dylan hasn't yet decided is worth it (F031-adjacent) | **No** — not ready until that cost decision is made |
| `website-audit` | **High** — distinct top-of-funnel lead magnet, no dependency on anything else in this batch | **High** — the only public, unauthenticated endpoint in this batch that fetches an arbitrary user-supplied URL server-side; its own spec correctly marks SSRF protection as "mandatory, not a nice-to-have" (§6). This is the riskiest function in the batch to get wrong, not because the spec is unclear, but because the failure mode (an internal-network-reachable Netlify Function) is severe if the mandatory check is skipped or implemented loosely | None | **Yes**, but implementation should get the most security scrutiny of anything in this batch |
| `quote-session` | Medium — recovers some abandoned-session demand | **Very low** — pure client-side `localStorage`, no backend, no new store | None | **Yes**, trivial, can be done anytime |
| `lead-followup` | Medium-High — recovers already-warm leads (contact info + a seen price) that currently go cold with no automated re-engagement | Medium — first scheduled function in this codebase (new pattern to establish correctly), and CAN-SPAM/unsubscribe compliance is a hard legal requirement, not optional | **Content, not engineering**: the actual follow-up email copy hasn't been written yet — timing/cadence is fully resolved, subject lines/body text are not | **Partially** — the engineering is ready to build; the sequence can't ship without real copy first |
| `booking-scheduler` | **High** — shortens time-to-kickoff on every completed lead, compounds with `project-scaffold-generator` | **Highest in this batch** — the only function requiring a real external OAuth/service-account integration (Google Calendar API, domain-wide delegation), turning what looked like a simple scheduling widget into real infrastructure work | One manual, non-engineering prerequisite: Dylan must grant domain-wide delegation to the service account in his Google Workspace Admin console before end-to-end testing is even possible | **Blocked on that one manual step**, otherwise fully specified |
| `project-scaffold-generator` | Medium-High, but the value accrues to Dylan's own delivery speed rather than directly to lead generation or customer experience | Low-Medium — bundles a customer's full brief plus any uploaded logo/photos into an admin-only zip; sensitive but no external integration | Practically wants `leads-dashboard`'s lead-detail view to trigger from (natural to build together, not a hard blocker) | **Yes**, ideally alongside `leads-dashboard` |
| `referral-program` | Medium — cheap incremental volume in a geographically concentrated service area; explicitly one of the lowest-effort items in the whole original review | Low — manual payout confirmation in v1 (matches the same manual-confirmation pattern `quote-acceptance` Phase 1 already establishes), no payment-webhook automation needed | None | **Yes**, whenever prioritized |

## 3. F033 — sharpened by this session's read of the batch

F033 asks whether every account-system feature earns its complexity/
security surface, and whether registration should stay open-public. This
session's read of the 9 specs makes that question more pressing, not
less: **`project-status`** (a new "My Projects" view) and
**`referral-program`** (a new "Refer a friend" view) both add further
surface area to `myaccount.html`'s account system on top of the
Documents/Messages/Favorites/Notifications that already exist — all
four of which F033 already questions the necessity of. Before building
either of these two, it's worth Dylan settling F033's underlying
question (is the growing account-system surface worth its own
complexity and security exposure, and should registration remain fully
open to the public) rather than adding two more account-gated views on
top of an already-open question. No change to F033's status/severity —
this is added context for whoever picks it up.

## 4. Recommended build order (confirms `NEW_FUNCTIONS_README.md`'s existing order, with audit-informed reasoning)

This session's independent read of all 9 specs arrives at the same
order `NEW_FUNCTIONS_README.md` already recommends, which is worth
noting as a confirmation rather than a coincidence — both analyses are
weighing the same value/risk/dependency facts:

1. `leads-dashboard` + `project-status` (build together — both touch the
   same lead-detail surface)
2. `quote-acceptance` Phase 1 (tiny, high value-to-effort, ready now)
3. `website-audit` (high standalone value, but budget real security
   review time for its mandatory SSRF protection — this is not a
   function to rush)
4. `quote-session` (trivial, client-only, fit in wherever convenient)
5. `lead-followup` (engineering can start now; blocked from shipping
   until real email copy exists)
6. `project-scaffold-generator` (natural once `leads-dashboard` exists)
7. `referral-program` (ready whenever prioritized, no blockers)
8. `booking-scheduler` (fully specified, but budget the most calendar
   time of anything in this batch, and it can't be tested end-to-end
   until Dylan completes the one Workspace Admin console step)
9. `quote-acceptance` Phase 2 (hold until the DocuSign plan-upgrade cost
   decision is made — not an engineering-readiness question)

## 5. Findings ledger

No new finding IDs from this session — this was a classification
exercise over already-mature specs, not a source-code read. F033 is
referenced with added context (§3) but not modified.

## 6. Not yet verified (flagged for a later session)

- None of these 9 functions have been built, so there is nothing yet to
  verify functionally. Once any of them is implemented, it should get
  the same security/quality scrutiny as the 12 existing real handlers
  (Sessions 3/4 patterns) before being considered audited.
