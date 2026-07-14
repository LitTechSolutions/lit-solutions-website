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
| 03_IDENTITY_DATA_SECURITY.md | Not started | Auth, authorization, sessions, customer data, privacy |
| 04_BACKEND_INTEGRATIONS.md | Not started | Every Netlify Function, forms, files, email/PDF, providers |
| 05_PRICING_AND_BUSINESS_RULES.md | Not started | Website Designer, pricing/discount logic, plans, payments |
| 06_QUALITY_AUDIT.md | Not started | Accessibility, mobile, performance, SEO, translation, quality states |
| 07_REQUIREMENTS_GAP_MATRIX.md | Not started | Classify candidate functions vs. what exists, value, risk |
| 08_FINAL_AUDIT_AND_ROADMAP.md | Not started | Consolidated findings, roadmap, Extra Intelligence handoff |

## Evidence & inventories

- `evidence/` — supporting raw evidence (e.g. security observation logs)
  as sessions produce it.
- `inventories/` — machine-readable inventories (e.g. `pricing-sources.json`
  when Session 5 produces it).

## Findings summary (as of Session 2)

- **37 findings** recorded (`F001`–`F037`).
- **9 Resolved** this project session: F001–F005, F012–F015.
- **11 Owner-Decision** findings awaiting Dylan's input: F008, F009, F010,
  F011, F017, F024, F029, F030, F031, F032, F033.
- **17 Open** (engineering-only, no owner decision needed): F006, F007,
  F016, F018–F023, F025–F028, F034–F037.

Session 2 added F037 (homepage's primary "quote" CTA links to the wrong
form) and expanded F017 with a full CTA evidence table; F008, F009,
F010, F018, F024, and F029 were re-checked against current source and
remain accurate as recorded.
