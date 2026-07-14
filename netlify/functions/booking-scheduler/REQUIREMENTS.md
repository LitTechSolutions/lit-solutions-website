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
- **Dylan** — defines available windows (confirmed: weekday **and**
  weekend windows are both in scope — see §11 for exact hours still
  needed) and sees every booking land directly on his **Google
  Calendar** (confirmed requirement, not deferred — see §4a/§11).

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

## 4a. Google Calendar Integration (confirmed requirement, not v1-optional)

Dylan confirmed real Google Calendar sync is needed, not just an email +
dashboard listing. This is a real scope increase over a pure-Netlify-Blobs
implementation and needs its own sub-requirements:

1. **Auth**: a Google Cloud project with the Calendar API enabled, and
   OAuth 2.0 credentials. Since this is a single-business-owner
   integration (not multi-tenant), the simplest correct approach is a
   **service account with domain-wide delegation** if Dylan's calendar is
   on Google Workspace, or a one-time OAuth consent flow storing a
   refresh token if it's a personal Gmail account — confirm which before
   building, since the setup differs (see §11).
2. **Availability source of truth becomes Dylan's actual calendar**, not
   just the `booking-availability` config record: before returning open
   slots (§4's `GET .../availability`), the function should call the
   Google Calendar Freebusy API for Dylan's calendar across the requested
   window and exclude any time that's already busy there — this is what
   makes "real sync" actually useful (avoids double-booking against
   personal/other-business appointments already on his calendar, not just
   against bookings made through this system).
3. **On a confirmed booking**, create a real Google Calendar event (not
   just an `.ics` email attachment) on Dylan's calendar via the Calendar
   API `events.insert`, with the customer invited as an attendee (so it
   also lands on *their* calendar automatically if they accept, in
   addition to the emailed `.ics` fallback for customers who don't use
   Google Calendar).
4. **On cancel/reschedule**, delete or update the corresponding Google
   Calendar event (`events.delete`/`events.patch`) — store the returned
   Google event id on the `bookings` record (§5) specifically so this is
   possible.
5. Refresh-token storage: store the OAuth refresh token as a Netlify
   environment variable (matching this codebase's existing pattern of
   secrets living in env vars, e.g. `RESEND_API_KEY` /
   `LTS_SESSION_SECRET`), not in Blobs — this is a credential, not
   application data.

## 5. Data Model

New blob store: **`bookings`** — key = booking id (`BK-<id>`).
```
{
  id, leadId: string | null, slotStart, slotEnd,
  customerName, email, phone,
  status: "confirmed" | "cancelled" | "rescheduled",
  googleEventId: string | null,   // for delete/patch on cancel/reschedule, see §4a.4
  createdAt
}
```

New small config record (store `content`, slug `booking-availability`) —
editable via `admin.html`, following the existing pattern used for other
site content. **Confirmed to include weekend windows**, not just
weekdays — exact hours still need to be filled in with Dylan's real
schedule (see §11):
```
{
  weeklyWindows: [
    { day: "mon", start: "18:00", end: "20:00" },
    { day: "sat", start: "10:00", end: "14:00" }
    // ... full week's real windows, placeholder until confirmed
  ],
  slotLengthMinutes: 30,
  minNoticeHours: 4
}
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
- `_lib/email.js` — booking confirmation (with `.ics` attachment as a
  fallback for non-Google-Calendar customers) and the Dylan-facing
  notification.
- **Google Calendar API** (new integration, see §4a) — this is now a
  hard dependency of the function, not an optional enhancement. Needs a
  Google Cloud project, Calendar API enabled, and credentials configured
  as Netlify environment variables before this can go live at all.
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

- `.ics` generation is lightweight, in-function logic. The Google
  Calendar Freebusy/events calls (§4a) add real external-API latency and
  a real failure mode (Google API outage/rate limit) that §8's error
  handling needs to account for — if the Calendar API call fails, the
  function should still let the booking succeed in `bookings` (Blobs) and
  notify Dylan by email, rather than blocking the whole booking on a
  third-party API being up. Treat the calendar event creation as
  best-effort on top of a Blobs-backed booking, not as the source of
  truth itself.

## 11. Decisions (resolved 2026-07-14)

- **Availability windows include weekends**, in addition to weekdays.
  Dylan's exact hours (which weekdays, which times, Saturday/Sunday
  windows) still need to be gathered to seed the real
  `booking-availability` config — the values in §5 remain placeholders
  until then.
- **Real Google Calendar sync is a confirmed requirement**, not deferred
  — see §4a for the full integration spec this adds. Before building,
  confirm whether Dylan's Google account is a personal Gmail or Google
  Workspace, since that changes the OAuth setup approach (§4a.1).
