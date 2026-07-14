# `quote-session` — System Requirements

> **Decision (resolved 2026-07-14): same-device only.** Dylan chose the
> simpler scope over cross-device/emailed-link resume. As a result, this
> feature needs **no backend function at all** — it's pure `localStorage`
> persistence inside `js/website-designer.js`. This folder is kept as the
> spec record for that decision, but there is nothing to deploy under
> `netlify/functions/quote-session/` — do not build a `.js` entry point
> here.

## 1. Overview & Goal

Recovers the one clear "cart abandonment" gap in the current Website
Designer flow: closing the tab mid-session (package chosen, features
checked, quick-quote form half-filled) loses everything today, since
nothing persists beyond the page's in-memory JS `state` object.

Business goal: recover demand that's currently lost silently to
interruption (a phone call, closing the tab to think it over, an
accidental refresh) — without the added complexity of cross-device
resume, which Dylan decided isn't worth the extra scope for now.

## 2. Actors

- **Prospective customer**, mid-Website-Designer-session, same browser,
  same device, returning later (could be minutes or days later).

## 3. Functional Requirements

1. On every meaningful state change (package chosen, feature toggled,
   business name entered, heroes-discount checked, step changed), write
   the current `state` object to `localStorage` under a fixed key (e.g.
   `lts-wd-session`).
2. On page load, before `loadCatalog()` would normally wait for a
   package-selection click, check for a saved session:
   - If found and not expired (§3.4), restore `package`, `businessName`,
     `optionalSelected`, `premiumSelected`, `heroesDiscount`, and jump to
     the step the visitor was on.
   - If none found (first visit, or a previous session already
     completed/expired), behave exactly as today — start at Step 1.
3. Once a quick-quote or full-brief submission actually completes (the
   existing `showPanel('prompt')`/`showPanel('done')` transitions in
   `js/website-designer.js`), clear the saved session — a completed quote
   should never be "resumed" into a stale, already-submitted state.
4. Saved sessions expire after a fixed window (e.g. 14 days) — store a
   timestamp alongside the state and simply ignore/overwrite anything
   older than that on load, rather than resuming a very stale session.
5. No confirmation prompt needed to restore — silently resuming to the
   last state is the expected, low-friction behavior (equivalent to how
   a shopping cart persists without asking permission).

## 4. Implementation Notes (replaces API Contract / Data Model)

No API, no new blob store, no new Netlify Function. Everything lives in
`js/website-designer.js`:

```js
const SESSION_KEY = 'lts-wd-session';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    savedAt: Date.now(),
    package: state.package,
    businessName: businessNameEl.value,
    // ...selected features, heroesDiscount, currentStep
  }));
}

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const saved = JSON.parse(raw);
  if (Date.now() - saved.savedAt > SESSION_TTL_MS) { clearSession(); return null; }
  return saved;
}

function clearSession() { localStorage.removeItem(SESSION_KEY); }
```

Hook `saveSession()` into the same chokepoints already used for
recalculating price/preview (`updatePriceAndBreakdown()`,
`onFeatureToggle()`, `businessNameEl`'s `input` listener) — these already
fire on every relevant state change, so no new event wiring is needed
beyond calling `saveSession()` from inside them.

## 5. Business Rules & Validation

- Guard `JSON.parse` in a try/catch — a corrupted or manually-edited
  `localStorage` value should fall back to "no session found," never
  throw and break page load.
- Restoring feature selections needs to re-check them against the
  freshly-loaded catalog (the existing `lts:langchange` handler in
  `website-designer.js` already has this exact "re-check inputs by
  `data-title` after a rebuild" logic — reuse the same pattern for
  session restore instead of writing a second implementation).

## 6. Integration Points

- `js/website-designer.js` only. No backend, no other function in this
  batch depends on this one (in particular, `lead-followup` was
  originally going to treat abandoned server-side sessions as a
  follow-up signal — with this scope decision, that signal doesn't
  exist; `lead-followup` operates purely on `leads` records that already
  have a captured email, which is unaffected by this decision).

## 7. Non-Functional Requirements

- Trivial performance footprint — `localStorage` reads/writes are
  synchronous and effectively free at this data size.

## 8. Decisions (resolved 2026-07-14)

- **Same-device only**, no emailed resume link, no server-side session
  storage. If cross-device resume becomes worth revisiting later (e.g.
  after seeing real abandonment data once `leads-dashboard` is live),
  the original server-side design (session id + optional emailed resume
  link) is a natural v2 — but is out of scope for now.
