# Care Hub Privacy Policy — DRAFT

> **This is a draft for attorney and owner review. It is not published
> anywhere, not linked from the app, and not binding. Do not treat any
> sentence below as final legal wording.** It is built directly from
> `DATA_FLOW_AND_SUBPROCESSORS.md` in this same folder — every claim
> below should trace back to a real table, store, or dependency, not an
> assumption.
>
> Last drafted: 2026-07-15 (Session 20, step 9). Version stamp for this
> draft: `care-hub-privacy-v0-draft` — replace with a real
> `CURRENT_PRIVACY_VERSION` value once approved and wired into
> `consent_records`.

---

## LTS Business Care Hub — Privacy Policy

*Applies to the Little Technical Solutions LLC Care Hub
(`/care-hub/`) and its supporting account, ticket, checklist, and
document features. This is separate from, and additional to, the
general privacy policy for the public lit-solutions.tech website.*

### 1. Who we are

Little Technical Solutions LLC ("we," "us") operates the Care Hub as a
private, invitation-only customer and staff portal. Contact:
dylan@lit-solutions.tech.

### 2. What we collect

Because the Care Hub is an account-based service (not a public
marketing page), it collects more than the public site does. This is
everything, organized by why it exists:

**To create and secure your account:**
name, email, password (stored as a salted hash, never in plain text),
your organization and role within it, session/login records, and — for
administrator accounts — a two-factor authentication (TOTP) secret,
stored encrypted, and one-time recovery codes, stored as irreversible
hashes.

**To deliver the services you or your organization request:**
support tickets you submit (subject, description, status history,
internal notes from our staff), readiness checklist answers, service
records, files and documents you upload, messages exchanged with our
staff, approval requests, scope-of-work documents, change orders, and
records of technology assets and website services we maintain for you.

**To bill you (if applicable):**
payment request records and a reference ID from our payment processor.
**We never collect or store your card number, CVV, or bank account
details** — those go directly to our payment processor, Square, when
that integration is live (see §5).

**To keep the platform secure and working correctly:**
an internal audit log of account and record changes (who did what,
when), rate-limiting records tied to IP address (used only to slow
down abuse, not to build a profile of you), and aggregate operational
metrics.

**To ask your permission:**
a record of whether and when you accepted these terms and this policy,
and whether you separately opted in to marketing communications.

### 3. What we do not collect

We do not collect advertising or cross-site tracking cookies. We do not
sell your personal information. We do not currently use any AI system
to process your data — if that changes, this policy will be updated
before it does, and you'll be told what data an AI feature uses before
you use it.

### 4. How we use it

Solely to operate the Care Hub for you and your organization: to
authenticate you, respond to and track support requests, deliver the
services you're a customer for, bill you, keep the platform secure, and
meet our own legal/recordkeeping obligations. We do not use your Care
Hub data for advertising, and we do not build a marketing profile from
it beyond the marketing opt-in you explicitly give us.

### 5. Who we share it with (sub-processors)

We use a small number of third-party services to run the Care Hub.
None of them are permitted to use your data for their own purposes —
they process it only to provide their service to us.

| Who | What they handle |
|---|---|
| **Netlify** | Hosting, the serverless functions that power the Care Hub, and (for the legacy parts of the platform) file/message storage. |
| **Neon** | Our database provider — stores the account, ticket, checklist, and other records described in §2. |
| **Resend** | Sends transactional emails on our behalf (invitations, notifications, ticket updates). Resend does not see your Care Hub data beyond the content of an email we ask it to send. |
| **Square** | *(Planned, not yet active.)* When live, Square will process card payments directly — we will never see or store your card details. |

We do not sell your information, and we do not share it with anyone
else except where required by law.

### 6. How long we keep it

We're working toward these retention targets (not all are automated
yet — see the launch checklist for what's still manual):

- Files/records for a closed account: deleted after 30 days.
- Abandoned leads: deleted after 12 months of inactivity.
- Closed support tickets: retained 24 months, then deleted.
- Financial/payment records: retained 7 years (standard recordkeeping
  requirement), then deleted.
- Backups: rolling 90-day window.

### 7. Your choices

You can ask us to review, correct, or delete your account data at any
time by contacting dylan@lit-solutions.tech. Marketing communications
are opt-in and you can opt out at any time. Because the Care Hub is
invitation-only, we don't offer self-service account deletion yet —
this is tracked as a launch gap in the checklist.

### 8. Security

Passwords are hashed, never stored in plain text. Administrator
accounts require two-factor authentication. All connections use HTTPS.
Two-factor secrets are encrypted at rest. We do not store payment card
data.

### 9. Children

The Care Hub is a business service and is not directed at, or intended
for use by, anyone under 18.

### 10. Changes to this policy

If we materially change what we collect or who we share it with, we'll
update this page and, for material changes, ask you to re-accept it
before continuing to use the Care Hub.

---

## Drafting notes (remove before publishing — not part of the policy)

- **Open items this draft deliberately does not resolve**: whether
  Care Hub users get a self-service data export/delete flow; whether
  this policy gets merged into the main site's `privacy.html` or stays
  separate; the actual object-storage provider for uploaded files
  (`OWNER_DECISIONS.md` still lists this as undecided).
- **Do not publish this until F006/F007 (the two open Critical audit
  findings against the *existing* `privacy.html`) are also addressed**
  — otherwise the platform ends up with one accurate policy and one
  known-inaccurate one live at the same time, which is worse than the
  status quo.
- Retention periods in §6 are Dylan's approved targets
  (`DECISION_LOG.md`, Session 17) but are not yet enforced by any
  automated deletion job — an attorney should confirm whether stating
  them as current fact is acceptable before that automation exists, or
  whether softer language ("we aim to," "our policy is to") is needed
  in the interim.
