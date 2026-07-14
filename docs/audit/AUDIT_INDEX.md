# Audit Index

Human-readable index of the LTS platform audit. See `AUDIT_STATE.json` for
machine-readable state, and `00_AUDIT_CONTROL.md` for process/ground rules.

## Status: audit complete (Sessions 1–8 all done)

All 8 planned sessions are finished as of this document. `AUDIT_STATE.json`'s
`readyForSession` is `null` — there is no pending session to resume into.
See `08_FINAL_AUDIT_AND_ROADMAP.md` for the consolidated roadmap. If a
genuinely new audit pass is warranted later (e.g. after a major redesign
or a large new feature set lands), start a new numbered session rather
than editing `01`–`08` in place.

## How to resume cold (if a new session is ever added)

1. Read `00_AUDIT_CONTROL.md` (rules) and `AUDIT_STATE.json`
   (`readyForSession`).
2. Read the most recent numbered doc that exists.
3. Read only the source files that session's scope actually needs — don't
   re-explore the whole repository.
4. Do not spawn subagents unless explicitly instructed.

## Documents

| Doc | Status | Covers |
|-----|--------|--------|
| [00_AUDIT_CONTROL.md](00_AUDIT_CONTROL.md) | Done | Process, ground rules, session outline, ID/severity convention |
| [01_REPOSITORY_BASELINE.md](01_REPOSITORY_BASELINE.md) | Done | Architecture, functions/storage inventory, findings F001–F036 |
| [02_PUBLIC_SITE_AUDIT.md](02_PUBLIC_SITE_AUDIT.md) | Done | Homepage, header/footer/nav, all public pages, CTAs, content accuracy; finding F037 |
| [03_IDENTITY_DATA_SECURITY.md](03_IDENTITY_DATA_SECURITY.md) | Done | Auth, authorization, sessions, customer data, privacy; findings F038, F039 |
| [04_BACKEND_INTEGRATIONS.md](04_BACKEND_INTEGRATIONS.md) | Done | Every Netlify Function, forms, files, email/PDF, providers; finding F040 |
| [05_PRICING_AND_BUSINESS_RULES.md](05_PRICING_AND_BUSINESS_RULES.md) | Done | Website Designer, pricing/discount logic, plans, payments; no new findings, F010/F011/F031/F032/F035 refined |
| [06_QUALITY_AUDIT.md](06_QUALITY_AUDIT.md) | Done | Accessibility, mobile, performance, SEO, translation, quality states; finding F041, F021/F026 refined |
| [07_REQUIREMENTS_GAP_MATRIX.md](07_REQUIREMENTS_GAP_MATRIX.md) | Done | Classify all 9 candidate functions vs. value/risk/dependencies; F033 sharpened |
| [08_FINAL_AUDIT_AND_ROADMAP.md](08_FINAL_AUDIT_AND_ROADMAP.md) | Done | Consolidated findings into a tiered roadmap, owner-decision questions, and handoff notes |

## Evidence & inventories

- `evidence/` — supporting raw evidence (e.g. security observation logs)
  as sessions produce it.
- `inventories/` — machine-readable inventories (e.g. `pricing-sources.json`
  when Session 5 produces it).

## Findings summary (as of the Owner-Decision implementation pass, 2026-07-14)

- **41 findings** recorded (`F001`–`F041`), plus 6 findings from earlier
  in this document's numbering brought the tracked total to 47 (see
  `AUDIT_STATE.json` `counts.total`).
- **All 47 findings are now Resolved.** The 30 resolved during the
  post-audit engineering fix pass (F001–F005, F012–F016, F018–F023,
  F025–F028, F034–F041, F006/F007, F036) are unchanged; the 11
  Owner-Decision findings (F008, F009, F010, F011, F017, F024, F029,
  F030, F031, F032, F033) were then resolved per Dylan's explicit
  decisions — see "Owner-Decision implementation pass" below.
- **0 Open findings of any kind remain.**

Session 2 added F037 (homepage's primary "quote" CTA links to the wrong
form) and expanded F017 with a full CTA evidence table; F008, F009,
F010, F018, F024, and F029 were re-checked against current source and
remain accurate as recorded.

Session 3 confirmed F005/F015/F027 fixes and strengths still hold; added
F038 (password-reset never actually emails a link — only email
verification is wired to `sendEmail()`) and F039 (account-preference
language list hardcoded to 4 of the 16 real supported languages);
re-verified F006, F007, and F030 unchanged.

Session 4 confirmed F012/F013 fixes and per-user ownership-check
strengths hold across `documents.js`, `messages.js`, `favorites.js`, and
`notifications.js`; added F040 (`messages.js` embeds message content
unescaped into an outbound HTML email, unlike the `esc()` pattern used
consistently in `website-designer.js`); expanded F027 with a second
occurrence of the same SVG-allowlist gap in `documents.js`.

