# Session 3 — Identity, Data & Security

Scope: authentication, authorization, sessions, customer data, and
privacy. No code changes were made in this session — findings and
evidence only, per `00_AUDIT_CONTROL.md`. Read for this session:
`00_AUDIT_CONTROL.md`, `AUDIT_STATE.json`, `01_REPOSITORY_BASELINE.md`,
`02_PUBLIC_SITE_AUDIT.md`, and: `_lib/auth_utils.js`, `_lib/blob_store.js`,
`_lib/email.js`, `_lib/verification.js`, `auth-login.js`,
`auth-register.js`, `auth-password-reset.js`, `auth-verify-email.js`,
`account.js`, `admin-images.js` (spot-check of F005/F027), `documents.js`
(spot-check of ownership pattern), `privacy.html`, `heroes-pricing.html`.

## 1. Confirmed strengths (carried forward, not re-flagged)

- `_lib/auth_utils.js`: scrypt password hashing with per-password salt,
  `crypto.timingSafeEqual` on both password verification and HMAC
  signature checks (no timing side-channel), `HttpOnly; Secure;
  SameSite=Lax` session cookies, server-side session store (not a bare
  JWT — sessions are individually revocable), single-use expiring tokens
  for verification/reset with a `used` flag checked on redemption.
- `auth-login.js`: constant-shape response whether or not the account
  exists (`genericError`, line 25) — no user-enumeration via sign-in.
- `auth-register.js`: identical response for new vs. already-registered
  email (`GENERIC_MESSAGE`), with the existing-account holder notified by
  email instead of leaking a different response — F015's fix confirmed
  still in place.
- `admin-images.js:27` — F005's fix confirmed in place: the
  `session.role !== "admin" && session.role !== "staff"` check now sits
  above the GET/POST branch, gating reads and writes alike.
- `documents.js:57` — ownership check (`record.customerId !==
  session.userId`) confirmed present and correctly gates non-staff
  access. Spot-check only; full review of this file is Session 4's
  scope.
- Password-reset and account-update both revoke all of the user's
  existing sessions after a credential change (`revokeAllSessionsForUser`
  in `auth-password-reset.js:63`, `account.js:91,105`) — a stolen session
  cookie can't survive a password/email change.

## 2. New finding: F038 — password-reset never actually emails the user

- **Severity:** High
- **Status:** Open
- **Domain:** Identity/Security (Session 3)

`auth-password-reset.js:26-38` (the `"request"` action) generates and
stores a single-use reset token, but never calls `sendEmail()` to
deliver it. The comment at lines 32-36 reads: *"SEND_RESET_EMAIL: email a
link like `https://{domain}/admin.html#reset?token=<resetToken>` to
`email` here. Until that's wired up, find the token in the Netlify Blobs
dashboard ... and build the link yourself."*

