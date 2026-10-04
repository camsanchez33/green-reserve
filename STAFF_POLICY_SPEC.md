# STAFF_POLICY_SPEC — staff permissions + the course's cancellation & card policy

Cam 2026-10-04: "the weather thing needs to be decided in admin settings and that is
something we need to really build out where they allow what the staff sees and what
each staff member can do along with they should be able to change if they want
cancellation fees if they want to hold the card cause if they dont have cancellation
fees they dont need to hold the card etc" — "needs to be very extensive".

Decisions (AskUserQuestion, Cam 2026-10-04):
- **Who decides:** the COURSE OWNER, in their dashboard (Settings → Staff & permissions).
  GreenReserve admin can see it from the course page; it is the course's call.
- **Granularity:** PER PERSON, with ROLE PRESETS that fill the list in one click.
- **Card & cancellation:** the course controls whether it saves a card and how its
  cancellation process works; "No fee, no card" must be an option.

Two parts, built in this order: **Part A — staff permissions** (fully decided, builds
now) and **Part B — cancellation & card policy** (one revenue decision open, §B0).

---

## Part A — Staff permissions

### A1. What exists today (inventory, 2026-10-04)

There are two dashboard identities: the course OWNER (`CourseOperator`) and STAFF
(`CourseStaff`, `session.isStaff`). Staff is a single fixed level:

- **Open to staff (no gate):** `bookings` — every action (cancel, check in, no-show,
  still coming, paid offline, walk-in POST), `frost-delay`, `weather-cancel`,
  `conditions`, `tee-times` (staff branch, can add/block), `change-password`,
  `active-course`, `preview-link`, `onboarding-complete`.
- **Owner-only (`STAFF_FORBIDDEN`):** settings, staff, schedule, blackouts, members (+ dues
  reminders), tiers, analytics, photos, upload, tee-sets, nines, course-products,
  courses, profile, agreement/sign, approve-page, request-changes,
  regenerate-tee-times, every Stripe route.
- **UI:** the sidebar hides Analytics; Money shows staff the Cancellations tab only.
- `CourseStaff.role` is a free string, default `"staff"`, used for nothing.

The defect /gr-review found (HIGH, 2026-10-01): Weather → Cancel times waives the late
fee and REFUNDS a hold already charged. A single staff cancel never waived the fee, and
Close a day (which Weather replaced) was owner-only. So staff gained the power to refund
money. This spec fixes it by making that power a permission that is **off by default**.

### A2. The permission catalog

Each permission is a stable key. The owner always has every permission. A staff member
has exactly the keys on their row. Grouped as the Settings screen shows them:

