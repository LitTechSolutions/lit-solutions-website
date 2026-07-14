# `booking-scheduler` — System Requirements

## 1. Overview & Goal

Automatically offers a kickoff-call scheduling step right after a
full-brief Website Designer submission, instead of requiring an email
round-trip ("thanks — when works for a call?") before a project can
actually start moving. `booking.html` already exists in the site nav as a
page, but is not currently linked into the Website Designer flow at all —
this spec covers making booking a real, connected step rather than a
disconnected page.

Business goal: shortens time-to-kickoff on every lead that completes the
full brief, which compounds with `project-scaffold-generator` to reduce
the whole gap between "customer says yes" and "work visibly starts."

## 2. Actors

- **Customer**, immediately after full-brief submission (or later, via a
  link in the confirmation email) — picks an available slot for a
  kickoff call.
- **Dylan** — defines available windows (reusing whatever cadence he
  already works, e.g. weekday evenings) and receives a calendar-style
  notification per booking.

## 3. Functional Requirements

1. After a `full`-stage Website Designer submission succeeds (the
   existing `wdStepDone` confirmation panel), show a "Schedule your
   kickoff call" CTA in addition to the existing thank-you message —
   not a forced/blocking step, since some customers will prefer to
   arrange this by phone directly.
2. Booking UI presents available time slots computed from Dylan's
   configured weekly availability windows, minus already-booked slots
   and a minimum-notice buffer (e.g., no same-day bookings inside 4
   hours).
3. On booking, the system:
   - Persists the booking.
   - Emails Dylan a notification (subject line includes the customer/
     business name and the chosen time).
   - Emails the customer a confirmation with the time and a calendar
     attachment (`.ics` file) so it lands on their calendar directly.
4. Booking is linked to the originating lead (`leadId`) so it shows up
   alongside that lead in `leads-dashboard`/`project-status`, not as a
   disconnected record.
5. Either party can cancel/reschedule via a link in the confirmation
   email (a signed, single-use-token link, reusing the
   `createSingleUseToken` pattern already in `_lib/auth_utils.js` for
   password-reset — no full account/login required just to reschedule a
   call).

## 4. API Contract

`GET /.netlify/functions/booking-scheduler?action=availability&days=14`
→ `{ "slots": [{ "start": "2026-07-20T18:00:00-04:00", "end": "...", }] }`
— computed server-side from config + existing bookings, not exposing
Dylan's full calendar, only open slots.

`POST /.netlify/functions/booking-scheduler`
```json
{ "leadId": "WD-...", "slotStart": "2026-07-20T18:00:00-04:00", "customerName": "...", "email": "...", "phone": "..." }
```
→ `201 { "bookingId": "BK-...", "rescheduleToken": "..." }`; `409` if the
slot was just taken by someone else (re-fetch availability and retry).

`POST /.netlify/functions/booking-scheduler` — action `cancel` or
`reschedule`, authorized via the single-use token from the confirmation
email rather than a login:
```json
{ "action": "cancel", "token": "..." }
```

## 5. Data Model

New blob store: **`bookings`** — key = booking id (`BK-<id>`).
```
{
  id, leadId: string | null, slotStart, slotEnd,
  customerName, email, phone,
  status: "confirmed" | "cancelled" | "rescheduled",
  createdAt
}
```

New small config record (store `content`, slug `booking-availability`) —
editable via `admin.html`, following the existing pattern used for other
site content:
```
{ weeklyWindows: [{ day: "mon", start: "18:00", end: "20:00" }, ...], slotLengthMinutes: 30, minNoticeHours: 4 }
```

## 6. Business Rules & Validation

- Slot availability must be computed **at request time** against current
  bookings (not cached), and the `POST` must re-check the slot is still
  open before confirming (`409` + re-fetch on conflict) to handle the
  double-booking race condition.
- Minimum-notice buffer (§3.2) enforced server-side, not just hidden in
  the UI — a directly-crafted request shouldn't be able to book a slot
  inside the buffer.
- Reschedule/cancel tokens are single-use and expire (reuse
  `createSingleUseToken`'s existing TTL pattern) — a stale link should
  fail gracefully with "this link has expired, please call/email us
  directly" rather than a bare error.

## 7. Integration Points

- `website-designer.html`/`.js` — add the post-submission CTA to
  `wdStepDone` panel, linking to a booking UI (either inline on that same
  page or a dedicated flow reusing `booking.html`'s existing markup/URL).
- `_lib/auth_utils.js` — reuse `createSingleUseToken`/`verify` for
  reschedule/cancel links.
- `_lib/email.js` — booking confirmation (with `.ics` attachment —
  generating a valid `.ics` file is plain text generation, no new
  dependency needed) and the Dylan-facing notification.
- `admin.html` — new small "Booking availability" settings panel, and
  ideally a simple upcoming-bookings list (could live alongside
  `leads-dashboard`, since both are "what's coming up" admin views).

## 8. Error Handling

- No slots available in the requested window: return an empty `slots`
  array with a clear customer-facing message ("Nothing open in the next
  2 weeks — call or email us directly and we'll find a time"), not an
  error state.
- Double-booking race: `409`, client re-fetches availability and asks the
  customer to pick again — never silently double-book two people into
  the same slot.

## 9. Security & Privacy Considerations

- Availability endpoint (`GET`) is public/unauthenticated by necessity
  (a prospective customer hasn't logged in) — make sure it only ever
  returns open slot times, never any information about who booked the
  adjacent slots.
- Cancel/reschedule via signed token (not requiring login) is a
  deliberate, lower-friction choice — acceptable here since the token
  only grants control over one specific booking, mirroring the existing
  password-reset token's risk profile in this codebase.

## 10. Non-Functional Requirements

- `.ics` generation and slot-availability computation are both
  lightweight, in-function logic — no external calendar API dependency
  needed for v1 (i.e., no requirement to integrate with Google
  Calendar/Outlook directly, which would need OAuth and is meaningfully
  more infrastructure).

## 11. Open Questions for Dylan

- What are your actual real availability windows/cadence for kickoff
  calls? Needed to seed the config record.
- Would you eventually want this synced to a calendar you actually check
  (Google Calendar, etc.), or is "I get an email + it shows in the admin
  dashboard" sufficient? The email-only version above is the
  lower-effort v1; calendar sync is a real scope increase (OAuth,
  refresh tokens, a provider-specific API).
