# `quote-acceptance` — System Requirements

> **Revised after Dylan's answers (2026-07-14).** The real workflow is:
> Dylan sends a DocuSign envelope (invoice + contract) → both parties
> sign in DocuSign → customer pays the **full amount up front** (not a
> deposit) → work begins. Dylan wants full e-signature/payment
> automation, but currently only has **manual web-app access to
> DocuSign** (no API/developer plan). This changes the spec from the
> original "lightweight custom acceptance" design into a two-phase plan
> below — read §11 before scoping any build work here.

## 1. Overview & Goal

Closes the gap between "customer says yes" and "work starts" by making
the existing DocuSign-based accept-and-pay-in-full step a tracked part of
the lead pipeline, instead of something that happens entirely outside the
system (Dylan currently has no way to reflect "sent for signature" /
"signed and paid" status anywhere in `leads`/`project-status`).

Business goal: shortens the yes-to-start gap, and — once Phase 2 (§11) is
in place — removes a genuinely manual, error-prone step (Dylan
remembering to check DocuSign and his payment records, then separately
updating the lead) from every single job.

## 2. Actors

- **Customer** — receives a DocuSign envelope from Dylan, signs it, pays
  the full invoiced amount, and work begins.
- **Dylan** — today, manages this entirely inside DocuSign's web app plus
  his own payment tracking; this function's job is to give that process
  a home inside `leads-dashboard`/`project-status` rather than replace
  DocuSign itself.

## 3. Functional Requirements (Phase 1 — buildable now, no new cost)

Phase 1 does **not** integrate with DocuSign's API (Dylan doesn't have
API access on his current plan — see §11). It's a tracking companion to
his existing manual process:

1. From a lead's detail view (`leads-dashboard`), once Dylan has sent a
   DocuSign envelope through DocuSign's own website as he does today, he
   marks the lead **"Sent for signature"** in the LTS admin panel,
   optionally noting the confirmed final price (which may differ from
   the Website Designer estimate — expected, since every estimate on
   this site is explicitly "confirmed by us before any work begins").
2. Once DocuSign confirms both parties have signed (Dylan sees this in
   his DocuSign inbox, as today) and the customer's full payment has
   landed (wherever Dylan currently receives it), Dylan marks the lead
   **"Signed & paid in full"** in the admin panel.
3. Marking "Signed & paid in full" automatically advances the lead's
   status (via `project-status`) to `"in_progress"` and notifies the
   customer that work is starting.
4. This phase adds **no new customer-facing page and no DocuSign API
   calls** — it is purely two new buttons/fields in the existing
   `leads-dashboard` lead-detail view, plus the status-advance side
   effect. Low effort, no new cost, no new external dependency.

## 3a. Functional Requirements (Phase 2 — requires a DocuSign API-enabled plan)

Only build this phase if/when Dylan upgrades to a DocuSign plan with
eSignature REST API access (see §11 — this has a real cost implication
to confirm first):

1. Dylan generates the DocuSign envelope **from inside `leads-dashboard`**
   instead of DocuSign's own website — pre-filled with the customer's
   name/email and the confirmed price, using the DocuSign eSignature API
   (`envelopes:create`).
