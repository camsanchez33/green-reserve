# Call Scheduling Spec — the course books its own call, against your real calendar

Source: Cam, 2026-09-15. "It shouldn't be that we just set up a call — they should
get an email saying set up a call with GreenReserve that connects to a calendar
that automatically shows availability." And, on where availability comes from:
"30 minute intervals that can be blocked off based off my calendar."

Today the admin picks a time and emails a confirmation (IC-2). That stays — it is
right for a course you already have on the phone. This spec adds the other
direction, which is the one that will actually run the pipeline: the course gets a
link, sees real open slots, and picks one.

**The one design decision that makes this work:** there is exactly ONE source of
truth for whether Cam is free, and it is his Google Calendar. The app holds only a
broad weekly window ("I would take a call in here at all"); everything inside that
window is offered unless his calendar says busy. No second availability system to
keep in sync — if he doesn't want calls Tuesday afternoon, he puts a block on his
calendar like he would for anything else.

Decisions (Cam, 2026-09-15): 30-minute intervals; blocked off from his calendar.

Assumptions (flagged — each is a real choice, say so if any is wrong):
- S1. **Service account, not OAuth.** A Google service account is given read +
  write access to one calendar Cam shares with it. No refresh-token dance, no
  consent screen, no re-auth when a token expires. One secret in Vercel.
- S2. **The invite sends automatically** when an inquiry is submitted and passes
  the existing spam checks (honeypot, rate limit, valid email). Speed of reply is
  the whole advantage a one-person company has. A single boolean
  (`AUTO_SEND_CALL_INVITE`) flips it to "admin sends it after review."
- S3. **Everything is America/New_York** and the page says so. Every target course
  is NY/NJ/CT today. Multi-timezone is a named follow-on, not a v1 gap to paper
  over with a guess from their state.
- S4. **Calls are 30 minutes.** Cam can still pick any length when he schedules
  one himself from the admin.
- S5. **If Google cannot be reached, the page offers no slots** and asks the
  course to reply with times that work, and Cam gets an alert. It never falls
  back to showing the raw window — that would double-book him into class.

Depends on: IC-1 (the `Call` model). SC-1 is a schema change; SC-2/SC-3 are not.

---

## Phase SC-1 — Availability engine + Google (SCHEMA CHANGE, attended)

### 1. Prisma

On `CourseInquiry`:
```prisma
  /// SC-1: token for the public "pick a call time" page. Same pattern as
  /// detailsToken — unique, generated in app code, regenerated on resend.
  callInviteToken     String?   @unique
  callInviteSentAt    DateTime?
  callInviteExpiresAt DateTime?
```

On `Call`:
```prisma
  /// SC-2: set when the COURSE booked this slot itself, rather than an admin
  /// scheduling it. Distinguishes "they chose this" from "we told them".
  bookedByCourse  Boolean @default(false)
  /// Google Calendar event id, so reschedule/cancel can move or delete it.
  /// Null when the calendar write failed — the call still stands.
  gcalEventId     String?
```

Migration `call_invites`. Additive.

### 2. Google, the smallest version that is honest

`src/lib/google-calendar.ts`.

Setup (CAM, one time, before this runs — the run cannot do it):
1. Google Cloud console → new project → enable the Google Calendar API.
2. Create a **service account**, create a JSON key, download it.
3. In Google Calendar, open the calendar Cam wants to be the source of truth →
   Settings → *Share with specific people* → add the service account's email with
   **"Make changes to events."**
