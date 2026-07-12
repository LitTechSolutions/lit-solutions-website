# v1.16 — Email Verification & Two-Way Messaging — What Changed

## New: email verification (anti-bot for open registration)
Registration on `myaccount.html` is open to the public, which needed a real
defense against junk/bot signups:

- New accounts start unverified and **cannot sign in** until they click the
  link in a verification email — this is the actual gate, not just a
  cosmetic banner
- A "Resend verification email" link appears automatically if someone tries
  to sign in before verifying
- Verification links are single-use and expire after 24 hours
- Sending is via [Resend](https://resend.com) — one HTTP call, no SDK. If
  you haven't set up an API key yet, verification still works end-to-end;
  the link just gets logged instead of emailed, and you retrieve the token
  from the Netlify Blobs dashboard (see `README_ADMIN_SETUP.md`)

## New: two-way messaging between customers and staff
Customers can now message you directly from their account, and you can see
and reply from yours — a real conversation thread, not a one-off form:

- **Customers** (`myaccount.html#messages`) — send a message, see the full
  back-and-forth with timestamps
- **Staff** (`admin.html#customers`) — a Customer Inbox shows every
  conversation with unread counts, newest first; look up any customer to
  read and reply to their thread
- If `ADMIN_NOTIFY_EMAIL` is set, you get emailed when a customer messages
  you; customers always get emailed when you reply (if email is configured)
- This is separate from the existing Contact page form, which is unchanged
  and still there for anonymous visitors who don't want an account

## Changed: admin.html's Customers tab
The old "Customer Documents" tab is now just **Customers** — one email
lookup drives both a Documents panel (unchanged from v1.15) and the new
Messages panel, plus a Customer Inbox at the top so you don't need to
already know who messaged you.

## Security: verified server-side, not just in the UI
- Unverified accounts are blocked from signing in by `auth-login.js`
  itself — there's no client-side-only check to work around
- A customer can only ever read/send in their own message thread — checked
  against the signed-in session's account ID on every request, the same
  pattern already used for documents
- Verified directly over real HTTP: registered an account, confirmed sign-in
  is blocked (403, `code: "unverified"`) until the real verification token
  is confirmed, then confirmed sign-in works; registered two customers and
  confirmed the second can't see the first's messages by any path

## New files
- `netlify/functions/_lib/email.js` — shared Resend-based email sender,
  no-ops gracefully if not configured
- `netlify/functions/_lib/verification.js` — shared "send a verification
  email" helper used by registration and resend
- `netlify/functions/auth-verify-email.js` — confirm + resend actions
- `netlify/functions/messages.js` — the messaging endpoint

## Verification performed
- Extended the mock test suite (in-memory Netlify Blobs) to cover the full
  verification lifecycle (blocked login, garbage token, real token, reused
  token, resend) and the full messaging lifecycle (send, cross-customer
  isolation, staff inbox, unread counts, read receipts): 82/82 checks passing
- Re-verified end-to-end over real HTTP against the actual function code:
  registered an account, confirmed login was blocked, fetched the real
  token, confirmed, promoted to admin, signed in; registered and verified a
  real customer account, sent a message, confirmed it appeared in the staff
  inbox with the correct unread count, replied as staff, and confirmed the
  customer saw the full thread
- All function files pass `node --check`; 0 broken internal links

## Things that need your attention
1. **Set up Resend** (or swap in your own provider) before real customers
   start using `myaccount.html` — see step 3 in `README_ADMIN_SETUP.md`.
   Until then, verification/reset/message-notification emails just log
   instead of sending.
2. **Set `ADMIN_NOTIFY_EMAIL`** if you want an email the moment a customer
   messages you, rather than checking the admin inbox periodically.
