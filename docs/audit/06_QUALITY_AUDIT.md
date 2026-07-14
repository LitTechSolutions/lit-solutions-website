# Session 6 — Quality Audit

Scope: accessibility, mobile, performance, SEO, translation, and
error/quality states. No code changes were made in this session —
findings and evidence only, per `00_AUDIT_CONTROL.md`. Read for this
session: `00_AUDIT_CONTROL.md`, `AUDIT_STATE.json`, Sessions 1–5's docs,
and: `css/style.css` (`--notice-*` tokens, `[dir]` rules), `js/cms.js`
(image `alt` rendering), `website-designer.html`/`js/website-designer.js`
(price ticker), `js/intake.js` (form-error markup), `index.html` header
(nav dropdown toggles), `js/i18n.js`, and all 16 `i18n/*.json` files
(key-parity check).

## 1. Confirmed strengths / re-verified findings (unchanged)

- **F004** (resolved) — `css/style.css:55-60,98-103` confirmed: real,
  distinct light- and dark-theme `--notice-*` values now exist; no
  self-reference remains.
- **F016** — confirmed still accurate: no `*.test.js`/`*.spec.js` file
  exists anywhere in the repository.
- **F019** — confirmed still accurate: `testimonials.html:16` and
  `portfolio.html:16`'s meta descriptions currently read honestly ("new
  business," matching F002's fix), but remain static HTML that the
  CMS-driven body content swap (`js/cms.js`) never touches — the finding
  is about what happens once real content exists, which hasn't happened
  yet, so nothing to re-flag today.
- **F020** — confirmed still accurate: exactly 31 pages carry
  byte-identical `LocalBusiness` JSON-LD; no `Service`/`FAQPage`
  /`Article`/`BreadcrumbList` schema exists anywhere in the repository.
- **F022** — confirmed still accurate: zero `aria-live` attributes exist
  anywhere in `website-designer.html`; the live price ticker
  (`#wdPriceAmount`, updated by `js/website-designer.js:37`) has none.
- **F023** — confirmed still accurate: zero `[dir=...]` CSS rules exist
  in `css/style.css`; RTL sets the attribute correctly but nothing in the
  stylesheet responds to it.
- **F025** — confirmed still accurate: `assets/logo-full.png` is 157,960
  bytes (~154 KiB).
- **F026** — confirmed and refined: the top-level error summary
  (`contact.html:193`, `intake.html:402`) does correctly carry
  `role="alert"` — but individual invalid fields
  (`js/intake.js:116,118`, `.group-error`/`.field-error`) are marked with
  CSS classes only, never `aria-invalid` or `aria-describedby`. A screen
  reader user is told "something is missing" but not which field(s) —
  the original finding's evidence is accurate, refined to note the
  summary-level alert is fine and the gap is specifically per-field.
- **F028** — confirmed still accurate: zero `aria-haspopup` attributes
  anywhere in `index.html`'s header.

## 2. F021 — expanded to include blog images, not just portfolio

`js/cms.js:134,185,204` all hardcode `alt=""` for the blog-card,
blog-post, and portfolio-card image renderers, despite each of those
records having a `title` (and in most cases `description`) field
available to build a real alt attribute from — exactly the pattern
already flagged for portfolio. The gallery renderer
(`js/cms.js:253`, `esc(item.altText)`) is confirmed as the one that does
this correctly, using a real per-image `altText` field. F021's fix
should extend to all three affected renderers, not portfolio alone; no
change to severity/status.

## 3. New finding: F041 — `en.json` is 69% incomplete relative to the site's real translated content

- **Severity:** Medium
- **Status:** Open
- **Domain:** Translation/Documentation quality (Session 6)

`i18n/en.json` (the documented "master English dictionary, extracted
directly from the live HTML so it can never silently drift from what's
actually on the page" — its own stated design purpose) has **466**
keys. All 15 real translation files (`i18n/{es,fr,zh,ja,vi,tl,ar,ko,de,
ht,pt,ru,it,pl,hi}.json`) have **1,496** keys each — and are perfectly
identical to one another key-for-key (verified: zero missing/extra keys
across all 15 when compared against each other). The gap is entirely on
the `en.json` side: **1,030 keys** exist in every real translation file
but not in the English reference, spanning nearly the whole site added
since the original 7-page rollout — `heroes-pricing.html` (109 keys),
the Website Designer's dynamic catalog labels (`catalog_items` 77,
`catalog_categories` 22, `wd_dyn` 73), `intake.html` (66),
`myaccount.html` (63), the 5 service-detail pages (57/52/50/49/49),
`terms.html` (48), `payment.html` (31), `privacy.html` (25), all 3 blog
articles plus `blog.html`/`blog-post.html` (20+22+21+20+4),
`search.html`, `testimonials.html`, `sitemap.html`, `portfolio.html`,
`service-area.html`, `booking.html`, `team.html`, `404.html`, and
`gallery.html`.

**This does not break the live site** — confirmed in `js/i18n.js:9,151`:
English is never fetched from `en.json` at runtime; selecting "en" just
restores the page's own native HTML, which is correct and complete. The
impact is entirely on `en.json`'s value as a reference/tooling artifact:
anyone (a future audit session, a translator doing a review pass, a
developer verifying what a given key's English source text is supposed
to be) who consults `en.json` today would conclude that most of the
site's pages were never translated, when in fact all 15 languages
correctly cover them. The most likely cause is that whatever produced
the "translate the remaining 25 pages" expansion (visible in the git
history) generated the 15 real dictionaries directly without
regenerating `en.json` from the newly-tagged HTML alongside them.

**Fix (for a future implementation turn, not this session):** regenerate
`en.json` from the current live HTML across all pages (the same
extraction approach used to build it originally — walking every
`data-i18n`/`data-i18n-html`/`data-i18n-attr-*` element) so it once again
matches the 1,496-key set every other language file already has.

## 4. Findings ledger addition

| ID | Severity | Status | Domain (session) | Finding | Evidence |
|----|----------|--------|-------------------|---------|----------|
| F041 | Medium | Open | Translation/Docs (6) | `i18n/en.json` has 466 of the 1,496 real translation keys (69% missing) — stale relative to the 15 language files, which are all identical to each other | `i18n/en.json` vs. `i18n/{15 languages}.json`; `js/i18n.js:9,151` (confirms no runtime impact) |

## 5. Not yet verified (flagged for a later session)

- Live-browser accessibility testing (screen reader behavior, actual
  focus order, real mobile-device rendering) — this and all prior
  sessions have been static-code reads only. A genuine live-browser pass
  is still owed across the whole site, not scoped to one session.
- Real Core Web Vitals / Lighthouse-style performance measurement —
  deliberately out of scope per `website-audit`'s own REQUIREMENTS.md
  §10 (v1 excludes this; a future PageSpeed Insights API integration
  would be the natural way to get real data, for the site itself as well
  as the audit tool being built).
