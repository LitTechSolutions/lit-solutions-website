# Session 1 — Repository Baseline

Source: an already-completed full-repository + production audit (8 parallel
research passes across architecture, data/pricing, security, content/nav,
SEO, accessibility/performance, privacy/legal/payment, and Website
Designer/intake), plus direct production checks. This document formalizes
those findings into the `docs/audit/` framework with stable `F00x` IDs. No
new repository exploration was performed to produce this file.

## 1. Architecture

- **Framework/build:** no client framework; one dependency (`@netlify/blobs`
  `^8.1.0`, resolved `8.2.0`). No build command — `netlify.toml`
  `[build] publish = "."`. `esbuild` (`node_bundler`) bundles only the
  Netlify Functions at deploy time.
- **Routing:** 34 top-level `.html` files, one per URL, no client router.
  `[[redirects]]`: `/subscriptions.html → /payment.html#subscriptions`
  (301) and a catch-all `/* → /404.html` (404).
- **Shared layout:** header/footer markup is byte-identical copy-paste
  across every page — no include/template mechanism.
- **Styling:** single `css/style.css`, ~1,960 lines / 100KB, custom-
  property design tokens, `:root[data-theme="dark"]` override block.
- **Netlify Functions — 12 real handlers:** `account`, `admin-images`,
  `auth-login`, `auth-logout`, `auth-password-reset`, `auth-register`,
  `auth-verify-email`, `content`, `documents`, `favorites`, `messages`,
  `notifications`, `website-designer`, plus `_lib/` (`auth_utils`,
  `blob_store`, `email`, `verification`).
- **9 spec-only folders** (`REQUIREMENTS.md`, no code): `website-audit`,
  `referral-program`, `quote-session`, `project-status`,
  `project-scaffold-generator`, `booking-scheduler`, `lead-followup`,
  `leads-dashboard`, `quote-acceptance`.
- **Netlify Blobs — 11 stores:** users, sessions, tokens, content, images,
  documents, messages, favorites, notifications, ratelimit, leads.
- **Env vars (6):** `LTS_SESSION_SECRET`, `SITE_ID`, `NETLIFY_BLOBS_TOKEN`,
  `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL`.
- **Test coverage:** zero automated tests anywhere in the repository.

## 2. Findings ledger

IDs assigned in the order first recorded (severity-ordered within the
original single-pass audit). `Owner-Decision` findings require Dylan's
input before any implementation; everything else is a straightforward
engineering fix once prioritized.

