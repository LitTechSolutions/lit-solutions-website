# `leads-dashboard` — System Requirements

## 1. Overview & Goal

A backend API (paired with a new Care Hub capability) that lists, filters,
and searches every lead across sources and stages, instead of requiring
Dylan to dig through email or open Netlify Blobs records one at a time.
This is the connective-tissue function: `website-designer`, `website-audit`,
`project-status`, `booking-scheduler`, and `lead-followup` all read/write
`leads` records, and this is what turns that into one place to actually
look at the pipeline.

Business goal: visibility into the pipeline directly supports "sell more
websites" by making it obvious which warm leads need a follow-up call
today, rather than that information being scattered across inbox
messages.

## 2. Actors

- **Dylan/staff** only — this is purely an internal tool, no
  customer-facing surface at all.

## 3. Functional Requirements

1. Lists all `leads` records, most recent first, with at-a-glance
   columns: business name, contact name, source (`website-designer` quick/
   full, `website-audit`, future sources), package/price if applicable,
   status (per `project-status`'s status field, once that exists),
   created date, and follow-up state (per `lead-followup`).
2. Filterable by: source, status, date range, and a free-text search
   across business/contact name and email.
3. Clicking into a lead shows the full record — everything currently
   only visible by opening the raw Blob record: full brief text (if
   `full` stage), selected features, notes, booking (if any), follow-up
   history.
4. From the detail view, staff can trigger the actions other functions
   in this batch expose: advance status (`project-status`), generate a
   scaffold (`project-scaffold-generator`, only for `full`-stage leads),
   mark `doNotFollowUp` (`lead-followup`), or jump to the linked
   booking (`booking-scheduler`).
5. A lead created via `website-designer`'s `quick` stage that later
   completes the `full` stage (linked via `quickLeadId`) should display
   as a single row/detail (same fold-together rule as `project-status`
   §6), not two separate entries.

## 4. API Contract

`GET /.netlify/functions/leads-dashboard?status=quote_received&source=website-designer&search=riverside&page=1`
(admin/staff only)
→
```json
{
  "leads": [
    { "id": "WD-...", "source": "website-designer", "stage": "full", "businessName": "...", "customerName": "...", "status": "in_review", "estimateTotal": 1299, "createdAt": ..., "hasFollowUpPending": false }
  ],
  "total": 42,
  "page": 1
}
```

`GET /.netlify/functions/leads-dashboard?id=WD-...` (admin/staff only)
→ full record as currently stored, plus any linked booking/follow-up
history joined in.

## 5. Data Model

No new store — this is a **read/aggregation layer** over the existing
`leads` store (and, once built, `bookings` from `booking-scheduler`). The
only new requirement on the underlying records is the `source` field
(§3.1) so multiple lead-generating functions can share one store cleanly
— `website-designer.js` should be updated to stamp `source:
"website-designer"` on every record it writes, and `website-audit`
should do the same with `source: "website-audit"` when built.

## 6. Business Rules & Validation

- Pagination is required from day one — even moderate lead volume over a
  few months will make an unpaginated list unwieldy; don't defer this to
  a "v2."
- Search should be case-insensitive substring match on business name,
  contact name, and email — simple `includes()`-style matching is
  sufficient at this scale, no need for a real search index.
- The quick/full folding rule (§3.5) needs a clear tie-break: display the
  `full` record's data (it's the more complete conversation) but note
  the earlier `quickLeadId` timestamp as "first contacted."

## 7. Integration Points

- Reads `leads` (written by `website-designer.js`, and eventually
  `website-audit`), `bookings` (from `booking-scheduler`), and the
  follow-up fields on `leads` (from `lead-followup`).
- The Care Hub — this is the natural home for a new "Leads" capability,
  likely the most-used part of the whole admin experience once built,
  following the existing `platform_admin`-gated route pattern
  (`navAccess.ts`/`RequireRoute`) already used for Site Content/Image
  Library/Customer Support
  Settings/Dashboard.
- Depends on `website-designer.js` being updated to write a `source`
  field (§5) — a small, low-risk change to make alongside building this.

## 8. Error Handling

- Unknown `id` on the detail-view query: `404`, clear "lead not found"
  state in the UI rather than a blank/broken page.
- Empty result set (no leads match current filters): explicit empty
  state distinguishing "no leads at all yet" from "no leads match these
  filters" (the second should suggest clearing filters).

## 9. Security & Privacy Considerations

- Admin/staff-only, same role-check pattern as `content.js` — this
  exposes every customer's contact info and business brief in one place,
  which is the most sensitive aggregation of customer data anywhere in
  this codebase. Treat access control here as the top priority of the
  whole function, not an afterthought.
- No customer-facing surface at all — do not expose any part of this API
  without the staff/admin session check.

## 10. Non-Functional Requirements

- As lead volume grows, listing "all leads matching a filter" by
  iterating Netlify Blobs' `list()` (the pattern already used in
  `content.js` for the admin slug-listing endpoint) is fine at hundreds
  of records; if volume grows into the thousands, revisit whether a
  different storage/indexing approach is needed — not a concern at
  today's scale.

## 11. Decisions (resolved 2026-07-14)

- **Confirmed: one shared list, labeled by source.** `website-audit`
  leads (once that function exists) appear alongside
  `website-designer`-sourced leads in the same list/filters, distinguished
  by the `source` field (§5) rather than a separate view — matches §6's
  existing design as written, no changes needed to this spec.
