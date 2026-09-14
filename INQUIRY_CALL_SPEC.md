# Inquiry Call Spec — the inquiries sheet + the discovery call

Source: Cam, 2026-09-13. "/admin/inquiries is way too free-flowing. It should be
an organized sheet: date inquired, info needed, phone, a call set up with a
date and time, and what to go over on the call — it's easier to get the
important information by phone than by form."
Mockup (approved "I really like that"): canvas "Inquiries Call Sheet",
artifact a3de37c1-988b-4693-8b71-fbbe2247c3a4. Sample data on it is invented.

Theme: the page felt free-flowing because the DATA was — one `adminNotes` blob,
no call anywhere in the schema, `nextFollowUpAt` only written by Snooze. This
spec adds the structure (a call, its agenda, its answers) and then shows it as
fixed columns. It does NOT undo MP-4b: the ranked queue with "Your move /
Waiting on them" sections stays; the rows become real columns.

Decisions (Cam, AskUserQuestion 2026-09-13):
- Keep the queue, add columns. Not a full spreadsheet replacing the queue.
- The call is NOT a pipeline stage. It can happen before OR after the setup
  sheet ("either or — shouldn't matter"). No new status, no funnel change.
- Calendar sync: not now, in-app only.

Assumptions I made (flagged; change the spec, not the code, if wrong):
- A1. The one gate is BUILDING: `create_draft_course` / `build_course` require a
  logged call with outcome `talked`, OR an explicit skip with a typed reason.
  Cam's "shouldn't matter" was about sheet ordering, not about whether a call
  has to happen at all ("you should have to set up a call").
- A2. The agenda catalog lives in code (`src/lib/inquiry-call.ts`), not in a
  settings UI. Changing it is a one-line commit. Build a UI only once someone
  other than Cam runs calls.
- A3. Call answers are free text per agenda item. They are shown to the course
  on their sheet as "From your call" hints under the matching section — NOT
  written into structured sheet fields (lossy, and it would overwrite what the
  course types). The admin sees the same answers on the inquiry.
- A4. No per-column sorting in v1. Sections + the existing `compareQueue`
  ranking. MP-4b killed "four sorts with per-tab memory" for a reason; if the
  sheet needs sorting once real volume exists, add it then.

Constraints:
- IC-1 is a SCHEMA CHANGE (attended run, Neon branch rehearsal, additive only —
  fast path). IC-2 and IC-3 have no migration.
- One derivation for "whose move is it" — `queueSignal` in
  `src/lib/inquiry-status.ts` — and one for "still need from them" — new
  `src/lib/inquiry-needs.ts`. The list, the detail page and the Overview action
  queue all read those. No second answer anywhere.
- Dates in America/New_York. Store UTC, render ET (the tz-date rule from A6).

---

## Phase IC-1 — Schema + lib (SCHEMA CHANGE, attended)

### 1. Prisma

```prisma
/// One calls table for the whole relationship: discovery calls while it is an
/// inquiry, check-in calls once it is a course. Exactly one of inquiryId /
/// courseId is set (enforced in the API, not the DB). COURSES_SHEET_SPEC CS-1
/// reads the same rows — do NOT create a second calls model for courses.
model Call {
  id           String         @id @default(cuid())
  /// 'discovery' (inquiry) | 'checkin' (course)
  kind         String
  inquiryId    String?
  inquiry      CourseInquiry? @relation(fields: [inquiryId], references: [id], onDelete: Cascade)
  courseId     String?
  course       Course?        @relation(fields: [courseId], references: [id], onDelete: Cascade)
  scheduledAt  DateTime
  durationMin  Int            @default(30)
  /// 'we_call' | 'they_call'
  direction    String         @default("we_call")
  phone        String         @default("")
  /// JSON string: string[] of agenda item keys checked for this call
  agendaJson   String         @default("[]")
  /// free text the admin adds for this course ("Tuesday league")
  agendaExtra  String         @default("")
  /// 'scheduled' | 'talked' | 'no_answer' | 'not_a_fit' | 'cancelled'
  outcome      String         @default("scheduled")
  /// JSON string: Record<agendaKey, string> — what was said, per item
  answersJson  String         @default("{}")
  notes        String         @default("")
  followUpAt   DateTime?
  completedAt  DateTime?
  createdBy    String         @default("")
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  @@index([inquiryId, scheduledAt])
  @@index([courseId, scheduledAt])
}
```

