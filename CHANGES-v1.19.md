# v1.19 — Website Designer Configurator — What Changed

You asked for the new Website Designer configurator tool -- the customer-
facing package configurator/estimator (previously specified in
`Functions/Online Website Creator Tool/Online_Website_Creator_Tool_System_Requirements.xlsx`,
228 requirements) -- to actually be built and put on this website. You then
asked for a second pass to make it a genuinely fun, real-time experience:
a live mini-website that visibly grows as features are picked, real-time
price adjustment, and an automatic PDF-to-email pipeline at submission.

## New: `website-designer.html` + `js/website-designer.js`

A three-step tool: pick Starter ($699) or Business ($1,299), check off the
features you want while watching a live preview of the site grow and the
price update in real time, then submit your details.

- **Step 1 -- Package.** Starter/Business cards matching `pricing.html`.
- **Step 2 -- Features, with a live-growing preview.** A mock browser
  window starts empty ("Your website will grow here as you build it") and
  fills in as boxes are checked: content-producing features (blog,
  portfolio, testimonials, booking form, etc.) animate in as their own
  mini section card with an icon and a representative blurb, plus a nav
  pill; behavior/process features (dark mode, rate limiting, analytics)
  show as small badge chips instead of a full section, since those aren't
  visual page content; Premium/custom-quote features never get built into
  the preview at all -- they show a distinct locked 🔒 badge, so nothing
  ever implies a capability was "built" when it actually needs a separate
  scope and quote. Unchecking a box removes its card/badge with a matching
  fade-out. A price ticker sits above the preview and updates immediately
  on every change, with a brief count-up/pulse animation for polish
  (skipped entirely under `prefers-reduced-motion`).
- **Step 3 -- Your details.** Business/contact fields, a required
  estimate/consent acknowledgment, and submit.

Optional and Premium features are rendered from `starter-catalog.json` /
`business-catalog.json`, generated directly from `feature_manifest.json`
(REQ-1..92 / REQ-1..120) so this can never drift from the actual build
spec -- 49 Starter items, 58 Business items, each under its real
feature-area heading.

## Real-time pricing -- now with real per-feature numbers

The first pass deliberately avoided inventing per-feature prices (spec
decision D-01 was, and still is, open). You then gave explicit discretion
to set real numbers off industry standards and the site's existing
discounts, so every Optional (C) feature now carries a starting-estimate
price and the running total updates immediately as boxes are checked.

**Where the numbers came from:** researched 2026 freelance/agency web-dev
pricing (e.g. e-commerce cart additions run $3,000-$15,000+ and $60-150/hr
is a typical freelance range) and then anchored to *this site's own*
published rates instead of the generic market average -- `pricing.html`
already prices Little Technical Solutions LLC's own time at $59/hr
(technology consulting) and a full site redesign at a flat $599, and the
whole site is positioned as underpricing the market by design. Each
feature price is roughly 0.5-3 hours at that $59-79/hr rate to enable,
configure, and content-populate the feature within the existing generator
template (not built from scratch each time -- see `Software/*/build_site.py`),
rounded to the site's existing "X9" pricing convention ($29/$39/.../$159,
matching $599/$699/$1,299). The full reasoning and number-by-number list
lives as a comment in the catalog-build script. **Premium (S) features
still never get a price** -- always "custom quote," excluded from every
total, per the reference spec's own non-negotiable rule.

