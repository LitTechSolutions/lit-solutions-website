# Session 8 — Final Audit & Roadmap

Consolidates Sessions 1–7 into one prioritized roadmap and a handoff for
whatever comes next. This document doesn't introduce new findings of its
own — it organizes the 41 already-recorded (`F001`–`F041`). No code
changes were made in this or any prior session; this audit is findings
and evidence only, per `00_AUDIT_CONTROL.md`.

## 1. What this audit covered

| Session | Scope | Outcome |
|---|---|---|
| 1 | Architecture, functions, storage, dependencies, versioning, business-data duplication | Baseline + F001–F036 recorded |
| 2 | Homepage, nav/footer, all public pages, CTAs, content accuracy | F037 added; F017 evidence expanded |
| 3 | Auth, authorization, sessions, customer data, privacy | F038, F039 added |
| 4 | Every Netlify Function, forms, files, email/PDF, providers | F040 added; F027 expanded |
| 5 | Website Designer, pricing/discount logic, plans, payments | No new findings; F010/F011/F031/F032/F035 refined |
| 6 | Accessibility, mobile, performance, SEO, translation, quality states | F041 added; F021/F026 refined |
| 7 | Candidate-function gap matrix (value/risk/dependencies) | No new findings; F033 sharpened |
| 8 | This document | Consolidation only |

**9 of 41 findings are already Resolved** (F001–F005, F012–F015), all
landed in commits `9a753a6`, `94a9420`, `a6912fc`, and `57e124a` before
or during this audit. **11 are Owner-Decision** items genuinely awaiting
Dylan's input, not engineering ambiguity. **21 are open, engineering-only**
findings ready to fix once prioritized.

## 2. Tier 1 — fix now (Critical/High severity, no owner decision needed)

These are the highest-value, ready-to-fix items. Each already has a
concrete fix path recorded in its session doc — none require a new
design decision, only implementation.

1. **F038 (High)** — Password-reset never actually emails the user a
   link; the fix is to apply the exact `sendEmail()` pattern already
   working for email verification (`_lib/verification.js`) to
   `auth-password-reset.js`. This is the one core auth flow that
   currently doesn't work unattended for a real customer.
2. **F040 (High)** — `messages.js` embeds message content unescaped into
   an outbound HTML email; fix is to apply the `esc()` helper already
   defined and used consistently in `website-designer.js` to the same
   spot in `messages.js`.
3. **F037 (High)** — Homepage's "Get a free quote" hero button links to
   `contact.html` instead of `intake.html`, contradicting the site's own
   copy about which page handles quotes. One `href` change (or a label
   change, per the fix note in `02_PUBLIC_SITE_AUDIT.md` §3).
4. **F006 + F007 (Critical)** — Privacy Policy under-discloses real data
   collection (customer accounts, documents, messages, favorites,
   notifications, IP addresses) and never names Resend as an email
   sub-processor. This needs real policy-text drafting, then Dylan's
   sign-off on the final language before publishing — flagged here as
   Tier 1 because the *gap* itself isn't ambiguous, only the exact
   wording is.
5. **F018 (High)** — Intake form's "just type 4" instruction reads
   confusingly; a content/UX fix, not a design question.
6. **F016 (High)** — Zero automated tests anywhere in the repository,
   including pricing/discount math. This is a larger, ongoing
   investment rather than a single fix — worth starting with the
   pricing/discount functions (`js/website-designer.js`,
   `recomputeEstimate`) given real money depends on them being correct.

## 3. Tier 2 — Medium severity, straightforward engineering

`F019` (stale meta description, latent until real content exists),
`F020` (add `Service`/`FAQPage` schema alongside the existing
`LocalBusiness` JSON-LD), `F021` (real `alt` text for blog/portfolio
images, following Gallery's already-correct pattern), `F022` (`aria-live`
on the Website Designer price ticker), `F023` (RTL logical-property CSS
rules), `F025` (compress `logo-full.png`), `F026` (per-field
`aria-invalid`/`aria-describedby` on form errors), `F035` (consider
computing Heroes-discount dollar amounts from the base price instead of
hand-typing them — the Website Designer's own `priceMismatchFlag`
pattern is a working example of the safer alternative), `F039` (expand
the account-preference language list to match all 16 real languages).

`F041` (`en.json` regeneration) is worth doing alongside any of the
above, since it's the same kind of mechanical, low-risk fix and directly
improves this audit's own ability to reason about the site's content.

## 4. Tier 3 — Low/Info, opportunistic

`F027` (rate-limiter TOCTOU race; exclude `image/svg+xml` from the admin
upload allowlist — the fix pattern already exists in
`website-designer.js`'s `isRecognizedImage()`), `F028` (`aria-haspopup`
on nav dropdowns), `F034` (version string duplicated across 33 footers —
worth a small build-time or shared-partial mechanism if the site ever
gains a build step), `F036` (founder bio duplicated across 5 locations ×
16 languages — Info only, no action implied).

