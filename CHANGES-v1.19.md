# v1.19 — Website Designer Configurator — What Changed

You asked for the new Website Designer configurator tool -- the customer-
facing package configurator/estimator (previously specified in
`Functions/Online Website Creator Tool/Online_Website_Creator_Tool_System_Requirements.xlsx`,
228 requirements) -- to actually be built and put on this website.

## New: `website-designer.html` + `js/website-designer.js`

A three-step tool: pick Starter ($699) or Business ($1,299), check off the
features you want from the real feature catalog, then submit your details.

- **Step 1 -- Package.** Starter/Business cards matching `pricing.html`.
- **Step 2 -- Features.** Optional and Premium features are rendered from
  `starter-catalog.json` / `business-catalog.json`, generated directly from
  `feature_manifest.json` (REQ-1..92 / REQ-1..120) so this can never drift
  from the actual build spec -- 49 Starter items, 58 Business items, each
  under its real feature-area heading. A running "Your estimate" sidebar
  updates live as boxes are checked.
- **Step 3 -- Your details.** Business/contact fields, a required
  estimate/consent acknowledgment, and submit.
- Submission uses Netlify's native form handling (`data-netlify="true"`,
  honeypot field) -- the same pattern already used by `contact.html` and
  `intake.html` -- so it reaches Forms > Notifications once that's
  configured, with no new backend code or environment variables needed.
  A client-side "Download summary (PDF)" button (via jsPDF) gives the
  customer their own copy.

## Known limitation, called out in the tool itself and not hidden

**No per-feature pricing exists yet** (Configuration Decision D-01 in the
reference spec is still open -- it's an owner pricing decision, not
something I can invent for a live customer-facing tool). The estimate
shown is: the package's real starting price ($699/$1,299), plus a
plain-language list of which optional features were selected and which
premium add-ons need a custom quote -- never a fabricated total. Every
screen says outright that this is an example estimate and the final price
is confirmed by us. When per-feature pricing is decided, extending
`starter-catalog.json`/`business-catalog.json` with prices and updating
`updateSummary()` in `js/website-designer.js` to compute a real running
total is the next step.

## Site-wide integration

- Added "Website Designer" to the primary nav and footer nav on all 32
  other pages, plus the human-readable list on `sitemap.html`.
- Added the page to `sitemap.xml` and `search-index.json`.
- `pricing.html`: added a "Design my Starter/Business site" button next to
  each "Pay for ___" button, and pointed the "not sure which fits" note at
  the new tool as well as the existing project-form fallback.
- Bumped the footer version stamp to 1.19 site-wide.

## Bug fixed along the way

`page_shell.py` (the Business Package Software code generator, not this
site directly, but caught while cross-checking patterns) had an f-string
with an escaped quote inside its expression part (`{" aria-current=\"true\""...}`),
which is a Python 3.12+-only construct -- it threw `SyntaxError` on this
machine's Python 3.9 and would have blocked the entire Business generator
from running for anyone not on 3.12+. Fixed by extracting the ternary into
a small helper function; verified the generator builds and validates
correctly afterward.

## Verification performed

- Full click-through: package selection loads the correct catalog via a
  real `fetch()`, category headings and checkboxes match
  `feature_manifest.json` exactly, checking boxes updates the live estimate
  with correct Optional/Premium counts and item lists, and a full submit
  posts the correctly-encoded Netlify Forms payload and shows a generated
  submission reference.
- Fixed a real bug found in testing: the submit handler's `fetch(...).then()`
  didn't check `res.ok`, so a non-2xx response would have been treated as
  success. Now throws and falls through to the error-message path on any
  non-OK response, matching "truthful status" behavior.
- Fixed a second bug found in testing: the "Download summary (PDF)" button
  used the `hidden` attribute, but the `.btn` class's `display` property
  silently overrode it (a specificity tie broken by source order). Added
  `.btn[hidden]{ display:none; }` to `css/style.css`.
- `node --check` passes on `js/website-designer.js`.
- Local static-server testing could not reach the external jsPDF CDN
  (sandboxed test network), so PDF download itself is unverified in this
  session -- code path is written defensively (no-ops if `window.jspdf` is
  absent) and should be spot-checked in the browser console after deploy.

## Operational items -- these need your action, not more code

- **Per-feature pricing (D-01)** -- see "Known limitation" above.
- **Forms > Notifications** in the Netlify dashboard needs the new
  `website-designer` form recognized once this deploys (Netlify detects
  forms from the built HTML automatically; notifications still route
  through whatever's already configured for `contact`/`intake`).
- Confirm jsPDF loads correctly from `cdnjs.cloudflare.com` in a real
  browser after deploy (untestable in this sandbox).