On `CourseInquiry` add:

```prisma
  callSkippedReason String?        // A1: build without a call, with a reason
  calls             Call[]
```

On `Course` add (used by COURSES_SHEET_SPEC — cheap to add in the same migration):

```prisma
  nextCheckInAt DateTime?   // CS-1: when we next call the course; null = never scheduled
  calls         Call[]
```

Migration name: `calls`. Additive only. Check `migration.sql` before
merging (M4 pattern).

### 2. `src/lib/inquiry-call.ts` — the agenda catalog

One exported list. Each item: `key`, `label` (what shows in the checklist),
`short` (what shows as a chip in the list column), `always` (true = always on
the agenda), and `answered(inq, sheet)` — returns a display string if the
inquiry/sheet already answers it, else `null`. `sheet` is the parsed
`detailsJson` (or `null`), `needs` is parsed `needsJson`.

| key | label | short | always | answered() reads |
|---|---|---|---|---|
| green_fees | Green fee range (weekday / weekend / twilight) | Green fees | no | `inq.greenFeeRange`, `sheet.greenFeeWeekday/greenFeeWeekend/twilightFee/publicGreenFee` |
| tee_times | Tee times per day and interval | Tee times / day | no | `inq.teeTimesPerDay`, `sheet.firstTeeTime/lastTeeTime/intervalMinutes` |
| booking_today | How they take bookings today (phone, GolfNow, own site) | Booking method today | no | `inq.currentBookingMethod`, `needs.memberBookingToday` |
| resident_member | Resident / member pricing — who qualifies, how it's proven | Resident pricing | no | `needs.residentRates`, `needs.hasMemberships`, `inq.hasResidentPricing`, `inq.hasMemberPricing`, `sheet.memberRate` |
| cancellation | Cancellation and no-show policy | Cancellation policy | no | `sheet.cancellationPolicy`, `sheet.cancellationHours` |
| carts_caddies | Cart / caddie options | Carts / caddies | no | `inq.hasCaddies`, `sheet.cartFee`, `sheet.walkingAllowed` |
| season_hours | Season and days open | Season / hours | no | `sheet.seasonOpen/seasonClose/daysOpen` |
| protected_times | Leagues, outings, blocked times | Blocked times | no | `sheet.protectedTimes`, `sheet.outingsVolume`, `needs.outsideOutings` |
| assets | Logo + 3 course photos — who sends them, by when | Logo / photos | yes | `sheet.photos` (photos only; logo comes with the draft course) |
| people | Who signs off and who runs the tee sheet day to day | Decision maker | yes | never (always ask) |
| fee_model | Walk through the fee model and what go-live looks like | Fee model | yes | never |

Exports:
- `AGENDA: AgendaItem[]`
- `defaultAgenda(inq, sheet, needs): string[]` — keys where `always` OR
  `answered() === null`. This is what the Set-up-call card pre-checks.
- `agendaStatus(inq, sheet, needs, calls): { key, label, short, answered: string | null, fromCall: string | null }[]`
  — one row per catalog item: `answered` from the inquiry/sheet, `fromCall`
  from the latest `talked` call's `answersJson`. An item is OPEN when both are
  null.