| Group | Key | What it allows | Today (staff) |
|---|---|---|---|
| Tee sheet | `sheet.view` | See the tee sheet (always on — staff exist to run it) | yes |
| | `sheet.checkin` | Check groups in, take a card payment at check-in | yes |
| | `sheet.counter_payment` | Mark "paid at the counter" (paid offline) | yes |
| | `sheet.walkin` | Add walk-in and phone bookings | yes |
| | `sheet.no_show` | Mark a no-show / "still coming" (charges GreenReserve's fee on a no-show) | yes |
| | `sheet.cancel` | Cancel a single booking (the course's late-fee rule applies) | yes |
| | `sheet.waive_fee` | Cancel AND waive the late fee (refunds a hold already taken) | no — NEW, off |
| | `sheet.block` | Block / unblock / open a tee time | yes |
| | `sheet.edit_times` | Add or delete tee times | yes (add) |
| | `sheet.delay_start` | Weather → Delay start (frost delay) | yes |
| | `sheet.weather_cancel` | Weather → Cancel times (mass cancel; implies waive for those groups) | yes → **off by default** |
| | `sheet.golfer_contact` | See golfer email + phone on the sheet | yes |
| Money | `money.cancellations` | See the Cancellations list | yes |
| | `money.payments` | See Payments (what was charged, totals) | no |
| | `money.refund` | Issue refunds | no |
| | `money.charge_fee` | Charge a late or no-show fee by hand (Part B, `manual` timing) | no |
| | `money.payouts` | See payouts | no |
| Members | `members.view` | See the member list | no |
| | `members.edit` | Add / edit members, send dues reminders | no |
| Schedule | `schedule.view` | See schedules and blocked days | no |
| | `schedule.edit` | Edit schedules, block whole days, regenerate the sheet | no |
| Course | `analytics.view` | See Analytics | no |
| | `messages.use` | Message GreenReserve from the dashboard | yes |
| | `settings.edit` | Edit course settings (except the owner-only ones below) | no |

**Never grantable (owner only, no toggle):** staff & permissions, Stripe connection and
payouts setup, the operator agreement, approving the course page / requesting changes,
the cancellation & card policy (Part B), and deleting the course. These move money
destinations, sign contracts or change who has power, so they belong to the owner.

`sheet.weather_cancel` requires `sheet.cancel`, and `sheet.waive_fee` requires
`sheet.cancel`; the editor enforces dependencies (turning one on turns its prerequisite
on, and turning a prerequisite off turns its dependents off).

### A3. Presets

Presets are starting points that fill the toggles. After a preset is applied the owner
can change any toggle, and the row then shows "Custom".

- **Starter** — `sheet.view`, `sheet.checkin`, `sheet.no_show`, `messages.use`.
- **Front desk** (default for new staff) — Starter + `sheet.counter_payment`,
  `sheet.walkin`, `sheet.cancel`, `sheet.block`, `sheet.golfer_contact`,
  `money.cancellations`.
- **Manager** — every grantable key.
- **Legacy** (not offered; computed for staff created before this ships) — exactly
  today's behavior minus `sheet.weather_cancel` and `sheet.waive_fee`, so no existing
  login loses anything it uses daily, and none keeps the power to refund.

### A4. Data model (one additive migration)

`CourseStaff`:
- `permissions String[] @default([])` — the keys.
- `preset String @default("")` — `"starter" | "front_desk" | "manager" | "custom" | ""`.
- `permissionsSetAt DateTime?` — null means "never set": the row is resolved as the
  **Legacy** preset in code. This avoids a backfill (CLAUDE.md: a migration that rewrites
  existing rows needs a Neon branch and Cam's approval).

`StaffPermissionChange` (new, append-only audit table): `id, courseId, staffId,
changedBy (operator id), before String[], after String[], createdAt`. The Staff screen
shows "Changed by Pat on Oct 4" under each person.

### A5. Enforcement — one function, server-side

`src/lib/staff-permissions.ts` owns the catalog, presets, dependencies and
`can(session, key)`. `resolveDashboardSession()` loads the staff row's permissions once
per request and exposes `session.permissions` (owners: every key).

Every gated route calls `requirePermission(session, key)`, which returns the existing 403
shape with a message naming the permission ("Your login can't cancel times for
weather — ask the course owner to turn on 'Weather → Cancel times' for you."). The
client hides what a login can't do, but **the server is the gate**; a hidden button is
never the control.

Route map (every row is a check in the route):

| Route / action | Key |
|---|---|
| `bookings` PATCH `checkin` | `sheet.checkin` |
| `bookings` PATCH `paid_offline` | `sheet.counter_payment` |
| `bookings` PATCH `no_show` / `still_coming` | `sheet.no_show` |
| `bookings` PATCH `cancel` | `sheet.cancel`; with `waiveFee: true` also `sheet.waive_fee` |
| `bookings` POST (walk-in) | `sheet.walkin` |
| `tee-times` POST / DELETE | `sheet.edit_times` |
| `tee-times` PATCH block/open | `sheet.block` |
| `frost-delay` apply | `sheet.delay_start` (preview open to `sheet.view`) |
| `weather-cancel` apply | `sheet.weather_cancel` (preview open to `sheet.view`) |
| `bookings` GET golfer email/phone | stripped unless `sheet.golfer_contact` |
| Money: payments / payouts / refund | `money.payments` / `money.payouts` / `money.refund` |
| `members` GET / write, `remind-overdue` | `members.view` / `members.edit` |
| `schedule` GET / write, `blackouts`, `regenerate-tee-times` | `schedule.view` / `schedule.edit` |
| `analytics` | `analytics.view` |
| `messages` | `messages.use` |
| `settings` PATCH (non-policy fields) | `settings.edit` |

Everything in the "never grantable" list keeps `STAFF_FORBIDDEN`.

### A6. The Settings screen — Settings → Staff & permissions

- A list of staff: name, email, preset (or "Custom"), active toggle, last changed.
- Add staff: name, email, preset (Front desk preselected). The setup email is sent as today.
- Open a person to see their permissions grouped as in A2. Each toggle has a one-line
  description in plain words. The money-moving toggles (`sheet.waive_fee`,
  `sheet.weather_cancel`, `money.refund`) carry a "Moves money" note.
- Apply preset: replaces the toggles, with a confirm that lists what changes.
- Save → pending → "Saved" or an inline error (no-silent-failures rule).
- Deactivate / reactivate a person; their session is refused on the next request
  (`resolveDashboardSession` already re-reads `active`).

### A7. What staff see

- **Sidebar:** shows only the pages the login has at least one permission for.
- **Tee sheet:** row actions (Check in, Pay, Walk-in, Cancel, Block, Delete) render only
  when permitted. Weather shows the tabs the login may use; with neither, the button is
  hidden. A preview stays possible for anyone who can view the sheet.
- **Golfer contact:** hidden in the sheet and booking detail without `sheet.golfer_contact`.
- **Money:** tabs follow the money keys (replaces the hardcoded `STAFF_TABS`).
- A page a staff member can't open shows "Your login doesn't include this — ask the course
  owner" (never a blank page or a silent redirect).

### A8. GreenReserve admin

`/admin/courses/[id]` → Team tab lists the course's staff with their preset and
permissions (read-only), so support can answer "why can't my starter cancel?" without
logging in as the course.

### A9. Verification (Part A)

- A local Postgres with every migration applied from scratch, and a zero `migrate diff`.
- For each preset, a login hits every gated route: 200 when permitted and 403 with the
  named message when not (scripted with curl).
- A legacy row (permissionsSetAt null) can still do everything it did, but gets 403 on
  weather-cancel apply and waive-fee.
- Playwright screenshots of the Staff screen, a Starter's sheet, and a Manager's sheet.

---

## Part B — Cancellation & card policy

### B0. OPEN DECISION — card saving vs GreenReserve's own fee (Cam to decide)

Since FB-3 (Cam 2026-09-29) **every online booking saves a card, whatever the course's
fee setting**, because GreenReserve's $1.50/player booking fee is charged to that card
when a group no-shows or pays at the counter (`src/app/api/bookings/route.ts:206-219`,
`src/lib/access-fee.ts`). CLAUDE.md's "no-fee courses skip card collection" is out of
date.

So "let the course turn off card saving" has a cost: on that course, a no-show or a
counter-paid round means GreenReserve's fee **cannot be collected**. Options:

1. **The card is always saved; the course controls only its OWN fees.** "No fee" then
   means "the course never charges your card", and the golfer copy says the card covers
   only the booking fee. GreenReserve keeps its fee. (Recommended.)
2. **The course may turn the card off.** GreenReserve's fee is then collected online at
   booking (charged up front, refunded on an early cancel) instead of on the card later.
   Golfers pay $1.50/player at booking on those courses.
3. **The course may turn the card off, and GreenReserve absorbs lost fees** on its
   no-shows and counter payments.

Part B's card-off switch is not built until Cam picks. Everything else in Part B is
independent of it.

### B1. What exists today

- `cancellationHours` (default 24): the free-cancel window.
- `lateCancellationFeeCents` (default $10, per booking): when the window closes, the
  `hourly` cron CHARGES it as a hold to every still-confirmed booking; it is refunded at
  check-in. Cancelling late keeps it. 0 = no fee.
- The no-show path charges only GreenReserve's fee (FB-3), never a course fee.
- `checkInWindowHours`, `rainCheckPolicy` (free text).

### B2. The policy the owner sets (Settings → Cancellation & card)

One screen, written as plain choices, with a live preview of what the golfer will read.

1. **Card at booking:** Required for every booking (today). The "Not required" option
   waits on B0.
2. **Free cancellation until:** N hours before the tee time (1–168), as today.
3. **Late cancellation fee:** off, or an amount — **per booking** or **per player** (new).
4. **When the late fee is taken** (new; only if a fee is set):
   - **Hold at the cutoff, refunded at check-in** — today's behavior.
   - **Only if they cancel late** — nothing is charged at the cutoff; the fee is charged at
     the moment of a late cancellation.
   - **If they cancel late or don't show** — as above, plus the fee is charged when staff
     mark a no-show (after the course's no-show grace).
   - **Never automatically** — the card is on file; staff charge it by hand from the
     booking ("Charge late fee"), which requires `money.refund`-level trust, so it is gated
     by a new `money.charge_fee` permission.
5. **No-show fee** (new, optional): a separate amount for a no-show, per booking or per
   player. It is charged when staff mark a no-show; "still coming" refunds it.
6. **Weather / course-closed cancellations:** always free, and a hold is always refunded
   (fixed rule; shown, not editable).
7. **Rain-check policy:** free text, as today.

### B3. Data model (additive)

`Course`:
- `cardPolicy String @default("required")` — `"required"`; `"not_required"` waits on B0.
- `lateFeeBasis String @default("booking")` — `"booking" | "player"`.
- `lateFeeTiming String @default("hold_at_cutoff")` — `"hold_at_cutoff" | "late_cancel" |
  "late_cancel_or_no_show" | "manual"`.
- `noShowFeeCents Int @default(0)`, `noShowFeeBasis String @default("booking")`.

`Booking` copies the policy **at booking time** (like `cancellationHoursAtBooking`):
`lateFeeTimingAtBooking String?`, `noShowFeeTotal Int @default(0)`. A golfer is held to
the terms they booked under; a policy change never reaches existing bookings.

Defaults equal today's behavior exactly, so the migration changes nothing until an owner
edits the policy.

### B4. Behavior changes, by file

- `src/app/api/bookings/route.ts`: compute `cancellationFeeTotal` per basis × players;
  copy the timing and the no-show fee onto the booking.
- `src/app/api/cron/hourly` + `cancellation-cutoff`: charge the hold only when the
  booking's timing is `hold_at_cutoff`. Others get the "free cancellation ends now" email
  instead of a charge.
- `src/lib/cancel-booking.ts`: on a late cancel with timing `late_cancel` /
  `late_cancel_or_no_show`, charge the fee then (best effort; a failed charge is recorded
  and shown on Money → Cancellations, never blocks the cancel).
- `operator/bookings` `no_show`: charge the no-show fee and/or the late fee per timing;
  `still_coming` refunds what the no-show charged.
- New `operator/bookings` action `charge_fee` (for `manual` timing), gated by
  `money.charge_fee`.
- Golfer surfaces: the course page, the booking page, the confirmation email, the
  reminder emails and the check-in page state the policy the booking was made under,
  generated from one function (`describePolicy(policy)`) so the wording can never disagree.
- Birdie's operator knowledge and course context describe the new options.
- Analytics: no-show fees and late fees as separate revenue lines.

### B5. Verification (Part B)

- Unit-style checks of `describePolicy` for every combination.
- Local Postgres: a booking under each timing, driven through cutoff (cron run by hand),
  late cancel, no-show, still coming and check-in; the DB state and recorded events are
  checked after each step. Stripe can't run locally, so each charge path is verified to the
  call site with the amount logged; a live walk on a test course is the final check.

---

## Build order

1. **A — permissions** (migration A4, lib, route gates, Settings screen, sidebar/sheet,
   admin Team tab). This closes the /gr-review HIGH.
2. **B without the card switch** (basis, timing, no-show fee, policy screen,
   `describePolicy`, all golfer copy).
3. **B card switch** after Cam decides B0.

Each lands as its own PR with a local migration check, and its queue box stays open until
a live walk.