4. Add to Vercel: `GOOGLE_SERVICE_ACCOUNT_JSON` (the whole key file, one line) and
   `GOOGLE_CALENDAR_ID` (the calendar's id — often the Gmail address).
   Record both in `PASSWORD_CHECKLIST.md`. Never paste the key value in chat.

Functions:
- `busyBlocks(fromDate, toDate): Promise<{start: Date, end: Date}[]>` — one
  `freebusy.query` for `GOOGLE_CALENDAR_ID`. Cached 5 minutes in memory (the
  booking page is low-traffic and the answer changes slowly). Throws on any
  failure — callers decide what to do, nobody swallows it.
- `createCallEvent(call, inquiry): Promise<string | null>` — 30-minute event
  titled `Call — <course name>`, description carrying the contact's name, phone,
  the agenda labels, and a link to `/admin/inquiries/<id>`. Returns the event id,
  or null on failure (logged to Sentry; never throws into the booking path — a
  failed calendar write must not lose the course's booking).
- `moveCallEvent(eventId, newStart)` / `deleteCallEvent(eventId)`.

### 3. `src/lib/call-availability.ts`

```ts
// Broad "would I ever take a call then" windows. NOT a schedule — the real
// schedule is Cam's Google Calendar, and anything busy there is removed below.
// Local time, America/New_York.
export const CALL_WINDOWS = [
  { day: 1, from: '08:00', to: '20:00' }, // Mon
  { day: 2, from: '08:00', to: '20:00' },
  { day: 3, from: '08:00', to: '20:00' },
  { day: 4, from: '08:00', to: '20:00' },
  { day: 5, from: '08:00', to: '18:00' }, // Fri
  { day: 6, from: '09:00', to: '16:00' }, // Sat
];                                         // Sun: none
export const SLOT_MINUTES = 30;
export const LEAD_HOURS = 12;   // nothing bookable inside the next 12 hours
export const HORIZON_DAYS = 14; // how far out the page shows
```

`openSlots(now, preference?)` returns `{ day: Date, slots: Date[] }[]`:
1. every 30-minute slot inside `CALL_WINDOWS` from `now + LEAD_HOURS` to
   `now + HORIZON_DAYS`;
2. minus any slot overlapping a `busyBlocks` entry (a 20-minute event kills the
   whole 30-minute slot — never offer a half-free slot);
3. minus any slot overlapping an existing `Call` with outcome `scheduled` (either
   kind — check-in calls block discovery calls and vice versa);
4. if `preference` is given (from the form — mornings/afternoons/evenings,
   weekdays/weekends), matching slots are returned first and the rest under a
   "Other times" heading. Preference never *removes* a slot.

Pure function over injected busy blocks and calls, so it is unit-testable without
touching Google. `scripts/call-availability-test.ts` proves: a busy block removes
exactly the overlapping slots; lead time removes today; a booked Call removes its
slot; Sunday is empty; an empty window list returns nothing rather than everything.

### 4. Verify

The test script above, green, plus one live call to `busyBlocks` from a script to
prove the service account can read the calendar, and one `createCallEvent` +
`deleteCallEvent` round trip. Run these before SC-2 exists — if the Google half
does not work, nothing downstream is worth building.

---

## Phase SC-2 — The invite, the page, the emails (no migration)

### 1. The invite email

`sendCallInviteEmail` in `src/lib/email.ts`, same template family.

- Subject: **Set up your call with GreenReserve**
- Body: "Hi [first name] — thanks for the note about [course name]. Pick a
  30-minute time that suits you and I'll call you then." Then the button,
  **Pick a time →**, to `https://greenreserve.app/call/<token>`. Under it, three
  lines of what the call covers (pulled from the agenda's `always` items so the
  email can never drift from the actual agenda), and "If none of the times work,
  just reply to this email." Signed by name, not "The GreenReserve Team."
- Sent automatically from `POST /api/inquiries` after the inquiry is created (S2),
  in the same place the applicant confirmation is sent, and the confirmation's
  button points at the same link. A send failure never fails the submission: the
  inquiry is created, `callInviteSentAt` stays null, and the admin alert says
  "invite not sent."
- Token: cuid, `callInviteExpiresAt = now + 21 days`.

### 2. `/call/[token]` — the public page

Public look (Fraunces + Inter, cream). `noindex`. Rate-limited by IP on both the
GET and the POST, using the existing `rateLimit()` helper. No session, no account.

- **Header:** the course's name, "Book a call with GreenReserve", "30 minutes ·
  we'll call you at [phone]" with the phone editable inline in case it's wrong.
- **Slots:** days down the page, each with its open times as chips. Preference
  matches first (§SC-1.4). "All times Eastern." Empty day = not shown. Nothing at
  all in the horizon → the request fallback (below).
- **Picking one** expands a small confirm: the time in full, "We'll call you at
  [phone]" with a "they should call me instead" toggle, and **Confirm**.
- **Confirm** POSTs `{ token, startsAt, phone, direction }`.

Server, in one transaction: re-read `openSlots` and refuse if the slot has gone
(`409 slot_taken` → the page reloads the grid and says "sorry, that one just
went"); create the `Call` (kind `discovery`, `bookedByCourse: true`, outcome
`scheduled`, agenda = `defaultAgenda(inquiry)`); log the timeline event "Course
booked a call for [time]"; then, outside the transaction, `createCallEvent` and
store `gcalEventId`.

- **After confirming:** the same page becomes the manage view — "You're booked for
  [time]" with **Reschedule** and **Cancel**. The token stays valid until the call
  is logged, so the email link always lands somewhere useful.
- **Google unreachable (S5):** no grid. "I can't show my calendar right now —
  reply to [email] with a couple of times that suit you and I'll confirm." Cam
  gets an alert email. Never show unverified slots.

### 3. The confirmation emails

On booking, two go out:
- **To the course:** "You're booked — [day, date, time] ET", the agenda, who calls
  whom, the reschedule/cancel link, and a **.ics attachment** so it lands in their
  own calendar with no integration on their side.
- **To Cam** (`hello@greenreserve.app`): course, contact, phone, time, and a link
  to the inquiry.

Reschedule sends the same pair with "moved to"; cancel sends "cancelled" plus a
link to pick a new time, and deletes the Google event.

### 4. Verify

End to end with a real inbox: submit the public form → invite email arrives →
open the link → the grid matches what Google says (put a test event on the
calendar and watch that slot disappear) → book → both emails arrive, the .ics
opens, the event appears on Cam's calendar, the inquiry's Next call cell shows the
time → reschedule → cancel. Then the failure paths: an expired token, a
already-taken slot (book the same slot in two browser tabs), and Google
unreachable (temporarily break `GOOGLE_CALENDAR_ID`).

---

## Phase SC-3 — The admin side (no migration)

1. **Set-up-call card** (IC-2) gains a third route beside "Set up call" and "Skip":
   **Send a booking link** — sends the invite on demand, shows "Invite sent [date],
   not booked yet" while it is outstanding, and offers Resend. When the course has
   booked, the card is the Log-the-call card as today.
2. **The inquiries sheet** (IC-3) Next-call cell learns two states: `Invite sent ·
   3d ago` (muted) and, once booked, the existing time display with a small "they
   picked it" marker. An invite sent and unanswered for 5+ days is a `yourMove`
   signal in `queueSignal` — reason "Invite sent 6 days ago, no time picked" —
   because that is a lead going cold, not a lead waiting on us.
3. **A reminder**, 24 hours before each scheduled call: one email to the course
   ("Talking tomorrow at 2:00") with the reschedule link. Runs on the existing
   cron, logged to the heartbeat so a dead reminder cron is visible like every
   other one.
4. **`CALL_WINDOWS` in the admin System page**, read-only, with a line saying the
   real filter is the linked Google Calendar and naming which calendar id is
   configured. Cam should be able to see what the public page believes without
   reading code.

Verify: an inquiry with an outstanding invite reads correctly in the sheet, on the
detail page and in the Overview queue; the 5-day cold signal fires; the reminder
sends once and only once.

---

## Open, and deliberately not solved here
- **Multi-timezone** (S3). When the first course outside Eastern inquires: store
  the course's timezone on the inquiry, render the grid in it, label both.
- **The current email bug.** `schedule_call` only emails when the
  "Email a confirmation" box is ticked and the inquiry has an address; Cam saw no
  email and Resend showed no send. Diagnose before SC-2 — if there is a real fault
  in the send path, SC-2 inherits it.
- Group scheduling, round-robin, anything multi-person. One person, one calendar.