## 5. Owner-Decision items — grouped for Dylan, not the engineering backlog

These 11 findings are genuinely business/brand/legal calls, not
engineering ambiguity. Presented as direct questions:

**Content & navigation:**
- **F008/F009** — Gallery and Booking both show empty/non-functional
  states with full header+footer nav prominence. Should either be
  demoted from primary nav until real content/functionality exists, or
  is the current "coming soon" framing fine as-is?
- **F010** — The pricing comparison table cites "independent 2026 market
  research" with no source. Add a citation, soften the claim, or remove
  the comparison table?
- **F017** — 14+ CTA phrasings funnel into 2 real destinations. Worth
  consolidating to fewer, more consistent labels (see the full evidence
  table in `02_PUBLIC_SITE_AUDIT.md` §2)?
- **F024** — Patch Notes reads as a detailed engineering changelog in
  its older entries. Keep the current level of detail, or write a
  lighter customer-facing summary?
- **F029** — 20 total nav destinations (6 top-level + 14 across two
  dropdowns) may be more than customers need to see at once. Worth
  simplifying?

**Business policy:**
- **F011** — The Square payment terms-checkbox is a client-side-only
  gate; the raw payment link is reachable directly. Acceptable
  business-risk tolerance as-is, or worth a server-side gate?
- **F030** — Heroes Discount verification (DD-214/LES by email) — is the
  current retention/handling of these sensitive documents sufficient, or
  does it need a stated policy?
- **F031** — Full-payment-upfront for all fixed-price work, no deposit
  option. Confirmed policy, or worth a deposit/milestone alternative for
  larger custom projects?
- **F032** — Website Care Plan subscription scope (edit counts, hours)
  is undefined, unlike Small Business IT Support which states scope gets
  confirmed per customer. Adopt the same pattern?
- **F033** — Is the growing account-system surface (documents, messages,
  favorites, notifications, and potentially `project-status` and
  `referral-program` per Session 7) worth its complexity, and should
  registration stay fully open-public? Worth resolving *before* building
  either of the two candidate features that would extend it further.

## 6. New-feature roadmap (from Session 7's gap matrix)

Full detail in `07_REQUIREMENTS_GAP_MATRIX.md`. Build order, confirmed
independently by two separate analyses (this audit's and
`NEW_FUNCTIONS_README.md`'s own):

1. `leads-dashboard` + `project-status` (build together)
2. `quote-acceptance` Phase 1 (tiny, ready now)
3. `website-audit` (high value; budget real security-review time for its
   mandatory SSRF protection)
4. `quote-session` (trivial, client-only)
5. `lead-followup` (engineering ready; blocked on real email copy)
6. `project-scaffold-generator`
7. `referral-program`
8. `booking-scheduler` (biggest scope in the batch — real Google
   Calendar OAuth infrastructure; blocked on Dylan completing one
   Workspace Admin console step before end-to-end testing is possible)
9. `quote-acceptance` Phase 2 (blocked on a DocuSign plan-upgrade cost
   decision, not engineering readiness)

**The two riskiest builds** in this whole batch are `website-audit`
(only public endpoint fetching arbitrary user-supplied URLs — SSRF
protection is mandatory, not optional) and `booking-scheduler` (only one
requiring real external OAuth infrastructure). Both are fully specified
and ready to build; they just deserve more care and time than the rest
of the batch.

## 7. Handoff notes (for whatever session picks this up next)

- **This audit is complete** — all 8 sessions done, `readyForSession`
  will be cleared once this document is filed (see `AUDIT_STATE.json`
  update alongside this commit).
- **Audit sessions don't implement** (per `00_AUDIT_CONTROL.md`) — this
  entire 8-session effort produced findings and evidence only. Any
  future session that *fixes* something from this backlog is a
  separate, explicitly-requested implementation turn, not a continuation
  of the audit.
- **When implementing a fix**, update that finding's entry in
  `AUDIT_STATE.json` to `"status": "Resolved"` with the commit hash, and
  add a one-line note to the relevant session doc — follow the exact
  pattern already used for F001–F005 and F012–F015 (see
  `01_REPOSITORY_BASELINE.md` §2 and this document's §1 table).
- **Owner-Decision findings (§5 above) should not be silently
  implemented** — they need Dylan's actual answer first, the same way
  every prior "Decisions (resolved ...)" section in the 9 candidate-
  function specs recorded his real answers before those specs were
  considered build-ready.
- **If new repository exploration is ever needed** (e.g., a major
  redesign or new function set lands and this whole audit needs a fresh
  pass), start a new numbered session rather than editing any of
  `01`–`08` in place — this audit's own findings (all still evidence-
  backed with file:line citations) remain a useful historical record
  even after some are fixed, the same way this repo's own git history
  and `patch-notes.html` are treated as append-only records.
