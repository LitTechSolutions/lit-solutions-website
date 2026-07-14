# `referral-program` — System Requirements

## 1. Overview & Goal

Lets an existing, paying customer refer a new customer in exchange for a
discount/credit for both parties. Business goal: cheap incremental
volume — word-of-mouth in a small, geographically concentrated service
area (Northern Neck of Virginia) compounds faster than paid acquisition,
and this is one of the lowest-effort items in the whole review to build.

## 2. Actors

- **Referrer** — an existing customer (has an account via `myaccount.html`,
  or at minimum appears in the `leads`/`documents` records as a past
  client) who wants to share a referral link/code.
- **New customer (referee)** — arrives via the referral link/code and
  submits a quote or intake, unlocking the reward for both parties once
  they become a paying customer.
- **Dylan (admin)** — approves/tracks reward payouts (this is a discount
  applied manually at invoicing time in v1, not an automated payment — see
  §6).

## 3. Functional Requirements

1. Every account holder (see `myaccount.html`'s existing account system)
   gets a unique, stable referral code (e.g., `LTS-REF-<8 char>`),
   generated on first request and then persisted — not regenerated per
   view.
2. Referral code/link is surfaced in the customer account portal (a new
   "Refer a friend" section alongside Documents/Messages/Favorites).
3. The referral link takes the form
   `https://lit-solutions.tech/intake.html?ref=LTS-REF-XXXXXXXX` (and
   equivalently for `website-designer.html`) — the `ref` query param is
   captured client-side and threaded through to whichever submission
   function the visitor eventually completes (`website-designer`'s quick
   or full submission, or the general `intake`/contact flow).
4. When a referred visitor completes a paid engagement (this is a manual
   trigger by Dylan in v1 — see §6, not an automated "payment succeeded"
   webhook, since there's no such webhook in this codebase today), the
   system marks the referral as **converted** and calculates the reward
   for both parties.
5. Referrer can see, in their account, a simple running list: code shared
   → status (pending / converted / rewarded) for each person they've
   referred (first name / business name only, not full contact details,
   to respect the referee's privacy).
6. Reward mechanics are configurable (not hardcoded), e.g. "$50 credit to
   referrer, 10% off first invoice for referee" — stored as a single
   config record so Dylan can change terms without a code deploy.

## 4. API Contract

`GET /.netlify/functions/referral-program?action=my-code` (authenticated,
customer session required)
→ `{ "code": "LTS-REF-A1B2C3D4", "referrals": [{ "label": "...", "status": "pending|converted|rewarded", "createdAt": ... }] }`
(creates the code on first call if none exists yet)

`POST /.netlify/functions/referral-program` (authenticated, customer or
admin)
```json
{ "action": "record-referral", "code": "LTS-REF-A1B2C3D4", "refereeLabel": "New lead's business name or name" }
```
— called from the intake/quick-quote submission handlers when a `ref`
param was present, to log the attribution without requiring the referrer
to do anything.

`POST /.netlify/functions/referral-program` (admin/staff only, mirrors the
role check in `content.js`)
```json
{ "action": "mark-converted", "referralId": "...", "rewardAmount": 50 }
```
— Dylan marks a referral as converted once the referred customer pays,
which triggers the reward-notification email to the referrer.

## 5. Data Model

New blob store: **`referrals`**.
- Key `code:<userId>` → `{ userId, code, createdAt }` (one code per
  account holder).
- Key `referral:<id>` → `{ id, code, referrerUserId, refereeLabel, status: "pending"|"converted"|"rewarded", rewardAmount, createdAt, convertedAt }`.

A separate small config record, store `content` (reuse the existing
generic content store) with slug `referral-config` → `{ referrerReward, refereeDiscountPct, description }`, editable via a new tab in `admin.html` following the existing `makeListEditorView` pattern used for
posts/portfolio/etc. (though this is a single-record editor, not a list).

## 6. Business Rules & Validation

- **Reward payout is manual in v1.** This codebase has no payment-webhook
  infrastructure (Square/Stripe checkout isn't wired into a function
  today — `payment.html` links out to an external payment page per the
  existing site structure). Automating "referral converts the instant an
  invoice is paid" would require adding that integration first; v1 should
  treat conversion as something Dylan marks manually after confirming
  payment, which is honest about what's actually automatable today.
- A referral code cannot refer the same account that owns it (no
  self-referral) — check by matching `email`/`userId` if the referee also
  creates an account.
- One referral record per (code, refereeLabel) pair to avoid duplicate
  attribution if a submission handler fires the "record-referral" call
  more than once for the same lead.

## 7. Integration Points

- `myaccount.html` — new "Refer a friend" view, following the existing
  `views.X` pattern in that page's router.
- `website-designer.js` and `intake.js` — read a `ref` query param on
  page load, store it (e.g. `sessionStorage`, since a visitor may browse
  multiple pages before submitting), and include it in the quick-quote /
  intake submission payload so the relevant function can call
  `referral-program`'s `record-referral` action server-to-server (Netlify
  Functions can call each other via `fetch` to their own deploy URL, or
  more simply, `website-designer.js`/`intake.js` can call the same
  `record-referral` logic as a shared internal helper rather than an HTTP
  round-trip — implementation detail to decide when built).
- `admin.html` — a small settings panel for reward terms, and a way to
  mark a referral converted (could live in the existing "Customers" tab
  referenced in `admin.html`'s nav).

## 8. Error Handling

- Missing/invalid `ref` code on a submission: fail silently (no error
  surfaced to the customer) — a bad or stale referral code should never
  block a quote/intake submission from going through.
- `mark-converted` on an already-converted referral: idempotent, no-op
  with a clear message rather than double-rewarding.

## 9. Security & Privacy Considerations

- Referee's contact details are never shown to the referrer, only a
  label (first name or business name) and status — the referrer doesn't
  need to see the referee's email/phone.
- `mark-converted` and reward-terms editing require the same
  admin/staff role check pattern already used in `content.js`
  (`session.role !== "admin" && session.role !== "staff"`).

## 10. Non-Functional Requirements

- Low traffic feature — no special performance considerations.
- Referral codes should be short enough to say over the phone (Dylan's
  business is heavily phone-driven per the existing site's "call to
  speed-dial" framing) — 8 alphanumeric characters is a reasonable
  ceiling.

## 11. Open Questions for Dylan

- What should the actual reward amounts/terms be? (Placeholder above:
  $50 credit / 10% off — needs your real numbers before this ships.)
- Is a discount credit applied manually at invoicing acceptable for v1,
  or is automatic payment-integration a prerequisite you'd want built
  first (bigger scope, depends on how you currently take payment)?
