# v1.17 — Dashboard, Favorites, Notifications, Preferences — What Changed

This release closes the gap between v14 and the accounts-module reference
functions (`profile.js`, `dashboard.js`, `favorites.js`, `notifications.js`
in `Claude/Business Package Software/`) found during a requirements audit —
everything in that module is now implemented except social/OAuth sign-in
(REQ-86), which is explicitly premium/separate-scope per the reference notes
and needs real provider credentials before it can be built.

## New: a real account dashboard
`myaccount.html#dashboard` is now a hub, not just the document list (which
moved to `myaccount.html#documents`): shortcut tiles for document count,
favorite count, and unread notification count, plus a "Recently viewed"
list of the last pages you looked at while signed in.

## New: favorites, recently-viewed, and saved searches
- A bookmark button appears on blog posts (all of them, including the 3
  original static articles) and portfolio items, but only once you're
  signed in — anonymous visitors never see it
- Recently-viewed is tracked automatically when a signed-in customer opens
  a blog post (capped at the last 20)
- `search.html` has a "Save this search" button (signed-in only); saved
  searches show up in `myaccount.html#favorites` alongside bookmarks
- All three lists live on the account, not the browser, so they follow a
  customer across devices

## New: in-app notification center
Separate from the customer↔staff messages thread (that's a conversation;
this is one-way system alerts): `myaccount.html#notifications`, with an
unread-count badge on the nav tab itself.
- Uploading a document for a customer now automatically raises a
  notification ("New invoice: ...") in addition to the existing email
- Staff can also send a one-off notification manually from the Customers
  tab in `admin.html` — e.g. "Appointment rescheduled" — for anything that
  doesn't need a back-and-forth reply

## New: profile preferences
`myaccount.html#profile` now has two more sections beyond email/password:
- **Name** — change your display name, no password required (unlike email/
  password changes, which still require it)
- **Preferences** — language, timezone (free text), and an "email me about
  new messages/documents" toggle. Turning that off suppresses the message-
  reply and document-upload emails but never the in-app notification, so
  nothing is silently missed — and never touches verification/password-
  reset emails, which are security-critical and always send

## New files
- `netlify/functions/favorites.js` — bookmarks, recently-viewed, saved
  searches (one record per account)
- `netlify/functions/notifications.js` — the notification center; also
  exports `createNotification()` for internal use by other functions

## Changed
- `netlify/functions/account.js` — added `update-name` and
  `update-preferences` actions (no password required, unlike the existing
  email/password actions); GET now returns `preferences`
- `netlify/functions/documents.js` — upload now raises a notification and
  a conditional email for the customer
- `netlify/functions/messages.js` — staff replies now respect the
  customer's `emailNotifications` preference
- `js/cms.js` — added `mountBookmark()`, and `mountPortfolio()` now renders
  a bookmark button per card when signed in

## Verification performed
- Extended the mock test suite (in-memory Netlify Blobs) with 27 new
  checks covering name/preferences updates, favorites add/remove,
  recently-viewed ordering and the 20-item cap, saved searches, staff-only
  notification creation, cross-customer isolation, mark-read/mark-all-read,
  and the automatic document-upload notification: 108/108 checks passing
- Re-verified end-to-end over real HTTP: registered and signed in a real
  customer, changed name/preferences (including turning off email
  notifications), bookmarked a blog post and a portfolio item, saved a
  search, had staff upload a document and confirmed both the in-app
  notification appeared *and* the email was correctly suppressed (checked
  the function console — no "would have sent" line for that upload, unlike
  every other email in the same run), and had staff send a manual
  notification
- Also verified in an actual browser session against the same local
  server: dashboard shortcut counts, notification badge counting down
  after mark-all-read, favorites/saved-searches list rendering, and the
  portfolio bookmark button actually persisting a bookmark on click
- All function files pass `node --check`

## Things that need your attention
Nothing new — this release doesn't add any environment variables or setup
steps beyond what's already in `README_ADMIN_SETUP.md`.