| ID | Severity | Status | Domain (session) | Finding | Evidence |
|----|----------|--------|-------------------|---------|----------|
| F001 | Critical | **Resolved** (`9a753a6`) | Content (2) | USS Antietam hull number was CG-64, corrected to CG-54 | `about.html`, all 16 `i18n/*.json` |
| F002 | Critical | **Resolved** (`94a9420`, v3.2.1) | Content (2) | Testimonials/Portfolio hero said "nothing here yet" above real content | `testimonials.html`, `portfolio.html`, `js/cms.js` |
| F003 | High | **Resolved** (`a6912fc`, v3.2.0) | Product/UX (2) | Website Designer live preview used `position:sticky`, could overlap form fields | `website-designer.html`, `css/style.css` |
| F004 | Critical | **Resolved** (`57e124a`, v3.2.2) | Quality (6) | Six `--notice-*` CSS tokens self-referencing; only resolved under dark theme | `css/style.css:55-60` |
| F005 | Critical | **Resolved** (`57e124a`, v3.2.2) | Security (3) | `admin-images.js` GET checked "signed in" only, not role — any customer could read the internal image library | `netlify/functions/admin-images.js:23-46` |
| F006 | Critical | Open | Privacy (3) | Privacy Policy says it "collects only" contact/analytics/local-storage data; app also collects accounts, sessions, messages, documents, leads/briefs, IPs | `privacy.html:151-158` |
| F007 | Critical | Open | Privacy (3) | Resend (email sub-processor) never named in the Privacy Policy | `privacy.html`; `netlify/functions/_lib/email.js` |
| F008 | Critical | Open — **Owner-Decision** | Content/IA (2) | Gallery is empty ("Nothing posted yet") with full header + footer nav prominence | `gallery.html` |
| F009 | Critical | Open — **Owner-Decision** | Content/IA (2) | Booking says "coming soon" with full header + footer nav prominence | `booking.html` |
| F010 | Critical | Open — **Owner-Decision** | Content (2) | Pricing comparison table cites "independent 2026 market research" with no source/citation anywhere | `pricing.html:222-238` |
| F011 | High | Open — **Owner-Decision** | Payments (5) | Square "Terms" checkbox only gates payment client-side; raw Square links sit in page source and can be reached directly | `payment.html:174,223,239`; `js/main.js:246-255` |
| F012 | High | **Resolved** (`57e124a`, v3.2.2) | Security (4) | Website Designer logo/photo uploads had no server-side MIME validation on a public endpoint | `netlify/functions/website-designer.js` (upload handling) |
| F013 | High | **Resolved** (`57e124a`, v3.2.2) | Pricing (5) | Website Designer backend trusted client-submitted totals with no recomputation | `netlify/functions/website-designer.js` (submission handlers) |
| F014 | High | **Resolved** (`57e124a`, v3.2.2) | Security (3) | `messages.js` had no rate limit on customer message-sending | `netlify/functions/messages.js` |
| F015 | High | **Resolved** (`57e124a`, v3.2.2) | Security (3) | `auth-register.js` leaked account enumeration via a distinct "already exists" response | `netlify/functions/auth-register.js` |
| F016 | High | Open | Quality (6) | Zero automated tests anywhere, including pricing/discount math | whole repo |
| F017 | High | Open — **Owner-Decision** | Content (2) | 14+ distinct CTA phrasings in use for one conceptual "get a quote" action | site-wide |
| F018 | High | Open | Content/UX (2) | Intake form instructs users to "just type 4" for inapplicable fields | `intake.html:145,159`; `js/intake.js:124` |
| F019 | Medium | Open | SEO (6) | Testimonials/Portfolio `<meta name="description">` will read stale ("no reviews yet") even after F002's visible-copy fix, since the JS swap doesn't touch meta tags | `testimonials.html:16`, `portfolio.html:16` |
| F020 | Medium | Open | SEO (6) | Byte-identical LocalBusiness JSON-LD on 31 pages; no Service/FAQPage/Article/BreadcrumbList schema anywhere | site-wide |
| F021 | Medium | Open | SEO (6) | Portfolio card renderer hardcodes `alt=""` despite title/description being available; Gallery's renderer does this correctly | `js/cms.js` (portfolio render fn) |
| F022 | Medium | Open | Accessibility (6) | No `aria-live` region on the Website Designer's live price ticker | `website-designer.html`, `js/website-designer.js` |
| F023 | Medium | Open | Accessibility (6) | RTL sets `dir="rtl"` correctly but the stylesheet has no logical-property/`[dir]` rules — layout doesn't mirror | `css/style.css` |
| F024 | Medium | Open — **Owner-Decision** | Content (2) | Patch Notes reads as raw internal engineering changelog, not customer-facing copy | `patch-notes.html` |
| F025 | Medium | Open | Performance (6) | `logo-full.png` is 156KB, large for a logo asset | `assets/logo-full.png` |
| F026 | Medium | Open | Accessibility (6) | Form errors (Contact, Intake) have no `aria-invalid`/`aria-describedby`/`role="alert"` | `js/intake.js:93-124` |
| F027 | Low | Open | Security (3) | Rate limiter has a minor non-atomic TOCTOU race; admin image MIME allowlist doesn't exclude `image/svg+xml` | `_lib/auth_utils.js:132-143`; `admin-images.js` |
| F028 | Low | Open | Accessibility (6) | No `aria-haspopup` on nav dropdown toggles (expanded/controls present and functional) | `index.html` header |
| F029 | Medium | Open — **Owner-Decision** | Content/IA (2) | Navigation may have too many equal-priority top-level choices; a simplified hierarchy needs Dylan's sign-off | header/footer nav, all pages |
| F030 | Medium | Open — **Owner-Decision** | Privacy (3) | American Heroes Discount verification currently accepts DD-214/LES documents by email; sensitivity/retention approach needs a decision | `heroes-pricing.html` |
| F031 | Medium | Open — **Owner-Decision** | Payments (5) | Full-payment-upfront policy for all fixed-price projects; deposit/milestone alternative for larger custom projects is a business-policy question | `terms.html §3`, `payment.html` |
| F032 | Medium | Open — **Owner-Decision** | Pricing (5) | Website Care Plan / Small Business IT Support subscription scope (edit counts, support hours, carryover) is undefined | `payment.html:210-251` |
| F033 | Low | Open — **Owner-Decision** | Product (7) | Whether every account-system feature (documents, messages, notifications, favorites, saved searches) earns its complexity/security surface, and whether registration should stay open-public | `myaccount.html`, account-related functions |
| F034 | Low | Open | Architecture (1) | "Website Version" string hardcoded in all 33 page footers, no shared source — every release needs a manual sweep | site-wide footers |
| F035 | Medium | Open | Data integrity (1/5) | Base prices ($699/$1,299) duplicated across 4 files; Heroes-discount dollar amounts hand-computed and re-typed in 2 files rather than derived | `starter-catalog.json`, `business-catalog.json`, `js/website-designer.js:736`, `pricing.html`, `heroes-pricing.html`, `payment.html` |
| F036 | Info | Open | Data integrity (1) | Founder biography duplicated across 5 source locations × 16 languages (~80 strings) for one fact set | `about.html`, `index.html`, `team.html`, `testimonials.html` + `i18n/*.json` |

## 3. Confirmed strengths (not findings — carried forward so later sessions don't re-flag them)

- Session/auth fundamentals: scrypt+salt hashing, `HttpOnly/Secure/
  SameSite=Lax` cookies, real server-side session revocation, all-session
  invalidation on password/email change.
- Server-side ownership checks on documents, messages (aside from F014,
  now resolved), notifications, and favorites — not just hidden in the UI.
- Website Designer's PDF and on-screen total call the same JS pricing
  functions — no separate/duplicate calculation to drift.
- Reduced-motion support is comprehensive (one global override).
- Translation architecture (client-side, on-demand per-language fetch) is
  solid infrastructure, not a liability.

## 4. Not yet verified (flagged for the relevant later session, not assumed)

- Live-browser accessibility testing (current findings are static-code-read
  only) — Session 6.
- Structured-data validation via an actual schema validator (findings above
  are from reading/diffing JSON-LD blocks, not running Rich Results Test)
  — Session 6.
- Full end-to-end Square payment flow behavior in production — Session 5.
