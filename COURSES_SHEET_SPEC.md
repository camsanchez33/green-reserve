# Courses Sheet Spec — /admin/courses as a sheet, with check-in calls

Source: Cam, 2026-09-14. "The courses tab has a similar problem to what the
inquiries tab had — let's fix that." Same shape (card rows, no header, four
control layers), different cause: the data here already exists and is derived
properly (`computeCourseHealth`, 30d bookings/trend/fees), so most of this is
presentation. What is genuinely missing is the course equivalent of "Next
call": nobody records when we last talked to a live course or when we next will.

Decisions (Cam, AskUserQuestion 2026-09-14):
- **Scheduled check-in calls**, not just a "last contact" date. Default: 14 days
  after go-live, then every 90 days. Overdue ones surface in Your move on the
  Overview. Logging works like logging a discovery call.
- **Two sections in one table** — "Getting live" above "Live". Archived is a
  footer link like inquiries. The Live / Not live / Archived control goes away.

Depends on: INQUIRY_CALL_SPEC **IC-1** — the `Call` model is shared (kind
`'checkin'`, `courseId` set) and `Course.nextCheckInAt` is added in that same
migration. Do not run CS-1 before IC-1. No migration in any CS phase.

Assumptions (flagged):
- B1. "Getting live" = every course whose health is `setup_incomplete` or
  `orphaned`. "Live" = `healthy | payments_broken | going_quiet | offline`.
  Offline sits in Live because it WAS live (the code's own distinction via
  `welcomeEmailSentAt`); its Status cell says so.
- B2. Setup steps are the five things the product already tracks — no new
  fields. Order below is the order they tend to happen.
- B3. Check-in cadence lives in code (`CHECKIN_FIRST_DAYS = 14`,
  `CHECKIN_EVERY_DAYS = 90`) — same reasoning as the agenda catalog (IC A2).
- B4. Per-column sorting is not added (IC A4). Severity order inside Live,
  setup-progress order inside Getting live.

Timing: U-A touches `admin/courses/page.tsx` by 2 lines; CS-2 rewrites the row
into a table. Run CS-2 after the reskin batch lands (same rule as IC-3).

---

## Phase CS-1 — Lib + API (no migration; after IC-1)

### 1. `src/lib/course-setup.ts` — the five setup steps

`SETUP_STEPS`, in order, each `{ key, label, short, done(course) }`:

| key | label | short | done when |
|---|---|---|---|
| draft | Draft page built | Draft | always (the course row exists) |
| approved | Course approved their page | Approved | `approvalStatus === 'approved'` |
| verified | Operator verified their email | Verified | `operator?.emailVerified` |
| stripe | Stripe connected | Stripe | `stripeAccountActive` |
| live | Live on the public site | Live | `active && liveStatus === 'live'` |

`setupProgress(course): { done: number; total: 5; next: SetupStep | null }`.
`next` is the first step not done (skipping `draft`). Steps are independent,
not sequential — `verified` can be done while `approved` is not; `done` counts
whatever is true.

### 2. `src/lib/course-checkin.ts` — check-in cadence + agenda

- `CHECKIN_FIRST_DAYS = 14`, `CHECKIN_EVERY_DAYS = 90`.
- `CHECKIN_AGENDA` (in code, same shape as the inquiry agenda, all `always`):
  `volume` "How's booking volume feel vs before" · `checkins` "Card check-in at
  the counter — any friction" · `noshows` "No-shows and cancellations" ·
  `members` "Members signing in with the code OK" · `page` "Anything to change
  on the page (photos, copy, prices)" · `payouts` "Payouts landing on schedule"
  · `ask` "What would make this better for you". Plus free text.
- `nextCheckIn(course, calls)`: `course.nextCheckInAt`, or null.
- `checkInSignal(course, calls, now)`: `{ state: 'none' | 'scheduled' |
  'due' | 'overdue', at: Date | null, days: number }` — `due` = within 3 days,
  `overdue` = past. A scheduled `Call` (kind checkin, outcome scheduled) wins
  over the bare `nextCheckInAt` date and carries its time.
- `lastContact(calls)`: most recent `talked` call of either kind — discovery
  calls from the linked inquiry count. "Last talked: Aug 30 (discovery call)".

### 3. API

`GET /api/admin/courses` adds per row: `calls` (kind checkin, newest first),
`nextCheckInAt`, `setup: setupProgress(...)`, `linkedInquiryId`, and the linked
inquiry's `calls` (so "Getting live" rows can show a scheduled discovery call in
the Next touch column). Stay inside the MP-10 bounds.

`POST /api/admin/courses/[id]` (or wherever course actions live today — reuse
the existing action pattern) gains:
- `schedule_checkin { scheduledAt, durationMin, direction, phone, agenda[],
  agendaExtra }` → `Call` kind checkin; sets `nextCheckInAt = scheduledAt`.
  Timeline/activity entry "Check-in call scheduled for <date> by <admin>".
- `log_checkin { callId, outcome: 'talked' | 'no_answer', answers, notes,
  nextCheckInAt? }` → completes the call; `talked` sets `nextCheckInAt` to the
  given date or `now + CHECKIN_EVERY_DAYS`; `no_answer` leaves it and the UI
  offers reschedule.
