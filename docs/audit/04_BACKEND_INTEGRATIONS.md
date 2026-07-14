# Session 4 — Backend Integrations

Scope: every Netlify Function, forms, files, email/PDF, and provider
integrations. No code changes were made in this session — findings and
evidence only, per `00_AUDIT_CONTROL.md`. Read for this session:
`00_AUDIT_CONTROL.md`, `AUDIT_STATE.json`, Sessions 1-3's docs, and:
`documents.js`, `messages.js`, `favorites.js`, `notifications.js`,
`content.js`, `website-designer.js` (forms/files/email/PDF portions —
pricing/discount math is Session 5's scope), `contact.html` and
`intake.html`'s form-submission wiring.

## 1. Confirmed strengths (carried forward, not re-flagged)

- `website-designer.js:128-160` (`isRecognizedImage`) — F012's fix
  confirmed in place: real magic-byte signature sniffing (PNG/JPEG/WEBP
  headers, optional SVG text-sniff), not just a MIME-string check. This
  is the *better* pattern in the codebase — see F027 update below.
- `website-designer.js:163-170` (`esc`/`escList`) — every user-controlled
  field is HTML-escaped before being embedded in the outbound quote-lead
  email (38 call sites checked). This is the correct, established
  pattern for building HTML email bodies from user input in this
  codebase — see F040 below for where it wasn't followed.
- `website-designer.js:101-110` (`priceMismatchFlag`) — F013's fix
  confirmed in place: submitted totals are recomputed server-side and
  flagged (not silently trusted, not blocking) if they disagree.
- `documents.js`, `messages.js`, `favorites.js`, `notifications.js` all
  correctly scope reads/writes to `session.userId` for the signed-in
  user's own data, with a separate, explicitly role-gated
  (`isStaff(session)`) path for staff to act on a named customer's data.
  No cross-customer data leak found in any of the four.
- `contact.html:178` and `intake.html:151` both use native Netlify Forms
  (`data-netlify="true"` + a honeypot field), not custom backend code —
  spam handling and storage for these two forms is Netlify's own managed
  infrastructure, appropriately out of scope for a code-level review.

## 2. New finding: F040 — customer message content isn't escaped before being emailed

- **Severity:** High
- **Status:** Open
- **Domain:** Backend Integrations (Session 4)

`messages.js:32-40` (`notifyNewMessage`) builds the outbound "new
message" email as:

```
html: `<p>${fromName} sent you a message:</p><blockquote>${snippet.replace(/\n/g, "<br>")}</blockquote>` + ...
```

`snippet` is a truncated copy of the message `body` — user-submitted
text from either a signed-in customer (`messages.js:119,132`, up to 8000
characters) or staff. Newlines are converted to `<br>`, but no other HTML
special characters are escaped. This same file's sibling functions in
this codebase (`website-designer.js`) already have a working `esc()`
helper used consistently everywhere user input reaches an outbound HTML
email — this function simply doesn't use it.

**Impact:** a message containing HTML markup would be interpreted as
markup by the recipient's email client rather than displayed as plain
text, in an email sent to either a real customer or to Dylan
(`ADMIN_NOTIFY_EMAIL`) — this could alter the email's rendered
appearance (e.g., injected formatting or links) in a way the sender did
not intend to send and the recipient would not expect from a plain-text
message. Per this audit's ground rules, this description stops at the
defect and its impact, not a working payload. The in-app display of the
same message content (`myaccount.html:531`, `.textContent = m.body`) is
**not** affected — that path is safe.

**Fix (for a future implementation turn, not this session):** apply the
same `esc()` pattern already defined and used in `website-designer.js`
to the `snippet` (and `fromName`, which is also interpolated
unescaped) before building the email HTML in `notifyNewMessage`.

## 3. F027 — expanded with a second occurrence

`documents.js:102` — the attachment-type check for admin-uploaded
customer documents is:

```
if (!/^data:(application\/pdf|image\/)/.test(body.fileDataUri)) ...
```

This is the identical weakness already recorded in F027 for
`admin-images.js` (a MIME-string-prefix check, not a real signature
check, so `image/svg+xml` passes) — now confirmed present in a second
location. Both call sites are staff/admin-only (not public,
unauthenticated endpoints), which is why this remains Low severity per
F027's existing rating rather than escalating — but the fix is now
demonstrably a known-good pattern already sitting in the same codebase:
`website-designer.js`'s `isRecognizedImage()` (magic-byte sniffing) is
exactly the fix both `admin-images.js` and `documents.js` need, and it
requires no new dependency since it already exists and is already used
elsewhere in this repository. No change to F027's severity/status; its
evidence now cites both files and its fix path is more concrete.

## 4. Minor observations (not separately numbered — informational)

- `documents.js:139-143` (the `"delete"` action) doesn't check the
  document exists before calling `deleteKey`, so deleting an
  already-deleted or bogus ID silently returns `"Deleted."` with no
  indication anything was wrong. Low-impact (staff-only endpoint, no
  security implication) — not worth a tracked finding, noted here for
  completeness.
- `favorites.js`'s `items` (bookmarks) list has no length cap, unlike
  `recentlyViewed` (20) and `savedSearches` (30) in the same file. Not a
  security issue at this business's scale — noted only in case a future
  quality/performance pass wants it.

## 5. Findings ledger addition

| ID | Severity | Status | Domain (session) | Finding | Evidence |
|----|----------|--------|-------------------|---------|----------|
| F040 | High | Open | Backend Integrations (4) | `messages.js`'s outbound email notification embeds message body/sender name unescaped into HTML, unlike the `esc()` pattern used consistently elsewhere in the codebase | `messages.js:32-40`; contrast `website-designer.js:163-170` |

F027's entry is updated with the `documents.js:102` occurrence (see §3
above) — no severity or status change, evidence expanded.

## 6. Not yet verified (flagged for a later session)

- Live/functional testing of file uploads, email delivery, and PDF
  generation end-to-end (this session was a static-code read) —
  Session 6.
- Website Designer's pricing/discount business logic itself — Session 5.
