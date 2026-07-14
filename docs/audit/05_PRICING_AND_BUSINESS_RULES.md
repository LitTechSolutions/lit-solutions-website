# Session 5 — Pricing & Business Rules

Scope: Website Designer, pricing/discount logic, plans, and payments. No
code changes were made in this session — findings and evidence only, per
`00_AUDIT_CONTROL.md`. Read for this session: `00_AUDIT_CONTROL.md`,
`AUDIT_STATE.json`, Sessions 1–4's docs, and: `js/website-designer.js`
(pricing/discount functions), `netlify/functions/website-designer.js`
(`recomputeEstimate`/`priceMismatchFlag`), `starter-catalog.json`,
`business-catalog.json`, `pricing.html`, `heroes-pricing.html`,
`payment.html`, `terms.html` §3/§9, `js/main.js` (Square terms-gate).

## 1. Confirmed strengths (carried forward, not re-flagged)

- The Heroes Discount rate (15%), bundle-discount rate (10%), and
  bundle-minimum-items rule (2) are defined once each in
  `js/website-designer.js:50-52` and duplicated — deliberately, with an
  explicit comment explaining why (`netlify/functions/website-designer.js:44-49`)
  — in the server-side recompute. This is a materially safer form of
  duplication than plain hand-typed dollar figures: `priceMismatchFlag`
  (confirmed working, F013) automatically catches any future drift
  between the two copies rather than silently trusting one. Worth
  distinguishing from F035 below, which is about numbers with no
  equivalent cross-check.
- `js/website-designer.js:495-501` — premium/custom-quote ("S"-priority)
  items are confirmed never included in `computeSubtotal()`
  (`computeRawOptionalSum` only sums `selectedInputs('C')`), matching the
  documented policy that the Heroes Discount never touches items priced
  as "custom quote."
- Every dollar figure spot-checked this session is currently
  **mathematically correct**: Heroes Discount on websites ($699→$594,
  $1,299→$1,104 at 15% off, `heroes-pricing.html:297-298`), Heroes
  Discount on subscriptions ($39→$37, $79→$75 at 5% off,
  `payment.html:222,238`), and the pricing-comparison table's "up to"
  savings percentages (`pricing.html:232-233`) all check out against the
  stated market ranges. F035's concern is about *risk of future drift*
  from hand-typed, uncross-checked duplication — not a currently-wrong
  number anywhere checked.

## 2. F011 — re-verified with exact mechanism

`js/main.js:226-253` is the Square terms-gate: a `click` listener on each
`a.pay-btn`/`a.pay-btn-sm` calls `e.preventDefault()` only if the
`#agreeTerms` checkbox is unchecked. The anchors' real `href` values
(`payment.html:174,223,239` — plain `https://square.link/u/...` URLs)
are present in the page source regardless of checkbox state; this is a
client-side-only gate that doesn't (and structurally can't, without a
server-side redirect step) prevent the link from being reached directly.
Confirms F011 exactly as recorded; no change to its status or severity,
now with a precise line citation for the gate mechanism itself.

## 3. F031 / F032 — re-verified, one refinement

- **F031** (`terms.html:163`): "Fixed-price services ... require full
  payment before work begins. We do not use a deposit-plus-balance
  structure." Confirmed unchanged.
- **F032** (`payment.html:213-238`): the Small Business IT Support
  subscription explicitly states its scope "is confirmed with you before
  your first billing cycle" (`payment.html:238`) — a stated resolution
  mechanism for that plan's ambiguity. The **Website Care Plan** has no
  equivalent sentence; its description ("small content edits," "general
  website maintenance," `payment.html:214`) has no edit count, hour cap,
  or per-customer scope-confirmation language at all. This is a small
  refinement to F032, not a new finding: one of the two subscriptions
  already has a stated resolution pattern the other could adopt.

## 4. F010 — re-verified, unchanged

`pricing.html:222-238`'s comparison table still cites "Independent 2026
market research" with no source link or footnote anywhere on the page.
The percentages computed from the stated ranges are internally
consistent (see §1), which confirms the *arithmetic* is fine — the
finding is specifically about the uncited claim of independent research,
which remains exactly as recorded.

## 5. Findings ledger

No new finding IDs from this session. F010, F011, F031, F032, and F035
are all re-verified against current source; F035's entry is worth a
one-line severity-context update (not a status change) to note that the
duplicated Website Designer pricing *constants* have an automatic
cross-check (see §1) while the plain-text dollar figures F035 originally
flagged do not.

## 6. Not yet verified (flagged for a later session)

- Live/functional testing of the Website Designer's price ticker,
  bundle-box UI, and PDF generation end-to-end — Session 6.
- Whether Square's own dashboard/checkout enforces anything beyond what
  this site's code does for the terms-gate (F011) — outside this
  repository's scope to verify by code reading alone.
