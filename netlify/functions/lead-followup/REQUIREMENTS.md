# `lead-followup` — System Requirements

## 1. Overview & Goal

Automated re-engagement for leads that stall partway through the funnel —
most notably the new segment the v3.1.0 quote-flow change just made
visible for the first time: customers who completed the **quick quote**
(so Dylan already has their contact info and consent) but never continued
to the full project-details brief. Right now nothing follows up with
these leads automatically.

Business goal: recover leads that are already warm (they saw a real
price and gave contact info) rather than letting them go cold from
inaction — directly targets a gap this session's own work just created
visibility into.

## 2. Actors

- **Lead** (quick-quote-only, or an audit-tool lead with email captured
  per `website-audit`) — receives one or more automated follow-up emails.
- **Dylan** — configures the follow-up sequence content/timing; can see
  which leads have been followed up with, and can mark a lead
  "do not follow up" at any time (e.g., they called and said no thanks).

## 3. Functional Requirements

1. Runs on a schedule (Netlify Scheduled Functions — this codebase has no
   existing scheduled function, so this is the first; configured via
   `netlify.toml`'s `[[scheduled functions]]` block or a `schedule` export,
   per Netlify's current convention at build time).
2. On each run, queries the `leads` store for records matching the
   "stalled" segment:
   - `stage: "quick"` and `completedFull` is not `true`, **and**
   - Created more than N hours ago (configurable; review suggested
     2-3 days) but less than a cutoff (e.g. 30 days — don't keep emailing
     someone a month later), **and**
   - Not already sent the maximum number of follow-ups, **and**
   - Not flagged `doNotFollowUp`.
3. For each matching lead, sends the next follow-up in a short, fixed
   sequence (e.g., step 1 at 3 days: a portfolio piece + friendly nudge;
   step 2 at 10 days: a different angle, e.g. an FAQ or the American
   Heroes/bundle discount if applicable; then stop) and records that the
   step was sent.
4. `website-audit` leads (once that function exists) get a **separate**
   sequence/track from quote leads, since the messaging is different
   (they haven't seen a price yet — the follow-up should invite them to
   the Website Designer, not ask them to "finish" anything).
5. Every automated email includes a real, working unsubscribe/opt-out
   link (see §9 — this is a compliance requirement, not optional) that
   sets `doNotFollowUp: true` without requiring login.
6. Dylan can see, per lead, whether/when follow-ups were sent (surfaced
   in `leads-dashboard`, not a separate UI).

## 4. API Contract

This function is primarily **scheduled**, not request-driven — its main
entry point has no customer-facing HTTP contract. It does need one
public, unauthenticated endpoint for the opt-out link:

`GET /.netlify/functions/lead-followup?action=unsubscribe&token=<signed>`
→ sets `doNotFollowUp: true` on the referenced lead, returns a plain
confirmation HTML page ("You won't hear from us again about this quote").
Token is a signed, single-use-per-lead value (reuse
`createSingleUseToken`/`verify` from `_lib/auth_utils.js`, scoped to the
lead id rather than a user id).

An optional admin-triggerable variant for manual runs during testing:
`POST /.netlify/functions/lead-followup` (admin/staff only) — `{ "dryRun": true }` runs the segment query and logs what *would* be sent
without actually sending, for safe verification before relying on the
schedule.

## 5. Data Model

Extends existing **`leads`** records with:
```
{
  ...existing fields...,
  doNotFollowUp: boolean,
  followUpsSent: [{ step: 1, sentAt: <timestamp> }]
}
```

Sequence content/timing itself lives in a config record (store `content`,
slug `followup-sequences`), editable via `admin.html`, so Dylan can tune
subject lines/timing/copy without a code deploy:
```
{
  quickQuoteOnly: [
    { afterHours: 72, subject: "...", htmlTemplate: "..." },
    { afterHours: 240, subject: "...", htmlTemplate: "..." }
  ],
  auditToolLead: [ ... ]
}
```

## 6. Business Rules & Validation

- **Never** re-send a step that's already been sent for a given lead
  (`followUpsSent` is the source of truth, checked before sending, not
  just before scheduling).
- Respect `doNotFollowUp` immediately and permanently once set — no
  "are you sure" override from the automation side.
- A lead that reaches `completedFull: true` (i.e., they came back and
  finished the brief on their own) should be excluded from the segment
  on the very next scheduled run — check this condition fresh each run,
  don't rely on a stale snapshot.

## 7. Integration Points

- Reads/writes the same `leads` store as `website-designer.js` (and,
  once built, `website-audit`).
- Reuses `_lib/email.js` (`sendEmail`) and `_lib/auth_utils.js`
  (`createSingleUseToken`, `verify`).
- Surfaces send history in `leads-dashboard` (see that spec) rather than
  duplicating a UI here.
- `admin.html` gains a small sequence-editor panel for
  `followup-sequences` content, following the existing generic
  single-record-editor pattern (same shape as the `referral-program` and
  `booking-scheduler` config records).

## 8. Error Handling

- Email send failure for one lead in a batch run must not abort the rest
  of the batch — process each lead independently, log failures, continue.
- Scheduled run failing entirely (e.g., a bug) should not silently retry
  forever — Netlify Scheduled Functions have their own retry/failure
  semantics; make sure the function is idempotent per-lead (checking
  `followUpsSent` before sending, per §6) so a partial re-run after a
  crash never double-sends.

## 9. Security & Privacy Considerations

- **CAN-SPAM / unsubscribe compliance is a hard requirement**, not a
  nice-to-have, the moment this sends any automated marketing-style
  email: every message needs a working, immediate opt-out (§3.5/§4), and
  the business's real postal address/identification in the footer if
  emails are being sent as bulk-ish marketing (worth checking current
  legal requirements for the jurisdiction at build time, not assumed here).
- Unsubscribe token scoped to a single lead id, not a general account
  token — clicking it should only ever be able to affect that one lead's
  `doNotFollowUp` flag.

## 10. Non-Functional Requirements

- This is the first scheduled function in the codebase — document the
  `netlify.toml` schedule syntax/setup clearly when built, since nothing
  in the existing codebase demonstrates this pattern yet.
- Batch size per run should be bounded (e.g., process at most 200 leads
  per invocation) to stay well within Netlify's function execution time
  limits as the lead volume grows.

## 11. Decisions (resolved 2026-07-14)

- **Cadence confirmed: 3 days, then 10 days, then stop** — matches the
  `afterHours: 72` / `afterHours: 240` placeholders in §5 exactly; those
  values are now final, not placeholder. Actual email *copy* (subject
  lines, body content) still needs to be written before this ships —
  the sequence config in §5 has the timing right but needs real text.
- **Comfortable running unattended once configured** — no mandatory
  review/approval gate before going live. The `dryRun: true` admin action
  in §4 is still worth keeping in the implementation (cheap to include,
  useful for verifying segment logic after any future change to the
  matching criteria in §3.2), just not required as a blocking step before
  this goes live for the first time.