Session 5 verified the Website Designer's pricing/discount engine is
sound (client/server constants are duplicated but auto-cross-checked via
`priceMismatchFlag`, unlike F035's plain-text figures) and every dollar
amount spot-checked is currently correct; confirmed F010, F011 (with the
exact terms-gate mechanism), F031, and F032 (refined) unchanged, with no
new findings.

Session 6 confirmed F004 resolved and F016/F019/F020/F022/F023/F025/F028
unchanged; refined F021 (blog images have the same hardcoded `alt=""` gap
as portfolio) and F026 (the top-level error summary does carry
`role="alert"`; the gap is specifically per-field `aria-invalid`); added
F041 (`i18n/en.json` is missing 1,030 of 1,496 real translation keys —
stale relative to the 15 language files, which are perfectly in sync
with each other and have no runtime impact from this gap).

Session 7 classified all 9 spec-only candidate functions by business
value, build risk, and dependencies, confirming the existing recommended
build order independently: `website-audit` and `booking-scheduler`
stand out as the two needing the most care (mandatory SSRF protection;
real Google Calendar OAuth infrastructure), while `quote-acceptance`
Phase 2 and `lead-followup` are blocked on a cost decision and real copy
respectively, not engineering readiness. No new findings; F033 sharpened
with context about `project-status`/`referral-program` adding further
account-system surface.

Session 8 consolidated all 41 findings into a tiered roadmap (6 fix-now
items with no owner decision needed, a medium tier, a low/info tier),
grouped the 11 owner-decision findings into direct questions for Dylan,
restated the confirmed new-feature build order, and wrote handoff notes
for whoever picks up implementation next. The audit is now complete.

## Post-audit engineering fix pass (2026-07-14)

Implemented every open, engineering-only finding from the Session 8
roadmap in one pass, one commit per finding (see `git log` for exact
commits, also recorded per-finding in `AUDIT_STATE.json`):

F038, F040, F037, F018, F027, F039, F041, F021, F022, F026, F028, F023,
F020, F019, F035 (partial), F034, F025, F016, F006, F007.

`F035` is only partially closed: the Website Designer's client-side base
price is now derived from the catalog JSON instead of hand-typed, but
the Heroes Discount page's hand-typed "was/now" prices were left as
static translated copy (rewriting them at runtime risked corrupting the
16-language markup) — instead, `test/heroes-pricing-consistency.test.js`
(added under F016) automatically catches future drift between
`pricing.html` and `heroes-pricing.html`.

`F006`/`F007` (Privacy Policy) needed real policy-text drafting rather
than a mechanical fix — the new disclosures were translated into all 16
languages, but **Dylan should review the final wording before treating
this as settled**, per `08_FINAL_AUDIT_AND_ROADMAP.md`'s own note that
the gap was unambiguous but the exact phrasing wasn't.

**Deliberately not implemented**, per `00_AUDIT_CONTROL.md`'s ground
rule against silently implementing Owner-Decision findings: F008, F009,
F010, F011, F017, F024, F029, F030, F031, F032, F033. These need
Dylan's direct input, not engineering judgment.

## F036 follow-up (2026-07-14)

Closed the last engineering-only finding. F036 (founder biography
duplicated across `about.html`, `index.html`, `team.html`,
`testimonials.html`, and every `i18n/*.json`) prototyped a runtime
JS single-source-of-truth mechanism (mirroring F034's `site-version.js`
pattern: a `FOUNDER_FACTS` object filling `data-fact` spans on load),
but backed it out — spans nested inside plain `data-i18n`
(textContent-only) elements get flattened by `js/i18n.js`'s
language-switch round-trip, so the mechanism would only reliably hold
until a visitor's first language switch. That fragility wasn't
proportionate to an Info-severity, "no action implied" finding.
Landed a documentation-only fix instead: a checklist in `CLAUDE.md`
naming every location that needs the same edit if these facts ever
change again, so a repeat of the CG-64→CG-54 manual sweep (`9a753a6`)
starts from a known list.

**Zero engineering-only, non-Owner-Decision findings remain open.**
All that's left of the original 41 findings are the 11 Owner-Decision
items awaiting Dylan's input.

## Owner-Decision implementation pass (2026-07-14)

Dylan supplied explicit decisions for all 11 Owner-Decision findings in
one message and asked for autonomous implementation without further
confirmation. Each was implemented as its own focused commit (see
per-finding `commit`/`resolutionNote` in `AUDIT_STATE.json`):

- **F008** (Gallery empty, full nav prominence) — `ba24a96`
- **F009** (Booking non-functional, full nav prominence) — `ba24a96`
- **F010** (unsourced market-research pricing claim) — `877ffa9`
- **F011** (Square terms-gate bypassable) — `1d07b4d`
- **F017** (14+ distinct CTA phrasings) — `a123a9b`
- **F024** (Patch Notes reads as raw engineering changelog) — `0060a64`
- **F029** (navigation hierarchy) — `ba24a96`
- **F030** (Heroes Discount verification method) — `438d2fa`
- **F031** (full-payment-upfront vs. deposit/milestone policy) —
  verified already satisfied, no code change needed
- **F032** (subscription plan scope undefined) — verified already
  satisfied, no code change needed
- **F033** (account-system feature scope / open-registration policy) —
  verified already satisfied, no code change needed

All new/changed English strings from this pass were translated into all
15 non-English languages in one consolidated pass (`239def8`), which
also cleaned up 12 orphaned `pricing.compare_*` keys left behind in the
15 language files by the F010 fix. A pre-existing, unrelated translation
gap (`wd.start_over` missing in all 15 languages) was discovered during
parity verification and flagged as its own follow-up rather than folded
into this pass.

Also added, as a directly related but distinct piece of work: a real
completed client project, **Armour Wireless** (armourwireless.com), was
formally documented as an open content requirement blocked on
owner-supplied source material (`docs/audit/CONTENT_REQUIREMENTS.md`,
commit `d91bb16`) — no content was invented or published.

**Important: the finding IDs Dylan used in his decision message do not
match this audit's real IDs for the same topics**, e.g. he referred to
the CTA-consistency finding as "F029" (the real ID for that topic is
F017; the real F029 is the navigation-hierarchy finding, which he
labeled "F031"). Every finding above was implemented by matching the
**topic description**, not the literal ID string, and is recorded here
under this audit's actual, pre-existing ID for that topic. See each
finding's `ownerLabelNote` field in `AUDIT_STATE.json` for the exact
mapping.

**All 11 Owner-Decision findings are now Resolved. 0 Open findings of
any kind remain** (`AUDIT_STATE.json` counts: 47 total, 47 resolved, 0
owner-decision-open, 0 engineering-open).