- `set_next_checkin { at }` → bare date, no call (for "GM said call in
  November").
- **Go-live hook:** wherever `mark_live` / go-live runs today (inquiries route
  `mark_live` and the course route's equivalent), set `nextCheckInAt = now +
  CHECKIN_FIRST_DAYS` if null. That is the only automatic write.

### 4. Overview action queue

`inquiry-action-queue.ts` (or a sibling `course-action-queue.ts` merged into the
same list): one row per course with `checkInSignal.state === 'overdue' | 'due'`
— who: course name; why: "Check-in call overdue by N days" / "Check-in due
<date>"; doThis: "Call <operator name> — agenda is on the course page."; href
`/admin/courses/<id>`. Also one row per `payments_broken` course if not already
there. No duplicates with existing rows (one row per course, worst reason).

### 5. Verify

Script under `scripts/`: three fake courses — setup 2/5 with a scheduled
discovery call; live with `nextCheckInAt` 5 days ago; live with a scheduled
check-in tomorrow — print `setupProgress`, `checkInSignal`, and the action-queue
rows. Expected: only the second one is `overdue` and in the queue.

---

## Phase CS-2 — The list becomes the sheet (no migration; after the reskin batch)

`src/app/admin/courses/page.tsx`.

### 1. Controls

Keep: search, Refresh. Add: Export CSV (same pattern as IC-3 §5). Remove: the
Live / Not live / Archived segmented control, the sort control. Keep the health
dropdown but rename its options to match the sections ("All" · "Needs
attention" · "Setup incomplete" · "Payments broken" · "Going quiet"), and the
type dropdown. Header line: `{live} live · {gettingLive} getting live ·
{needsAttention} need attention · {checkInsDue} check-ins due · {archived}
archived`.

### 2. One table, two sections, eight fixed columns

Same table style as IC-3 (white card, paper header row, 10px uppercase labels,
`table-layout: fixed`). Section header rows: **Getting live** ("not on the
public site yet — furthest along first") and **Live** ("worst health first").

| # | Header | w | Getting live cell | Live cell |
|---|---|---|---|---|
| 1 | Course | 210 | name / `city, state · type` | same |
| 2 | Operator | 180 | name / email; `Unverified` pill if not verified | same |
| 3 | Status | 150 | `3 of 5` + StatusDot / `next: Stripe` | health chip (existing colors) / reason truncated, full on hover |
| 4 | Activity | 140 | `12d in setup` / `since Sep 2` | `18 in 30d +12%` / `last booking 2d ago` (existing derivations) |
| 5 | Fees 30d | 80 | `—` | `$412` (existing) |
| 6 | Next touch | 150 | scheduled discovery call from the linked inquiry (`Tue Sep 16 · 10:30 AM`) or `Set up call` link to the inquiry | `checkInSignal`: `Overdue · 5d` (bad), `Due Thu` (warn), `Dec 3` (plain), or **Schedule** link |
| 7 | Live since | 96 | `—` | `welcomeEmailSentAt` date (until MP-5e's `firstWentLiveAt` exists) |
| 8 | (action) | 72 | Open | Open |

Ordering: Getting live by `setup.done` desc then oldest first; Live by
`HEALTH_STATUS_SEVERITY` then check-in overdue first then name. Row = link to
the course page as today. Hide col 5 and 7 below `lg`; col 4 below `xl`.

### 3. Archived

Footer links `All (N) · Archived (N)` like inquiries. Archived renders the same
table with Status = "Archived <date> by <who>" and Next touch = "—".

### 4. Verify

Browser audit with the fake courses from CS-1: every row has eight cells, no
blank cell without a specified fallback; a course with `payments_broken` is the
first Live row; an overdue check-in shows red; the `?health=` deep links from
the Overview (if any) still work; counts in the header line add up.

---

## Phase CS-3 — Course page: the check-in card (no migration; after CS-1)

`src/app/admin/courses/[id]/page.tsx`, Overview tab, above the existing content.

1. **Getting live courses:** a "Setup" card listing the five steps with done /
   not-done marks and, for each not-done step, the one action that completes
   it (resend approval preview · resend welcome/verify email · Stripe link
   status · Go live) — these actions all exist today; the card just gathers
   them. Below it, the linked inquiry's Next-step card (from IC-2) if a
   discovery call is scheduled.
2. **Live courses:** a "Next check-in" card = the IC-2 cards with the check-in
   agenda: schedule (date/time/length/direction/number, agenda pre-checked,
   free text) → log (Talked / No answer, answers per item, notes, "Next
   check-in" date defaulting to +90 days). "Last talked" line at the top from
   `lastContact` (discovery calls count).
3. **Activity tab:** check-in calls render as human entries ("Check-in call ·
   Nov 3 · Talked · 20 min").

Acceptance: walk one fake course from draft → live: the Setup card shrinks as
steps complete; on go-live `nextCheckInAt` = +14 days appears without anyone
setting it; schedule → log → the date moves to +90 days; the Overview queue row
appears when the date is past.

---

## Not in this spec
- `firstWentLiveAt` (MP-5e) — still wanted; "Live since" uses the proxy until then.
- Per-column sorting (B4).
- Editable cadence / agenda UI (B3).
- Anything on the operator's own dashboard — this is the admin side only.
