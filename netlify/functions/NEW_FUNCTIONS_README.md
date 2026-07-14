# New functions — scaffolded from the business/UX review (2026-07-14)

Nine folders below, each holding a `REQUIREMENTS.md` with full system
requirements. Nothing here is implemented yet — these are specs to build
from. Each doc follows the same structure: overview, actors, functional
requirements, API contract, data model, business rules, integration
points, error handling, security, non-functional requirements, and (now)
a **Decisions** section recording Dylan's answers to every open question
as of 2026-07-14 — see each doc's final section for specifics.

**Two of the nine turned out not to be "backend function" work once
scoped:**
- **`quote-session`** — Dylan chose same-device-only resume, which needs
  no server component at all; it's pure `localStorage` inside
  `js/website-designer.js`. The folder is kept for the spec record, but
  there's no `.js` entry point to build here.
- **`quote-acceptance`** — split into **Phase 1** (a same-day admin-panel
  tracking companion to Dylan's existing manual DocuSign process — real
  value, no new cost) and **Phase 2** (true DocuSign API integration,
  which requires Dylan to upgrade his DocuSign plan first — a cost
  decision to make before that phase is built, not an engineering
  decision).

## Suggested build order

1. **`leads-dashboard`** — the connective tissue; several other functions
   plug into it, and it's the one thing that makes all the others
   actually usable day-to-day.
2. **`project-status`** — small, high-value, extends existing `leads`
   records with a status field. Build alongside `leads-dashboard`.
3. **`quote-acceptance` Phase 1 only** — genuinely tiny (two admin
   actions + a status-advance hook) now that it's de-scoped from the
   original DocuSign-API design. Very high value-to-effort ratio; do
   this right after `leads-dashboard`/`project-status` exist.
4. **`website-audit`** — the top-of-funnel lead magnet, clearest
   standalone ROI, no dependency on the others.
5. **`quote-session`** — client-side only now; a focused, self-contained
   pass on `js/website-designer.js` whenever convenient.
6. **`lead-followup`** — cadence and running-unattended are both decided;
   just needs real email copy written before it can ship. Benefits from
   `leads-dashboard` existing to surface follow-up state.
7. **`booking-scheduler`** — bigger than originally scoped now that real
   Google Calendar sync is confirmed in scope (OAuth setup, Freebusy
   API, event creation — see that doc's §4a). Budget more time for this
   one than the others.
8. **`project-scaffold-generator`** — depends on `full`-stage leads
   existing to act on; natural to build once `leads-dashboard` gives you
   a place to trigger it from.
9. **`referral-program`** — reward terms are settled ($50 / 10%), so this
   is ready to build whenever it's prioritized; no remaining blockers.
10. **`quote-acceptance` Phase 2** — hold until Dylan decides whether the
    DocuSign API plan upgrade is worth it (see that doc's §11). Not
    ready to build regardless of engineering priority until that call is
    made.

## Cross-cutting things every one of these assumes

- All new stores follow the existing `_lib/blob_store.js` pattern
  (`getJSON`/`setJSON`/`store` — see `website-designer.js` for the
  reference usage).
- All admin-only endpoints follow the existing role check pattern from
  `content.js` (`session.role !== "admin" && session.role !== "staff"`).
- All emails go through the existing `_lib/email.js` `sendEmail()` —
  silently no-ops if Resend isn't configured, so nothing breaks in an
  environment without email set up yet.
- All rate-limited public endpoints reuse `_lib/auth_utils.js`'s
  `rateLimited()`.
- Every id follows the existing `<PREFIX>-<timestamp base36>-<random
  hex>` convention already used for `WD-...` lead ids.

## Still-open items across the batch (not blocking, but worth tracking)

- `booking-scheduler`: exact weekly availability hours (weekends
  confirmed in scope, specific times still needed) and confirmation of
  whether Dylan's Google account is personal Gmail or Google Workspace
  (changes the OAuth setup approach).
- `quote-acceptance` Phase 2: whether payment happens through DocuSign
  Payments or a separate processor — determines if a second
  payment-integration is needed alongside the DocuSign API work.
- `lead-followup`: the actual subject lines/email copy for both
  follow-up steps (timing is final; content is not written yet).
