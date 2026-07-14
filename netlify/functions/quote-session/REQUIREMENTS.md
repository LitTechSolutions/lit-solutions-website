# `quote-session` — System Requirements

## 1. Overview & Goal

Server-side save/resume for an in-progress Website Designer session.
Today, closing the browser tab mid-flow (package chosen, features
checked, maybe even the quick-quote form half-filled) loses everything —
there is no persistence beyond the current page's in-memory JS `state`
object. This is the "cart abandonment" gap of the whole site: e-commerce
research consistently shows recoverable-session flows meaningfully lift
completion, and the Website Designer is functionally a cart.

Business goal: recover demand that's currently lost silently — visitors
who get interrupted, want to think it over, or are comparing quotes
across devices.

## 2. Actors

- **Prospective customer**, mid-Website-Designer-session, on any device.
- **Same customer, later** — possibly a different device/browser (e.g.
  they started on their phone during a break, want to finish on a
  desktop) — this is the specific case a pure-`localStorage` approach
  cannot cover, and the reason this belongs in `netlify/functions` at all
  rather than being purely client-side.

## 3. Functional Requirements

1. As soon as a package is selected (Step 1 → Step 2 transition in
   `website-designer.js`), the client silently creates a session record
   server-side and receives a short session id.
2. On every meaningful state change thereafter (feature toggle, business
   name entered, heroes-discount checkbox, moving between steps), the
   client sends a lightweight debounced PATCH updating the stored state —
   this should be cheap and frequent enough that closing the tab at any
   point loses nothing.
3. The session id is written to `localStorage` immediately (so returning
   in the *same* browser "just works" with zero friction, no email/link
   needed) AND is included as a `?resume=<id>` query param usable from any
   device if the visitor asks to have a resume link emailed to them (an
   optional, explicit action — "email me a link to finish this later").
4. On page load, `website-designer.js` checks for a resume id (query
   param takes priority over `localStorage`, so an emailed link always
   wins over local state) and, if found and not expired, restores
   package/features/business name/heroes-discount and jumps to the
   correct step — this replaces Step 1 entirely for a returning visitor,
   dropping them back where they left off.
5. Sessions expire after a fixed window (e.g. 14 days) — this is a
   convenience feature, not permanent storage; a stale abandoned session
   past that point should just start fresh rather than accumulate
   indefinitely.
6. Once a quick-quote or full-brief submission actually completes (see
   `website-designer.js`'s existing submit handlers), the session record
   is marked `completed` so it's excluded from any future resume checks
   and from the abandoned-session segment used by `lead-followup`.

## 4. API Contract

`POST /.netlify/functions/quote-session` — create
```json
{ "package": "starter" }
```
→ `{ "sessionId": "QS-<id>" }`

`PATCH /.netlify/functions/quote-session` — update (called frequently,
debounced client-side to ~1/second max)
```json
{ "sessionId": "QS-...", "state": { "package": "...", "businessName": "...", "optionalSelected": [...], "premiumSelected": [...], "heroesDiscount": false, "currentStep": "2" } }
```
→ `204 No Content`

`GET /.netlify/functions/quote-session?id=QS-...` — resume
→ `{ "state": {...}, "expired": false }` or `404` if unknown/expired.

`POST /.netlify/functions/quote-session` — action `email-resume-link`
```json
{ "sessionId": "QS-...", "email": "customer@example.com" }
```
→ sends an email with a `website-designer.html?resume=QS-...` link;
`204` on success.

## 5. Data Model

New blob store: **`quote_sessions`** — key = session id
(`QS-<timestamp base36>-<random hex>`, matching the existing id
convention).

```
{
  id, state: { package, businessName, optionalSelected, premiumSelected,
               heroesDiscount, currentStep },
  status: "active" | "completed" | "expired",
  createdAt, lastUpdatedAt, expiresAt,
  emailedTo: string | null   // if a resume link was ever requested
}
```

## 6. Business Rules & Validation

- No PII is required to create a session (package/feature selections
  only) — an email is only attached if the visitor explicitly asks for a
  resume link, keeping this feature low-friction and privacy-respecting
  by default.
- `PATCH` payload size should be capped (e.g., reject anything over ~10KB)
  since this is an unauthenticated, frequently-called endpoint — a
  reasonable state object is a few hundred bytes; anything wildly larger
  suggests abuse.
- Debounce on the client (not just documented, actually implemented in
  `website-designer.js`) to avoid hammering the function on every single
  checkbox click — batch rapid changes into one PATCH after a short quiet
  period (e.g. 800ms).

## 7. Integration Points

- `js/website-designer.js` — this is almost entirely a client-side
  integration: the existing `state` object gains a `sessionId` field, a
  debounced sync-to-server call fires from the existing
  `updatePriceAndBreakdown()`/`onFeatureToggle()` hooks (already the
  central "something changed" chokepoint in that file), and page-load
  logic gains a resume-check step before `loadCatalog()` normally runs.
- `_lib/email.js` for the optional resume-link email.
- Feeds `lead-followup`: a session that's been inactive for N hours/days
  without completing is exactly the "abandoned" segment that automation
  should target — but note this is a *pre-contact-info* abandonment
  signal (no email captured unless resume-link was requested), so most
  abandoned quote-sessions can't actually be emailed; this feature's real
  value is same-device/same-visit recovery, with cross-device resume as
  a secondary, opt-in bonus.

## 8. Error Handling

- Expired/unknown resume id: silently fall through to a normal fresh
  Step 1 (never show a customer-facing error for a stale bookmark/link —
  just start over).
- PATCH failures (network blip): fail silently and retry on the next
  debounced tick — this is best-effort persistence, not a critical write
  the user should ever be blocked on.

## 9. Security & Privacy Considerations

- Session ids should be unguessable (the existing random-hex-suffix id
  pattern used elsewhere in this codebase is sufficient) since anyone
  with a session id can view/resume that session's selections — low
  sensitivity data (no PII in the base case), but still worth using a
  non-sequential id.
- Rate-limit `email-resume-link` specifically (reuse `rateLimited()`)
  since it's the one action in this function that sends unsolicited
  email and could be abused to spam an arbitrary address.

## 10. Non-Functional Requirements

- Must not introduce perceptible latency to the Website Designer's
  interactive feel — all sync calls are fire-and-forget from the
  customer's perspective (no loading state tied to them).
- 14-day expiry (or whatever's chosen) should be enforced by a check at
  read-time (`GET`) rather than requiring a separate cleanup job — Netlify
  Blobs has no native TTL, so expired-but-not-yet-deleted records are
  fine to leave in place and just treat as `404` once past `expiresAt`.

## 11. Open Questions for Dylan

- Is cross-device resume (the emailed-link case) actually valuable
  enough to build, or is same-device `localStorage`-only resume (a much
  smaller, purely-client-side feature) sufficient? The server-side
  version is meaningfully more work for a feature that may see light use
  — worth deciding scope before building.