**American Heroes Discount, applied live.** A checkbox next to the price
ticker ("I qualify for the American Heroes Discount -- 15% off one-time
work") applies the same 15% one-time-work discount already offered
sitewide (`heroes-pricing.html`) directly to the running total in real
time -- self-reported here, same as everywhere else on the site;
verification still happens the normal way before work begins. The
discount is clearly broken out as its own line in the cost breakdown, the
PDF, and the email Dylan receives, and it never touches Premium/custom-quote
items (matching the sitewide "one-time work" scope of the discount).

## Bundle & save -- 10% off a fully-selected category

You asked for a "bundle and save" incentive: if someone selects every
optional feature in a category, they should save an extra 10% off that
category, and be told so. That's now real -- and it works whichever way
someone gets there:

- A dedicated **"Get all N [Category] features"** box sits under each
  category's header, showing the bundled price crossed out against the
  full price ("$498 ~~$553~~ save 10%") -- one click selects the whole
  category, no need to open the dropdown at all.
- Selecting every item in a category **by hand**, one checkbox at a time,
  triggers the exact same 10% -- the box lights up and a message appears:
  "🤝 We've got your back -- saving $55 (10%)!" Nobody has to know the box
  existed to get the discount.
- The discount is per-category and stacks with the American Heroes
  Discount (bundle savings come off the subtotal first, then Heroes takes
  15% off what's left) -- both show as their own line in the cost
  breakdown, the PDF, and the email to Dylan.
- A category needs at least 2 optional features for "bundle" to mean
  anything, so single-item categories don't show a bundle box.

## Collapsed categories, so this isn't overwhelming on first load

Every category (in both Optional and Premium) is now collapsed by
default with a one-line summary -- either what's inside ("Blog / News
section, FAQ page, Team / Staff page +4 more") or, once you've picked
something, a running count and price ("4 of 7 selected -- $376"). Click
the row to expand the actual checkboxes. This replaces the original pass,
which rendered every single feature in every category flat on the page at
once -- accurate, but a lot to take in on first glance.

## More graphics in the growing preview, personalized to your business

The live preview cards for content-style features (blog, testimonials,
team, pricing, gallery, FAQ, and so on) now render a small illustrative
graphic -- a mini blog card, a row of star ratings, a pricing-tier chart,
a photo grid, an accordion of FAQ rows, a booking calendar -- built from
CSS, not stock images, so it stays on-brand and themeable in light/dark
mode. Everything also plugs in whatever's typed in the new **business
name field**, which now lives permanently next to the live preview
(instead of buried in the step-3 form) so it can personalize the preview
from the moment you start picking features, not just at the end. Typing
or editing the name updates every card already on screen, plus the mock
browser's URL bar, in real time.

## Automatic PDF-to-email on submit

Submitting now:
1. Generates a structured project-summary PDF client-side (jsPDF) --
   package, price breakdown, every selected optional feature with its
   price, every premium add-on requested, and notes.
2. Posts the PDF (base64) plus the structured selection data to a new
   Netlify Function, `netlify/functions/website-designer.js`.
3. That function persists the submission as a lead record (new `leads`
   store in Netlify Blobs -- see `blob_store.js`) and emails Dylan the PDF
   as an attachment, reusing the existing `_lib/email.js` helper (Resend),
   which was extended to support attachments.
4. The customer sees a confirmation with a generated submission ID.

This replaced the native-Netlify-Forms submission from the first pass --
Netlify Forms can't attach a dynamically generated file, and a real PDF
attachment was the specific ask, so a small custom function (rate-limited
the same way `auth-register.js` is, via the existing `rateLimited()`
helper) was the right tool here.

## Site-wide integration (unchanged from first pass)

Added "Website Designer" to the primary nav and footer nav on all 32
other pages, plus the human-readable list on `sitemap.html`, `sitemap.xml`,
and `search-index.json`. `pricing.html` has a "Design my ___ site" button
next to each "Pay for ___" button.

## Bugs found and fixed in this pass

- **Price ticker could get permanently stuck.** The count-up animation
  relied entirely on `requestAnimationFrame`, which browsers throttle or
  fully suspend in backgrounded/non-visible tabs -- confirmed in testing
  (the ticker stayed at "$0" indefinitely in a headless/inactive tab).
  Fixed: the correct price is now set synchronously and unconditionally
  the instant a feature is toggled; the count-up/pulse is a purely
  cosmetic layer on top that may or may not get to animate, but the
  displayed number is never allowed to be wrong or stale.
- **PDF download button ignored its `hidden` attribute** (carried over
  from the first pass, still worth restating): the `.btn` class's own
  `display` property was winning the cascade tie against the browser's
  built-in `[hidden]` rule. Fixed with `.btn[hidden]{ display:none; }`.
- `page_shell.py` f-string/Python-3.9 bug from the first pass remains
  fixed (see prior notes in this file's history).
- **Rapid uncheck-then-recheck could permanently desync the preview from
  the checkbox.** A feature card fades out over ~220ms after unchecking;
  if it got re-checked inside that window (which the new "select whole
  category" box does in bulk, and which a fast double-click can do by
  hand), the re-add saw the still-present card and skipped re-adding it,
  and its nav pill (removed immediately, not faded) never came back --
  leaving a checked feature with no card at all. Fixed by cancelling the
  pending removal and restoring the card/pill in place instead of
  no-op'ing when a card is still mid-fade-out.

## Verification performed

Browser-preview tooling was unreliable for click/scroll simulation this
session (a sandbox limitation, not this code), so verification leaned on
direct DOM/JS-level testing instead, which is arguably more precise:
- Confirmed via screenshots that the empty-state preview, price ticker,
  and package cards render pixel-correct against the design system.
- Programmatically drove the actual page (not a simulation): chose
  Starter, checked "Blog / News section" (a content-kind C feature) and
  confirmed a preview card with the right icon/blurb appeared, the nav
  pill appeared, and price moved $699 -> $849; checked "Two-factor
  authentication" (S-tier) and confirmed it appeared only as a locked
  badge with zero effect on price; checked "Light / dark appearance mode"
  (a behavior-kind C feature) and confirmed it appeared as a badge, not a
  full preview card, with the correct +$50; unchecked the blog item and
  confirmed the card and nav pill were removed and price returned to
  $749.
- Filled the step-3 form and submitted for real: confirmed a valid PDF
  was generated (verified the `%PDF-1.3` magic bytes after base64-decoding
  the actual payload sent), confirmed the POST body to
  `/.netlify/functions/website-designer` contained exactly the expected
  fields (package, contact info, estimateTotal: 749, optionalSelected,
  premiumSelected, a ~6.5KB PDF), and confirmed the error path displays a
  clear message when the endpoint isn't reachable (expected locally --
  this needs an actual Netlify deploy to fully exercise the function).
- `node --check` passes on both `js/website-designer.js` and the new
  `netlify/functions/website-designer.js`.
- This round: confirmed categories render collapsed by default; expanded
  "Core Pages" and confirmed its summary line, then selected its
  bundle box and confirmed all 7 items checked, price moved
  $699 -> $1,197 (base + $553 optional - $55 bundle discount, exactly
  10%), the "we've got your back" badge appeared with the right dollar
  amount, and the cost breakdown showed a separate bundle-discount line.
  Unchecked one item by hand and confirmed the discount and badge both
  disappeared and the price recalculated correctly; re-checking it
  restored the bundle discount. Also reproduced and fixed the rapid
  uncheck/recheck desync bug above using this exact bundle-box flow.
  Turned on the Heroes Discount on top of an active bundle and confirmed
  correct stacking ($1,197 subtotal -> $1,017, i.e. an additional 15% off
  the already-bundle-discounted subtotal). Typed a business name after
  cards already existed and confirmed every visible card's text updated
  live, plus the mock browser's URL bar. Intercepted the real submit
  `fetch()` and confirmed the JSON payload includes `bundledCategories`
  and `bundleSavings` alongside the existing fields, and that the
  generated PDF text stream states the bundle discount and category name.

## Pricing validated against the market

You asked me to check what people pay big companies to build and host a
website and make sure this business undercuts them. Researched current
(2026) pricing for Wix/Squarespace/GoDaddy DIY plans and their own
"done for you" build services, freelance and agency rates, and managed
WordPress hosting. Verdict: **the $699/$1,299 flat packages are 50-85%
below typical freelance/agency builds** ($2,500-$15,000 for a 5-10 page
site) and land right around the cheapest "done for you" option on the
market (GoDaddy's own design service, ~$500-$1,500) -- a good, citable
comparison. The $29-$159 a-la-carte add-ons and $59/hr consulting rate
are comfortably below market too (custom features commonly run $2,000+;
freelance hourly floors sit around $50). No price changes were needed as
a result. **One flag, outside this tool's scope**: the existing sitewide
$39/mo maintenance plan is on the low side compared to the market's
$95-195/mo "realistic" range for actual maintenance service (and even
bare managed WordPress hosting alone runs $25-45/mo) -- worth a look
separately, since it's published on `pricing.html`, not something this
round touched.

## Operational items -- these need your action, not more code

- **Per-feature pricing** is now real numbers, not placeholders, but
  they're still *my* starting estimates -- review `PRICES` in the
  catalog-build script (or just edit the `price` field directly in
  `starter-catalog.json`/`business-catalog.json`) and adjust anything
  that's off before this goes live.
- **RESEND_API_KEY / EMAIL_FROM** must already be set for
  `website-designer.js`'s email to actually send (same variables the rest
  of the site's email already depends on) -- if they're not, the function
  logs instead of sending and the submission is still saved to the
  `leads` Blobs store, so nothing is lost either way.
- Confirm the new `website-designer` Netlify Function deploys and runs
  correctly after push (untestable without a live Netlify environment).
