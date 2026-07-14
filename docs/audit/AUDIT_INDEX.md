# Audit Index

Human-readable index of the LTS platform audit. See `AUDIT_STATE.json` for
machine-readable state, and `00_AUDIT_CONTROL.md` for process/ground rules.

## How to resume cold

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
| 07_REQUIREMENTS_GAP_MATRIX.md | Not started | Classify candidate functions vs. what exists, value, risk |
| 08_FINAL_AUDIT_AND_ROADMAP.md | Not started | Consolidated findings, roadmap, Extra Intelligence handoff |

## Evidence & inventories

- `evidence/` — supporting raw evidence (e.g. security observation logs)
  as sessions produce it.
- `inventories/` — machine-readable inventories (e.g. `pricing-sources.json`
  when Session 5 produces it).

## Findings summary (as of Session 6)

- **41 findings** recorded (`F001`–`F041`).
- **9 Resolved** this project session: F001–F005, F012–F015.
- **11 Owner-Decision** findings awaiting Dylan's input: F008, F009, F010,
  F011, F017, F024, F029, F030, F031, F032, F033.
- **21 Open** (engineering-only, no owner decision needed): F006, F007,
  F016, F018–F023, F025–F028, F034–F041.
- **9 Resolved** this project session: F001–F005, F012–F015.
- **11 Owner-Decision** findings awaiting Dylan's input: F008, F009, F010,
  F011, F017, F024, F029, F030, F031, F032, F033.
- **20 Open** (engineering-only, no owner decision needed): F006, F007,
  F016, F018–F023, F025–F028, F034–F040.

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
