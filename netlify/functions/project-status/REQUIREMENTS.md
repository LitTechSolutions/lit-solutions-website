# `project-status` — System Requirements

## 1. Overview & Goal

Extends the existing customer account portal (`myaccount.html`, which
already has Documents/Messages/Favorites/Notifications) with a visible
project pipeline stage — "Quote received → In review → Contract sent →
In progress → Delivered" — so a customer who's submitted a lead has
somewhere to check in, instead of only finding out anything via email or
by calling. Business goal: this directly improves the experience for
everyone the new quick-quote flow (`website-designer` stage="quick"/"full")
now captures, and reduces "just checking in on my project" phone calls.

## 2. Actors

- **Customer** with an account (existing `myaccount.html` auth) — views
  their own project(s) status, read-only.
- **Dylan/staff** — advances a project's status as work actually
  progresses, via `admin.html`.

## 3. Functional Requirements

1. Every lead record created by `website-designer.js` (stage `quick` or
   `full`) gets a `status` field, defaulting to `"quote_received"`.
2. Defined status values, in order: `quote_received` → `in_review` →
   `contract_sent` → `in_progress` → `delivered`. (A `cancelled` state
   also exists, reachable from any prior state, for leads that don't move
   forward — hidden from the customer-facing stepper, shown only in the
   admin lead view.)
3. Staff can advance (or, if made in error, move back) a lead's status
   from a new panel in `admin.html`, alongside the existing lead detail
   (reuses the same `leads` store already populated by
   `website-designer.js` — no new store needed here, just a new field on
   existing records).
4. Advancing status **always** sends the customer a notification (reusing
   the existing `notifications.js` function and in-app notification
   system already built for the account portal) — e.g. "Your project
   moved to 'In Progress'" — with an optional custom note from staff
   attached to the status change ("Contract sent to your email — check
   your inbox"). Dylan chose to notify on every change rather than only
   at major milestones, so `notifyCustomer` is not a per-change toggle in
   the admin UI — it fires automatically every time.
5. Customer-facing: `myaccount.html` gains a "My Projects" view listing
   each lead tied to their account (matched by email — see §6) with a
   visual stepper showing current stage, and the most recent staff note
   if any.
6. A lead is only visible to a customer if their **verified** account
   email matches the lead's `email` field — a lead submitted before the
   customer ever created an account should retroactively appear once they
   sign up with the matching, verified address.

## 4. API Contract

`GET /.netlify/functions/project-status` (authenticated, customer session)
→ `{ "projects": [{ "id": "WD-...", "package": "...", "businessName": "...", "status": "in_progress", "statusHistory": [...], "lastNote": "..." }] }`
— filtered server-side to leads matching the caller's session email.

`POST /.netlify/functions/project-status` (admin/staff only)
```json
{ "leadId": "WD-...", "newStatus": "contract_sent", "note": "Contract sent to your email -- check your inbox." }
```
→ `200 { "ok": true }`; `403` if not staff; `400` if `newStatus` isn't a
recognized value or the transition is invalid (see §6). Notification to
the customer is automatic on every successful call — there is no
`notifyCustomer` flag to suppress it (see §3.4).

## 5. Data Model

No new store — extends the existing **`leads`** records (written by
`website-designer.js`) with:
```
{
  ...existing fields...,
  status: "quote_received" | "in_review" | "contract_sent" | "in_progress" | "delivered" | "cancelled",
  statusHistory: [{ status, note, changedAt, changedBy }]
}
```
`website-designer.js`'s `handleQuickSubmission`/`handleFullSubmission`
need one additional line each initializing `status: "quote_received"` and
an empty `statusHistory` on record creation.

## 6. Business Rules & Validation

- Valid forward transitions only enforced loosely — staff should be able
  to correct a mistaken status change (move backward), but jumping
  straight to `delivered` from `quote_received` should at least prompt a
  confirmation in the UI (not a hard server-side block — Dylan knows his
  own pipeline better than a rigid state machine would).
- `cancelled` is reachable from any non-terminal state and is terminal
  (no further changes) other than an explicit "reopen" action, which
  resets to `quote_received`.
- A `full`-stage lead and its originating `quick`-stage lead (linked via
  `quickLeadId`, per the `website-designer` v3.1.0 change) should be
  treated as **one project** in the customer-facing view — don't show a
  customer two separate "projects" for what was one conversation. Fold
  the quick lead's existence into the full lead's card once both exist
  (use whichever record has `completedFull: true`/is newest as the
  canonical one to display).

## 7. Integration Points

- `js/website-designer.js` — no changes needed beyond the backend
  initializing `status` on write (§5).
- `netlify/functions/website-designer.js` — add `status`/`statusHistory`
  initialization to both `handleQuickSubmission` and
  `handleFullSubmission`.
- `netlify/functions/notifications.js` — reuse for the "status changed"
  in-app notification, following whatever pattern that function already
  uses for other notification types.
- `myaccount.html` — new "My Projects" view added to that page's existing
  `views.X` router pattern (same pattern as Documents/Messages).
- `admin.html` — extend the lead-viewing UI (currently leads are only
  readable by pulling Netlify Blobs directly per the business review's
  own finding — this function is a prerequisite for `leads-dashboard`,
  or the two could be built together).

## 8. Error Handling

- Customer has no matching leads: show an empty state ("No projects yet —
  get a quote to get started" with a CTA to Website Designer), not an
  error.
- Invalid `newStatus` value from staff UI: `400` with the list of valid
  values, never silently coerce to a default.

## 9. Security & Privacy Considerations

- Matching leads to a customer account **by email** is the one place this
  feature needs care: only match against a **verified** account email
  (reuse the existing email-verification flag already present on user
  accounts per `account.js`), otherwise anyone could create an account
  with someone else's email and see their project details. This is a
  hard requirement, not a nice-to-have.
- Status-change notes are visible to the customer verbatim — staff UI
  should make clear that anything typed in the note field is
  customer-facing.

## 10. Non-Functional Requirements

- Low write volume (status changes happen a handful of times per
  project, not per request) — no special performance considerations.

## 11. Decisions (resolved 2026-07-14)

- **Notify on every status change** — no per-change suppression, see §3.4.
- **`cancelled` leads are always retained**, never deleted — just hidden
  from the customer-facing "My Projects" view. Matches how the rest of
  this codebase treats records as durable. No "delete" action needed in
  the admin UI for this at all.