- `latestCall(calls)`: the most recent by `scheduledAt`.
- `nextCall(calls, now)`: outcome `scheduled` with `scheduledAt >= now - 12h`
  (a call from this morning still counts as "next" until it's logged).
- `overdueCall(calls, now)`: outcome `scheduled` and `scheduledAt < now - 12h`.
- `callGate(inq, calls): { ok: boolean; why: string }` — A1. ok when any call
  has outcome `talked`, or `inq.callSkippedReason` is set.

### 3. `src/lib/inquiry-needs.ts` — "Still need from them"

`stillNeed(inq, sheet, needs, calls): { key: string; label: string }[]`, in
this order, deduped:
1. `status === 'pending'` and no review event → return `[]` and let the UI
   say "Not reviewed yet" (italic). Nothing is "needed" from a lead we haven't
   looked at.
2. `status === 'details_requested'` → `{ key: 'sheet', label: 'Setup sheet' }`.
3. Every OPEN agenda item from `agendaStatus` → `{ key, label: short }`,
   except `people` and `fee_model` (those are things WE cover, not things they
   owe us).
4. `sheet` exists and `!sheet.photos?.length` → `Course photos`.
5. `status === 'building'` and the built course has no logo → `Logo`.

Empty list AND status in `details_submitted | building` → the UI shows
"Nothing — ready to build" in ok-green (see mockup row 3).

### 4. `queueSignal` learns about calls

`QueueInput` gains `calls?: { scheduledAt; outcome }[] | null`. Rules, applied
AFTER snooze and BEFORE the stage-stall thresholds:
- `overdueCall` → `waitingOn: 'us'`, `yourMove: true`, `pressureDays = days
  since scheduledAt`, `reason: "Log the call from <short date>"`.
- `nextCall` in the future → keep `waitingOn` as derived, but `pressureDays`
  is measured from `scheduledAt` (negative = not due), `reason: "Call <Tue
  Sep 15 · 10:30 AM>"`. A scheduled call suppresses the stage stall the same
  way snooze does — a lead with a call on the books is not stalled.
- `nextCall` today → `yourMove: true`, `pressureDays: 0`, reason "Call today ·
  2:00 PM".
Add `calls` to every caller that builds a `QueueInput` (list page, detail
page, `/api/admin/stats`, `inquiry-action-queue.ts`). The action queue's
`doThis` gains a branch: overdue call → "Log the call — what happened on <date>?";
call today → "Call <name> at <time> — agenda is on the inquiry."

### 5. API — `POST /api/admin/inquiries` actions

- `schedule_call { inquiryId, scheduledAt, durationMin, direction, phone,
  agenda: string[], agendaExtra, emailContact: boolean }` → creates an
  `InquiryCall`. Timeline event (self-loop, `actorName: "Call scheduled for
  <date time> by <admin>"`). If `emailContact`, send the contact a short
  confirmation: time (ET), length, who calls whom, the agenda labels as a
  bulleted list, "Reply to this email if the time doesn't work." Same template
  family as the other inquiry emails. Reject if the inquiry is closed.
- `reschedule_call { callId, scheduledAt, ... }` → updates in place, timeline
  event "Call moved to <date> by <admin>".
- `log_call { callId, outcome: 'talked' | 'no_answer' | 'not_a_fit', answers:
  Record<key,string>, notes, followUpAt?, stillNeedOverride? }` →
  sets outcome, answersJson, notes, completedAt=now. Timeline event "Call
  logged — <outcome> — by <admin>".
  - `talked` + `followUpAt` → `CourseInquiry.nextFollowUpAt = followUpAt`.
  - `no_answer` → creates nothing else; the UI offers reschedule.
  - `not_a_fit` → returns `{ needsClose: true }`; the UI opens the existing
    Reject flow with `closedReason` preselected 'Not a fit'. Do not close from
    inside `log_call`.
- `skip_call { inquiryId, reason }` → sets `callSkippedReason`, timeline
  event "Call skipped — <reason> — by <admin>". Reason required, min 5 chars.
- `create_draft_course` / `build_course` → call `callGate` first; 409
  `{ error: 'call_required', why }` if not ok. Existing behavior otherwise.
- `GET /api/admin/inquiries` includes `calls` (kind 'discovery', newest first) on every row.
  Keep it inside the MP-10 bounds — calls are few per inquiry.

Role gating as today: viewer role cannot schedule/log/skip.

### 6. Verify (IC-1)

`npx tsc --noEmit`, `npx prisma validate`, and a unit-style script under
`scripts/` that builds three fake inquiries (no call / future call / overdue
call) and prints their `queueSignal` and `stillNeed`. Expected: overdue call is
yourMove with the "Log the call" reason; future call is not yourMove and not
stalled; no call + pending = "Not reviewed yet" (empty needs).

---

## Phase IC-2 — Detail page: the two cards (no migration)

`src/app/admin/inquiries/[id]/page.tsx`. Both cards live in the existing
"Next steps" card slot and are stage-independent (the call can happen at any
active stage — decision above).

### 1. Set up the call (shows when there is no scheduled or logged `talked` call)

Board "Detail · Set up the call" on the canvas, or the LogCall board's header
for the chrome. Fields, in this order:
- Date · Time (ET) · Length (15/30/45/60, default 30).
- Who calls whom: segmented `I call them` / `They call me`.
- Number to dial: prefilled `inq.phone`, editable (edits do NOT write back to
  the inquiry; the call keeps its own `phone`).
- "To go over on the call": the full `AGENDA` list as checkboxes. Pre-checked
  from `defaultAgenda`. Each row shows a right-hand hint: `not on form` (open),
  `answered: <value>` (from inquiry/sheet, unchecked by default), or `always`.
- "Add something specific to this course…" → `agendaExtra`.
- Footer: checkbox "Email <first name> a confirmation" (default on), buttons
  `Set up call` (primary) and `Skip the call` (secondary → inline reason field
  + confirm; calls `skip_call`).
- The card's subtitle says WHY it matters: "Required before the draft course
  is built — you can send the setup sheet before or after."

### 2. Log the call (shows when a call is scheduled, from 30 min before its time)

Board "Detail · Log the call". Header: the scheduled time, length, direction,
number. Then:
- Outcome segmented: `Talked` / `No answer — reschedule` / `Not a fit — close`.
- "What you got": a two-column grid, one row per agenda item that was on this
  call's `agendaJson` (checked items) — label left, text input right. Items
  already answered elsewhere show that value as placeholder. Empty at save
  time = still open (italic "Didn't get to it — still needed").
- Notes (free text, multi-line).
- "Still need from them": read-only chips from `stillNeed`, recomputed live as
  answers are typed (so Cam sees the list shrink).
- "Follow up by": date, default = scheduled date + 3 days.
- Buttons: `Save + send pre-filled sheet` (primary, only when status is
  `pending | in_review` — it logs the call then runs the existing
  `request_details`), `Save, don't send yet` (secondary). When the sheet was
  already sent/submitted, the primary is just `Save`.
- `No answer` swaps the body for a reschedule row (date/time) and a
  `Reschedule` button.
- `Not a fit` saves the log, then opens the existing Reject drawer with
  'Not a fit' preselected.

### 3. Call history

In the **Activity** tab, calls render as their own entries (already there via
timeline events — make sure the text is human: "Call · Fri Sep 12, 2:00 PM ·
Talked · 30 min"). In the **Lead** tab, add a "From the call" block listing
`answersJson` of the latest `talked` call, label + text, only when non-empty.

### 4. The build gate (A1)

`Create draft course` / `Build` buttons: if `callGate` is not ok, the button
stays enabled but the click opens an inline notice: "No call logged yet. Log
the call, or skip it with a reason." with two links. Never a dead end. The API
enforces it regardless (409 `call_required` → same notice).

### 5. Course-facing sheet hints (A3)

`/for-courses/details` (token-gated sheet): when the inquiry has a `talked`
call with answers, each sheet section whose agenda key has an answer shows a
muted line above its fields: "From your call with GreenReserve: <answer>" — so
the course confirms rather than re-types. The details API already returns the
inquiry; add `callAnswers: Record<key,string>` to that payload. Nothing is
auto-filled into inputs.

### 6. Verify (IC-2)

Walk it in the browser as a fake inquiry: schedule → confirmation email
arrives (test-email path) → the inquiry shows "Call Tue 10:30" in the header
and the list → log as Talked with 3 answers → "Still need" shrinks → Create
draft course works. Then a second fake inquiry: Skip the call with a reason →
Create draft course works, timeline shows the skip. Then a third: schedule
in the past → list and Overview both say "Log the call".

---

## Phase IC-3 — The list becomes the sheet (no migration)

`src/app/admin/inquiries/page.tsx`. Board "Inquiries — the sheet".

### 1. Table, fixed columns, every row

Replace the flex row (`renderRow`) with a real `<table>` inside the existing
white card. `table-layout: fixed`. Header row in paper (#F7F5EF), 10px
uppercase tracking-wide labels (the existing `text-[10px] uppercase
tracking-[0.06em] text-ink-muted` style). Columns and widths (px):

| # | Header | w | Cell |
|---|---|---|---|
| 1 | Course | 200 | course name (medium) / `city, state · courseType` (12px muted). Resubmit icon stays. |
| 2 | Contact · phone | 190 | `contactName · contactTitle` / phone (12px). Bad-email pill stays, moves under the phone. |
| 3 | Stage | 104 | StatusDot + `STATUS_LABEL`. |
| 4 | Next call | 150 | see §2 |
| 5 | Still need from them | 250 | chips from `stillNeed`, max 3 + `+N`; special texts per IC-1 §3. |
| 6 | In stage | 86 | `Nd`, right-aligned; `text-bad font-medium` when `pressureDays > 0`. |
| 7 | Inquired | 96 | `fmtDate(createdAt)`, right-aligned. |
| 8 | (action) | 72 | `Open` link, right. Checkbox for bulk stays in col 1's left gutter, queue mode only. |

The whole row remains a link to the detail page (row click), as today.
Below `lg` hide col 6–7; below `xl` hide col 5 — same breakpoints the current
row uses.

### 2. The Next call cell (the column this whole spec exists for)

Exactly one of these, top line + 12px sub-line:
- `scheduled`, today → **Today · 2:00 PM** in `text-bad font-semibold` /
  `30 min · you call them`.
- `scheduled`, future → **Tue Sep 15 · 10:30 AM** (medium) / `30 min · they
  call you`.
- `scheduled`, overdue → **Log the call** as a pine link (opens detail) /
  `was Fri Sep 12`.
- latest is `talked` → `Done · Sep 9` / `outcome logged` (or `sheet sent after
  call` when `details_requested` came after `completedAt`).
- no calls, status `pending | in_review | details_requested |
  details_submitted` → a small outlined pine button **Set up call** (opens
  detail with `?call=1`, which focuses the card).
- `callSkippedReason` → `Skipped` / the reason, truncated.
- snoozed → `Snoozed → Oct 1` / `"<snooze note>"` (existing data).

### 3. Sections and order — unchanged

`Your move` / `Waiting on them` / `Snoozed` sections exactly as today, each as
a `<tr>` group header inside the same table (see mockup). Ranking within a
section = existing `compareQueue`. `All` and `Closed` views render the same
table with the Stage column showing the closed reason (today's `whyArchived`)
and the Next call column showing the last logged call, if any.

### 4. Header line

`{active} active · {needsYou} needs you · {callsThisWeek} calls this week ·
{live} live all-time · {closed} closed`. `callsThisWeek` = scheduled calls
Mon–Sun of the current ET week.

### 5. Export CSV

Button next to Refresh. `GET /api/admin/inquiries?format=csv` returns the
alive+closed rows, columns: course, city, state, course type, contact, title,
email, phone, stage, next call (ISO), last call outcome, still need (joined
with `; `), days in stage, inquired (ISO), source, closed reason. Same auth as
the JSON GET. This is the "organized excel sheet" for the one time Cam wants
it outside the app.

### 6. Verify (IC-3)

Browser audit (Claude in Chrome) against the fake inquiries from IC-2: every
row has all seven cells; no cell is blank without one of the specified
fallback texts; the Next call cell shows the right variant for each of the
three fakes; counts in the header line still add up (the A-02d invariant
banner must not fire); `?tab=building` deep-link still narrows.

---

## Not in this spec (deliberately)
- Google Calendar sync (Cam: not now).
- Per-column sorting (A4).
- Agenda settings UI (A2).
- The course booking its own call time from a public page. Today Cam sets the
  time after a phone/email exchange; "Propose 3 times" on the mockup is a
  later idea, not built here.