2. DocuSign Connect (DocuSign's webhook mechanism) notifies this function
   when the envelope is completed (both parties signed) — no more manual
   "I saw it in my inbox" step.
3. **Payment**: DocuSign has an optional add-on ("DocuSign Payments")
   that can collect payment as part of the signing flow, integrating
   with a processor like Stripe. If Dylan's plan/workflow uses this,
   the webhook payload includes payment confirmation and the full
   automation described in §11's "want full automation" answer is
   achievable end-to-end. If DocuSign Payments is *not* in use (payment
   happens via a separate invoice/link outside DocuSign), full payment
   confirmation still requires either a separate payment-processor
   webhook (Stripe/Square) or a manual confirmation step — **this
   codebase does not currently know which of these describes Dylan's
   actual payment mechanism, and that needs to be confirmed before
   Phase 2 can be fully scoped** (see §11).
4. Once both signature-complete and payment-confirmed signals are
   received, status advances to `"in_progress"` automatically, with no
   manual admin click required at all.

## 4. API Contract

**Phase 1:**

`POST /.netlify/functions/quote-acceptance` (admin/staff only)
```json
{ "leadId": "WD-...", "action": "mark-sent", "confirmedPrice": 1450 }
```
```json
{ "leadId": "WD-...", "action": "mark-signed-and-paid" }
```
→ `200 { "ok": true }`; triggers the `project-status` advance in both
cases (to e.g. `"contract_sent"` and `"in_progress"` respectively).

**Phase 2 (additive, once scoped):**

`POST /.netlify/functions/quote-acceptance` (admin/staff only) — generate
and send envelope via DocuSign API instead of manually.

`POST /.netlify/functions/quote-acceptance-webhook` (DocuSign Connect
callback, authenticated via DocuSign's HMAC signature verification, not
this codebase's normal session auth) — receives envelope-completed and
(if applicable) payment-confirmed events.

## 5. Data Model

Extends existing **`leads`** records (no new store needed for Phase 1):
```
{
  ...existing fields...,
  acceptance: {
    stage: "not_sent" | "sent_for_signature" | "signed_and_paid",
    confirmedPrice: number | null,
    sentAt: number | null,
    completedAt: number | null
  }
}
```
Phase 2 would add a `docusignEnvelopeId` field to this same object once
real API integration exists.

## 6. Business Rules & Validation

- `mark-signed-and-paid` should only be reachable after `mark-sent` has
  happened for that lead (Phase 1 has no way to verify this server-side
  since DocuSign isn't integrated yet — this is a soft UI-level ordering,
  not enforceable business logic, until Phase 2).
- Every transition in Phase 1 is a deliberate, manual admin action —
  there is no customer-facing step in Phase 1 at all (unlike the
  original lightweight-acceptance design, which had a public
  `accept-quote.html` page; that page is **not** part of Phase 1, since
  DocuSign itself is already the customer-facing acceptance surface).

## 7. Integration Points

- `leads-dashboard` — Phase 1 lives entirely here as two new actions on
  the lead-detail view.
- `project-status` — both Phase 1 actions trigger a status advance.
- `_lib/email.js` — notify the customer when "Signed & paid in full" is
  marked (work is starting).
- Phase 2 only: DocuSign eSignature REST API + DocuSign Connect webhooks;
  possibly Stripe/Square if payment isn't handled via DocuSign Payments
  (see §3a.3).

## 8. Error Handling

- Phase 1 is simple admin-panel state transitions — the main failure
  mode is Dylan clicking the wrong button; make both actions easily
  reversible (a lead can be moved back a stage by staff, consistent with
  `project-status`'s own "corrections allowed" rule).

## 9. Security & Privacy Considerations

- Phase 1: admin/staff-only, same role-check pattern as `content.js` —
  no new customer-facing surface, so limited new attack surface.
- Phase 2: DocuSign Connect webhook payloads must be signature-verified
  (DocuSign provides an HMAC mechanism) before being trusted — treat this
  the same way any inbound webhook from a third party should be treated,
  never accept an unverified payload as authoritative.

## 10. Non-Functional Requirements

- Phase 1 has no performance considerations of note.
- Phase 2's webhook endpoint needs to respond quickly (DocuSign expects a
  timely 200) — do the actual status-advance/notification work
  asynchronously if it risks being slow, acknowledging the webhook first.

## 11. Decisions & Open Items (resolved/updated 2026-07-14)

- **Confirmed: full payment up front, not a deposit.** The original
  spec's "deposit" framing throughout is replaced by "full payment before
  work begins" everywhere in this revised document.
- **Confirmed: Dylan wants full e-signature/payment automation** as the
  end goal — but he currently has **manual web-app-only DocuSign access**,
  no API/developer plan. True automation (Phase 2) requires upgrading to
  a DocuSign plan with eSignature REST API access, which has a real
  monthly cost increase over his current plan — **this is a decision for
  Dylan to make (is the automation worth the plan upgrade?) before Phase
  2 is scoped further**, not something to build around silently.
- **Recommended path**: ship Phase 1 now (real value, zero new cost, a
  few hours of work) as the immediate improvement, and treat Phase 2 as
  its own future decision once the DocuSign plan-upgrade cost/benefit is
  weighed.
- **Still needed before Phase 2 could be fully scoped**: does Dylan's
  actual payment collection happen *through* DocuSign (i.e., would he
  also adopt DocuSign Payments), or via a separate invoice/payment link
  outside DocuSign? This determines whether Phase 2 needs a second
  payment-processor integration (Stripe/Square) in addition to the
  DocuSign API, or whether DocuSign's webhook alone covers both
  signature and payment confirmation.
