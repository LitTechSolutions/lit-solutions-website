# New functions — scaffolded from the business/UX review (2026-07-14)

Nine folders below, each holding a `REQUIREMENTS.md` with full system
requirements. Nothing here is implemented yet — these are specs to build
from, scaffolded on request. Each doc follows the same structure: overview,
actors, functional requirements, API contract, data model, business rules,
integration points, error handling, security, non-functional requirements,
and open questions that need your input before/while building.

## Suggested build order

These aren't independent — building in roughly this order avoids rework:

1. **`leads-dashboard`** — the connective tissue. Nothing else here is
   very useful without a way to actually see the leads it's about, and
   several other functions plug into it.
2. **`project-status`** — small, high-value, extends existing `leads`
   records with a status field. Natural to build alongside
   `leads-dashboard`.
3. **`website-audit`** — the top-of-funnel lead magnet, and the item with
   the clearest standalone ROI. No dependency on the others.
4. **`quote-session`** — recovers lost demand in the existing Website
   Designer flow. No dependency on the others, but touches
   `js/website-designer.js` directly so it's worth doing as its own
   focused pass.
5. **`lead-followup`** — depends on `leads-dashboard` existing (to
   surface follow-up state) and benefits from `website-audit` existing
   (a second lead source to follow up on), but its core logic only
   needs the `leads` store.
6. **`booking-scheduler`** and **`project-scaffold-generator`** — both
   depend on a `full`-stage lead existing to act on; natural to build
   once `leads-dashboard` gives you a place to trigger them from.
7. **`referral-program`** and **`quote-acceptance`** — lowest urgency,
   both have open scope questions (reward terms; e-signature/payment
   scope) that need your input before they're ready to build regardless
   of engineering order.

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
