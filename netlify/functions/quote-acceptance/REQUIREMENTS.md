# `quote-acceptance` — System Requirements

## 1. Overview & Goal

Once Dylan has manually confirmed a quote with a customer (by phone/email,
as happens today), this function lets the customer formally accept it
and pay a deposit online, closing the gap between "customer says yes" and
"work starts" without needing full contract/e-signature software.
Deliberately scoped as **lightweight acceptance + deposit collection**,
not a full e-signature/legal-contract platform — see §11 for why, and
what would be needed to go further.

Business goal: shortens the yes-to-start gap on every job, and gives
Dylan a single link to send instead of a manual back-and-forth for
deposit collection.

## 2. Actors

- **Customer**, holding a link Dylan sends after verbally/by-email
  confirming a final quote.
- **Dylan** — generates the acceptance link from a lead's detail view
  (`leads-dashboard`) once terms are settled, and sees when a customer
  has accepted/paid.

## 3. Functional Requirements

1. From a lead's detail view, Dylan enters the **confirmed** final scope
   and price (which may differ from the Website Designer's starting
   estimate — this is expected, since every estimate on this site is
   explicitly "confirmed by us before any work begins") and generates a
   single-use acceptance link.
2. The customer opens the link and sees: the confirmed scope/price in
   plain language, a checkbox-style acceptance ("I agree to proceed at
   this price and scope"), and — if deposit collection is enabled for
   this quote — a deposit amount/percentage due before work starts.
3. Acceptance is recorded with a timestamp and the accepting party's
   name (typed, not a drawn signature — see §11 on why this isn't a legal
   e-signature product).
4. If a deposit is required, accepting redirects to the **existing**
   external payment flow already linked from `payment.html` (this
   codebase does not have its own payment processor integration today —
   this function should not attempt to build one; it hands off to
   whatever Dylan already uses) with the confirmed amount pre-filled
   where the payment provider supports that, or otherwise displays the
   exact amount to enter manually.
5. Once accepted (and paid, if applicable), the lead's status
   automatically advances (via `project-status`, e.g. to
   `"contract_sent"` or directly to `"in_progress"` depending on whether
   deposit payment is confirmed automatically or manually) and Dylan is
   notified.
6. Since this codebase has no payment webhook today, **payment
   confirmation itself remains a manual step** Dylan performs after
   seeing the payment land wherever he already receives it — this
   function tracks *acceptance*, not *confirmed payment*, unless/until a
   real payment-provider integration is added (see §11).

## 4. API Contract

`POST /.netlify/functions/quote-acceptance` (admin/staff only) — generate
```json
{ "leadId": "WD-...", "confirmedScope": "...", "confirmedPrice": 1450, "depositRequired": true, "depositAmount": 300 }
```
→ `201 { "acceptanceId": "QA-...", "acceptanceUrl": "https://lit-solutions.tech/accept-quote.html?token=..." }`

`GET /.netlify/functions/quote-acceptance?token=...` — customer views terms
→ `{ "businessName": "...", "confirmedScope": "...", "confirmedPrice": 1450, "depositAmount": 300, "status": "pending" | "accepted" }`
(`410` if already accepted or expired/revoked)

`POST /.netlify/functions/quote-acceptance` — customer accepts
```json
{ "token": "...", "acceptedByName": "Jane Customer" }
```
→ `200 { "ok": true, "paymentUrl": "https://.../payment.html?..." }` (or
no `paymentUrl` if no deposit required) — this write is authorized by
possession of the single-use token, not a login.

## 5. Data Model

New blob store: **`quote_acceptances`** — key = acceptance id
(`QA-<id>`).
```
{
  id, leadId, confirmedScope, confirmedPrice,
  depositRequired: boolean, depositAmount: number | null,
  status: "pending" | "accepted" | "revoked" | "expired",
  acceptedByName: string | null, acceptedAt: number | null,
  createdAt, expiresAt
}
```
Token itself is a signed value (reuse `createSingleUseToken`/`verify`
from `_lib/auth_utils.js`) encoding the acceptance id, not the id in
plaintext in the URL.

## 6. Business Rules & Validation

- Acceptance is **single-use**: once `status` moves to `"accepted"`, the
  link becomes read-only (still viewable as a receipt/confirmation, but
  the accept action itself can't fire twice).
- Dylan can revoke a pending (not-yet-accepted) acceptance link (e.g., if
  terms change before the customer responds) — a revoked link shows a
  clear "this quote has been updated, please contact us" message rather
  than a bare error.
- Expiry (e.g., 14 days) prevents an old, possibly-stale quote from being
  silently accepted long after terms may have changed in conversation —
  configurable, not hardcoded.

## 7. Integration Points

- `_lib/auth_utils.js` — `createSingleUseToken`/`verify` for the
  acceptance link.
- `_lib/email.js` — sends the acceptance link to the customer, and
  notifies Dylan on acceptance.
- `payment.html` — the deposit hand-off target; this function does not
  replace or modify the existing payment page, just pre-fills/links to
  it with the confirmed amount.
- `project-status` — acceptance should trigger a status advance (§3.5).
- New customer-facing page `accept-quote.html`, matching the existing
  site's page conventions (header/footer, i18n scaffolding via
  `data-i18n`, since this is public-facing content a non-English-speaking
  customer might view).

## 8. Error Handling

- Expired/revoked/already-accepted token: clear, distinct message per
  state (don't collapse all three into one generic "invalid link" error —
  "already accepted" should show the acceptance confirmation, not an
  error at all).
- Missing `acceptedByName`: `400`, require a name for the acceptance
  record to mean anything as a record of who agreed.

## 9. Security & Privacy Considerations

- Token-based access (no login required for the customer side) is a
  deliberate, scoped choice mirroring the existing password-reset and
  (proposed) booking-reschedule pattern — the token only ever grants
  control over one specific acceptance record.
- This is **not a legally binding e-signature** in the DocuSign/HelloSign
  sense (no identity verification, no tamper-evident signature
  certificate) — see §11. Do not represent it as one in the UI copy; use
  plain "I agree to proceed" language, not "sign here."

## 10. Non-Functional Requirements

- No special performance considerations — low volume, simple reads/writes.

## 11. Open Questions for Dylan

- **Scope check**: this spec deliberately stops short of real
  e-signature/contract software (DocuSign-style identity verification,
  tamper-evident audit trail) and real payment-webhook automation
  (Stripe/Square integration confirming payment server-side). Both are
  meaningfully larger undertakings than anything else in this batch. Is
  "lightweight acceptance + manual deposit confirmation" sufficient for
  how you actually operate, or is one of those two a real prerequisite
  you'd want scoped as its own project? Worth deciding before building,
  since it changes this function's shape substantially.
- What's your actual deposit policy (flat amount, percentage, only on
  certain package tiers)? Needed to finalize the acceptance-generation
  UI in `leads-dashboard`.
