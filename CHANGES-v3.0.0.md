# v3.0.0 — Full Visual Redesign + Three Real Bug Fixes — What Changed

You asked for a full pass on the site's overall look and feel, plus fixes for
a floating mobile menu, a confusing admin save flow, hard-to-read CMS cards,
and a buggy mobile Website Designer. Here's everything that shipped.

## The redesign

Same logo, same content — new visual identity, "Precision Signal": a near-
white/near-black neutral base, a single indigo primary accent, an emerald
secondary accent, bolder sans-serif headlines in place of the old monospace
display font (monospace is kept for prices, badges, and small labels, where
it still fits), and a softer 8px corner radius in place of the old 4px.

This was built almost entirely as a design-token change — the whole site
already used CSS custom properties for color/type/spacing, so updating the
palette definitions in one place (`css/style.css`'s `:root` and
`:root[data-theme="dark"]` blocks) re-themes all 33 pages, both light and
dark mode, without touching the HTML. On top of the tokens:

- Tokenized roughly 40 scattered hardcoded hex colors (an amber "notice box"
  pattern reused across legal/payment/discount callouts) into proper
  `--notice-*` variables, and gave that pattern a matching dark-mode
  treatment it never had before.
- Updated the one hardcoded illustration (the before/after website-quality
  comparison slider on services.html) so it still matches the live site's
  real colors instead of the old palette.
- Checked contrast on every new color pairing; found one that fell short
  (white button text on the dark-mode accent, 4.21:1) and adjusted the
  shade until it cleared 4.5:1.

## Bug fixes

**Mobile menu floating bug.** Opening Services or Resources from the
hamburger menu at tablet/narrow-desktop widths (roughly 1100–1620px)
rendered the dropdown detached, floating away from its own label instead of
appearing underneath it. Root cause: the submenu's own "switch to mobile
layout" breakpoint (1100px) didn't match the main nav's hamburger breakpoint
(1620px, raised in a past release for translated text length) — in that gap,
the main nav was already collapsed but its submenu was still using desktop
absolute-positioning inside the now-narrow mobile panel. Fixed by scoping the
submenu's mobile conversion to the same 1620px breakpoint, without touching
the separate language-switcher dropdown (which has its own, correct,
independent behavior).

**"My portfolio post disappeared" bug.** Root cause: adding an item in the
admin panel only staged it in memory — actually publishing it required a
*separate* "Save changes" click. Missing that second step (easy to do, since
it's a distinct button from the item form) meant the item never reached the
server, so the public page correctly kept showing "nothing here yet" even
though a post had visibly been "added" in the admin view. Fixed by making
every add/edit/delete/reorder action in all four content editors (posts,
portfolio, testimonials, gallery) save immediately, with inline "Saved ✓"
confirmation or a clear error (with retry, where applicable) if it didn't go
through. Removed the now-unnecessary "unsaved changes" banner and manual
save button. Also fixed a smaller version of the same silent-failure issue
in the Image Library's delete action.

**CMS card readability + a real photo bug.** Redesigned the portfolio,
testimonial, gallery, and blog cards around a genuine image focal point
(bigger photos, proper aspect ratios, image flush at the top) with the text
clearly organized underneath, replacing small fixed-height thumbnails and
heavy hover shadows. Along the way, found and fixed a real bug: uploaded
blog post photos were never actually rendered on the blog list — the code
always fell back to a generic icon regardless of whether a photo existed.

**Website Designer mobile experience.** The live preview of the customer's
site is now the pinned visual focal point on mobile as they scroll through
package and feature options underneath it — matching how it already felt on
desktop. Along the way, found and fixed the real bug behind "buggy on
mobile": the tool's layout grid used a bare `1fr` track (which has an
implicit auto-minimum), so selecting a package blew the layout out past the
viewport width instead of respecting it. Also fixed truncation on the
preview's URL bar, a badge that could collapse feature text to one word per
line, made the step tabs horizontally scrollable instead of riskily
wrapping, and bumped a few checkbox tap targets on mobile.

## Verification performed

- HTML tag-balance check on all 34 pages: clean.
- CSS brace balance and `node --check` on every JS file: clean.
- JSON validity check on all 16 `i18n/*.json` files: clean (untouched by
  this release, confirmed still intact).
- Contrast-checked 13 new color pairings against WCAG AA; one adjusted, rest
  passed on first check.
- Live-verified in the browser: homepage in light and dark mode; the mobile
  nav dropdown fix at 1400px; the Website Designer's sticky mobile preview
  through package selection at 375px with no horizontal overflow; admin.html
  loading without console errors; the portfolio empty-state still rendering
  correctly; a translated page (Arabic, RTL) with the new palette.
- The card redesign and admin auto-save fix were additionally verified
  against real (mocked) data locally, since this dev environment has no live
  backend — confirmed all four card types render correctly in both themes,
  and confirmed save/rollback/retry behavior across success and forced-
  failure cases for every mutation path.
- Not verified: a full manual pass of all 33 pages individually (verification
  focused on representative pages across page types, breakpoints, and
  themes, plus the token architecture that drives the rest); a live
  screen-reader pass; real end-to-end testing of the admin panel or Website
  Designer submission against a live backend (not available in this
  environment).
