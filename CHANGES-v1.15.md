# v1.15 — Customer Accounts & Document History — What Changed

## New: customer self-service accounts
Added a public customer portal at `/myaccount.html`, linked from a small
person-icon in the header of every page (next to the search icon). Anyone
can now register their own account — separate and distinct from your staff
login at `/admin.html`.

Customer accounts can:
- **Sign up and sign in** — open registration (rate-limited against spam),
  every new account defaults to role `customer` with zero staff/admin
  capability — there's no path from customer registration to admin access
- **View their invoices, receipts, and paperwork** — a dashboard listing
  every document you've uploaded and attached to their account, with
  amount, status (paid/unpaid), date, and a download link for any attached
  file (PDF or image)
- **Manage their own login** — change their own email or password, the
  same self-service flow your Account Settings tab already had

This isn't a billing engine — payments still happen through Square on
`payment.html` exactly as before. It's a record locker: you upload a copy
of what a customer was invoiced or charged, and they can find it later
without emailing to ask.

## New: Customer Documents tab in the admin panel
From `admin.html`, look up any registered customer by email and:
- Upload a document — title, type (Invoice/Receipt/Paperwork/Other),
  amount, status, date, notes, and an optional PDF/image attachment
- See everything already uploaded for that customer, and delete any of it

The customer must have registered an account first — there's no way to
attach a document to an email address with no account, by design (it
prevents typo'd emails from silently attaching paperwork to the wrong
person, or to no one).

## Security: cross-customer access is blocked server-side
A customer can only ever see their own documents — enforced by checking
the signed-in session's account ID against the document's owner on every
request, not just by hiding the UI. Verified directly: registered two real
customer accounts, uploaded a document for one, and confirmed over real
HTTP that the second account gets a 403 trying to view it by ID or in
their list, and that non-staff accounts can't upload documents at all.

## Changed
- `auth-register.js` — registration is now open to anyone (previously
  locked to a single bootstrap account for the admin-only setup flow from
  v1.14). New accounts still default to `customer` role and can never
  self-promote; the one-time manual promotion to `admin` via the Netlify
  Blobs dashboard is unchanged and still the only way to create staff access

## New files
- `myaccount.html` — the customer portal
- `netlify/functions/documents.js` — document upload/list/view/delete,
  with server-side ownership enforcement

## Verification performed
- Extended the existing mock test suite (in-memory Netlify Blobs) to cover
  open registration, document upload/list/view/delete, and — most
  importantly — cross-customer access denial: 59/59 checks passing
- Re-verified the customer-facing parts over real HTTP against the actual
  function code (not the mock): registered two separate real customer
  accounts, had the admin upload a document for one, confirmed that
  customer sees it, and confirmed the other customer is blocked (403) from
  viewing it by ID or seeing it in their own list
- All function files pass `node --check`; 0 broken internal links across
  all pages

## Things that need your attention
1. **No email delivery for customer accounts either** — same limitation as
   staff password reset (see `README_ADMIN_SETUP.md`). A customer who
   forgets their password needs to call or email you directly for now.
2. **A customer must register before you can attach documents to them** —
   if you try to upload for an email with no account yet, it'll tell you
   so. Have them sign up at `myaccount.html#register` first.