This is a real functional gap, not a configuration question — the exact
mechanism this comment describes as missing already exists and is
already used, in the same file family, by `_lib/verification.js:21-33`
(`sendVerificationEmail`), which calls the same `sendEmail()` helper with
a real link (`myaccount.html#verify?token=...`) and works end-to-end
whenever `RESEND_API_KEY`/`EMAIL_FROM` are configured (and no-ops safely
if they aren't, per `_lib/email.js:24-27` — so there's no environment
reason this couldn't have shipped the same way).

**Impact:** a real customer who forgets their password and clicks
"forgot password" gets told *"If that email is registered, a reset link
has been generated"* — but no email ever arrives. The only way to
actually complete a reset today is for Dylan to manually find the token
in the Netlify Blobs dashboard and hand-build the link, per the code
comment's own admission. This is the one auth flow in the whole system
that doesn't work unattended for a real customer, in a codebase where
every comparable flow (verify-email) already does.

**Note also:** the comment's example link (`admin.html#reset?token=...`)
points at the staff sign-in page, not `myaccount.html` (the customer
account page) — even if the email were wired up today by copying the
comment literally, it would send customers to the wrong page. The
correct pattern to follow is `verification.js:24`'s
`myaccount.html#verify?token=...`, not the comment's own example.

## 3. New finding: F039 — account-preference language list stuck at 4 of 16 real languages

- **Severity:** Medium
- **Status:** Open
- **Domain:** Identity/Customer data (Session 3)

`account.js:19` — `VALID_LANGUAGES = ["en", "es", "fr", "de"]` — rejects
any `update-preferences` request setting `language` to a value outside
this list of 4. `myaccount.html:667` mirrors the same 4-item list in the
`LANGUAGES` array driving the profile-settings dropdown, so frontend and
backend agree with each other — but both disagree with reality: the
site's actual language system (`js/i18n.js`, the header dropdown)
supports **16** languages (English plus Spanish, French, Chinese,
Japanese, Vietnamese, Filipino, Arabic, Korean, German, Haitian Creole,
Portuguese, Russian, Italian, Polish, Hindi).

This is a distinct feature from the site-wide language switcher (which
correctly offers all 16 and works for anonymous and signed-in visitors
alike) — this is specifically the signed-in account's own stored
language *preference* field, which appears to predate the expansion to
16 languages and was never updated alongside it. A Vietnamese-, Arabic-,
or Hindi-speaking customer (three of this site's supported languages)
cannot set their account preference to their own language even though
the header dropdown right above the account page can display the whole
site in it.

## 4. F006 / F007 — re-verified against current source, unchanged

`privacy.html:151-158` still states data collection is limited to three
categories (contact/project forms, cookie-free analytics, local
storage-only theme preference) with no mention of: customer accounts
(email, name, password hash), documents (invoices/receipts uploaded per
customer), the two-way customer/staff message thread, favorites/saved
searches/recently-viewed, in-app notifications, or IP addresses (used
for rate limiting and stored directly on `leads` records per
`_lib/blob_store.js:26-29`'s own store-layout comment). F006 stands
exactly as recorded — Critical, Owner-Decision-adjacent in that Dylan
needs to decide how much detail to add, but the gap itself is not in
question.

`_lib/email.js` sends real customer PII (names, email addresses, and in
`documents.js`'s case, file attachments) through Resend's API for every
verification, reset (once F038 is fixed), and message-notification email
— `privacy.html` §3 names only Netlify and Square as processors. F007
stands exactly as recorded.

## 5. F030 — re-verified, unchanged

`heroes-pricing.html:179,190,278` confirms the Heroes Discount still
asks for DD-214/LES/employment-verification documents by email, with no
policy stated anywhere for how long these specific sensitive documents
are retained beyond `privacy.html`'s generic "as long as reasonably
necessary" line. No change to F030's status or severity — still an
Owner-Decision item, now with the specific privacy-policy gap (§4 above)
as directly relevant context for whatever decision Dylan makes.

## 6. Minor observations (not separately numbered — informational)

- `auth-password-reset.js:49-55` and `auth-verify-email.js:32-38` and
  `account.js:25-33` each do a full linear scan of every record in the
  `users` store to find a match by internal `id` (since `users` is keyed
  by email, not id). At this business's current scale this is not a
  security issue, just a scalability note — worth a mention if/when the
  customer base grows large enough for `list()` to become slow, not
  worth a tracked finding today.
- `account.js`'s file header comment says *"lets the signed-in admin
  update their own email and/or password"* — the code is not actually
  role-gated and works correctly for any signed-in user (customer or
  staff), which is the right behavior for a self-service account page;
  the comment is just stale/misleading about who it applies to. Not
  worth a tracked finding — noted here in case a future session's
  comment-accuracy sweep wants it.

## 7. Findings ledger addition

| ID | Severity | Status | Domain (session) | Finding | Evidence |
|----|----------|--------|-------------------|---------|----------|
| F038 | High | Open | Identity/Security (3) | Password-reset request never emails the reset link; only verification email is actually wired to `sendEmail()` | `auth-password-reset.js:26-38`; contrast `_lib/verification.js:21-33` |
| F039 | Medium | Open | Identity/Customer data (3) | Account-preference language list hardcoded to 4 of 16 real supported languages | `account.js:19`; `myaccount.html:667` |

## 8. Not yet verified (flagged for a later session)

- Full review of `documents.js`, `messages.js`, `favorites.js`,
  `notifications.js` beyond the ownership-check spot-check above — full
  scope of Session 4.
- Live/functional testing of the password-reset and email-verification
  flows end-to-end (this session was a static-code read) — Session 6.
