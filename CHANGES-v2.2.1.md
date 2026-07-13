# v2.2.1 — Header Overflow + RTL Scroll Fix — What Changed

You reported the header pushing "Get a quote" way off to the right on
desktop in English, with a lot of empty room on the left, and asked me
to recenter it, polish it up, and check that every language's nav text
actually looks good too — not just functions.

## Root cause: the header simply had too much content for its row

The header's `.wrap` container is capped at `max-width: 1180px`
regardless of how wide the browser window is — growing the window past
about 1280px never gave the nav more room. Meanwhile the nav (8 items,
2 of them dropdowns) plus the header actions (theme toggle, search,
account, phone number, quote button) need roughly 1400px+ of content
width just in English to sit on one line without compressing. Since the
quote button is deliberately protected from shrinking
(`flex-shrink:0`, added in an earlier release so its text wouldn't get
squished), the overflow had nowhere to go but past the container's
right edge — which is exactly "pushed off to the right."

Longer-language translations made it worse in a different way: nothing
protects the *nav links* from shrinking, so instead of overflowing
sideways like the English case, phrases like Filipino's "Diskwento Para
sa mga Bayani" wrapped internally, turning the header into a tall,
messy multi-line block. I pulled the actual nav/quote strings out of
all 16 `i18n/*.json` files and confirmed Filipino, Spanish, Hindi,
French, and Vietnamese are all longer than English — English wasn't
even the worst case, just the first one you noticed.

## The fix

- The header now gets its own wider container
  (`.site-header .wrap{ max-width: 1600px }`) instead of sharing the
  page's 1180px content width, so wide screens actually have room to
  use.
- Reduced nav/header-action spacing slightly (`.main-nav` gap
  2rem→1.25rem, `.header-inner` gap 1.5rem→1rem) to pack more
  efficiently before anything has to give.
- Raised the breakpoint where the header switches to the existing
  compact/hamburger menu from `max-width:1100px` to
  `max-width:1620px`. Below that width, every language reliably runs
  out of room for a full one-line nav — rather than let it overflow or
  wrap badly, it now falls back to the same clean dropdown menu the
  site already uses on mobile, which handles any text length
  gracefully by design.
- This does mean common laptop widths (1366px, 1440px) now get the
  compact header instead of the full inline nav. That's a real
  trade-off, not a side effect I missed: I could not find a way to fit
  8 nav items + full header actions on one row for every supported
  language without either this, or removing/relocating nav items
  (which I didn't do without checking with you first).

## Second bug found while checking languages: Arabic (RTL) had a large blank gap

Not something you reported, but "verify each language looks good"
surfaced it. Every page's invisible "skip to content" accessibility
link was hidden using `left: -999px` — a common trick, but one that
only works in left-to-right layouts. Under `dir="rtl"` it inflated the
document's scrollable width by almost 1000px, and the browser's
default RTL scroll position then showed you the far side of that
inflated canvas — mostly blank space, with the real page content
compressed off to one side. Switched it to `transform: translateY(-100%)`
(pushes it above the viewport instead of far to the left), which hides
it just as effectively without touching horizontal scroll in either
direction. Confirmed `document.documentElement.scrollWidth` now
matches the viewport width exactly in Arabic.

## Verification performed

- Reproduced the original English bug at 1280px width before touching
  anything (empty space on the left, phone number and quote button cut
  off), to confirm root cause before fixing it.
- Pulled every language's `nav.*`/`header.get_quote` strings out of
  `i18n/*.json` and ranked them by length rather than assuming English
  is representative — it wasn't.
- Scripted a check that applies all 16 languages' dictionaries in
  sequence (via the same `data-i18n` mechanism `js/i18n.js` uses) and
  measures `document.body.scrollWidth`, the quote button's right edge,
  and max nav-item height at 1680px width: zero overflow, zero wrapping
  in any language.
- Tested the breakpoint boundary directly at 1620px (compact menu,
  confirmed `.main-nav` stays collapsed via `max-height:0`) and 1621px
  (full nav, confirmed clean even for Filipino, the longest language,
  with ~38px of margin to spare).
- Spot-checked tablet (768px) and mobile (375px) widths to confirm the
  already-existing compact header still works — this release didn't
  touch anything below the old 1100px breakpoint.
- Confirmed the fix is page-independent by checking the homepage,
  `website-designer.html`, and `about.html` — the header is one shared
  stylesheet, not per-page markup, so a single CSS fix covers all 33
  pages.
- HTML tag-balance and CSS brace-balance checks on the edited files:
  clean.
- Not verified: an actual screen reader pass on the skip-link fix, or
  the site at true ultra-wide (2560px+) resolutions.
