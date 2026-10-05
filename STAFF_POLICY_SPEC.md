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

`/admin/courses/[id]` → Overview → **Staff & access** card lists each person with their preset and an
expandable, read-only permission list (money-moving ones marked), so support can answer "why can't my
starter cancel?" without logging in as the course. (Built on the existing staff card rather than a new
Team tab — MP-5d cut the course page to six tabs on purpose.)

### A9. Verification (Part A)

- A local Postgres with every migration applied from scratch, and a zero `migrate diff`.
- For each preset, a login hits every gated route: 200 when permitted and 403 with the
  named message when not (scripted with curl).
- A legacy row (permissionsSetAt null) can still do everything it did, but gets 403 on
  weather-cancel apply and waive-fee.
- Playwright screenshots of the Staff screen, a Starter's sheet, and a Manager's sheet.

---

## Part B — Cancellation & card policy

### B0. DECIDED (Cam 2026-10-05) — card saving vs GreenReserve's own fee

Cam: "They pay a booking fee whenever they pay so payment only happens when they pay. If the course has a
cancellation policy then we uphold that policy with our fee as well."

- GreenReserve's $1.50/player fee is collected **when the golfer pays** (check-in, the pay link, or a card
  charge the course's policy triggers). It no longer forces a card on every booking (reverses FB-3's
  "every booking saves a card").
- **A card is required only when there is something to charge it for:** a late-cancellation fee or a
  no-show fee. No fee → no card; the golfer pays at check-in (B2 option 5).
- **"We uphold that policy with our fee as well":** whenever the course's policy charges the golfer (late
  cancel, no-show), GreenReserve's fee for that booking is charged at the same moment, to the same card.
- Accepted cost: a no-card booking that never shows owes nothing to anyone. A no-card round paid at the
  counter has no card for GreenReserve's fee — **follow-up for Cam:** invoice the course for those fees, or
  steer such courses to the pay link. Not built until Cam says which.

### B1. What exists today

- `cancellationHours` (default 24): the free-cancel window.
- `lateCancellationFeeCents` (default $10, per booking): when the window closes, the
  `hourly` cron CHARGES it as a hold to every still-confirmed booking; it is refunded at
  check-in. Cancelling late keeps it. 0 = no fee.
- The no-show path charges only GreenReserve's fee (FB-3), never a course fee.
- `checkInWindowHours`, `rainCheckPolicy` (free text).

### B2. The policy the owner sets (Settings → Pricing & cancellation → Cancellation & card)

Cam 2026-10-05 picked every option below. Plain choices, with a live preview of exactly what the golfer
reads (generated by `describePolicy()`).

1. **Late-cancellation fee:** off, or an amount — **per booking** or **per player**.
2. **Free cancellation until:** N hours before the tee time (as today).
3. **When the late fee is taken** (only with a fee):
   - **Hold at the cutoff, refunded at check-in** — today's behavior.
   - **Only if they cancel late** — nothing at the cutoff; charged the moment they cancel inside the window.
   - **If they cancel late or don't show** — as above, plus the no-show charge below.
4. **No-show fee** (optional, separate amount, per booking or per player) and **automatic no-show**
   (Cam: "if the player never checked in then it could be a no show"): N minutes after the tee time with
   nobody checked in, the booking is marked a no-show and charged. Staff can still mark one by hand, and
   "still coming" undoes it and refunds what it charged.
5. **No card — pay at check-in** (Cam's fifth option; the result of having no fees at all): the golfer books
   with no card. At the course's set time before the round (`checkInWindowHours`) they get an email with
   their pay link, and pay there (card entered and charged — the existing check-in page). Nothing can be
   charged for a late cancel or a no-show.

Card at booking follows from 1 and 4: required when either fee is on, otherwise not asked for.
Weather / course-closed cancellations are always free and refund any hold (fixed rule, shown).

### B3. Data model (additive)

`Course`:
- `lateFeeBasis String @default("booking")` — `"booking" | "player"`.
- `lateFeeTiming String @default("hold_at_cutoff")` — `"hold_at_cutoff" | "late_cancel" | "late_cancel_or_no_show"`.
- `noShowFeeCents Int @default(0)`, `noShowFeeBasis String @default("booking")`.
- `autoNoShowMinutes Int?` — null = off; otherwise minutes after the tee time with nobody checked in.

Card at booking is DERIVED, not stored: `lateCancellationFeeCents > 0 || noShowFeeCents > 0`.

`Booking` copies the policy **at booking time** (like `cancellationHoursAtBooking`), so a policy change
never reaches existing bookings: `lateFeeTimingAtBooking String?`, `noShowFeeTotal Int @default(0)`,
`autoNoShowMinutesAtBooking Int?`. Existing rows (null timing) behave as `hold_at_cutoff`, i.e. exactly as
today. Defaults equal today's behavior, so the migration changes nothing until an owner edits the policy.

### B4. Behavior changes, by file

- `src/lib/cancel-policy.ts` (new, client-safe): the policy type, `cardRequired(policy)`,
  `lateFeeCents(policy, players)`, `noShowFeeCents(policy, players)`, and `describePolicy(policy)` — the ONE
  source of golfer-facing wording.
- `src/app/api/bookings/route.ts` + `src/app/book/BookClient.tsx`: ask for a card only when `cardRequired`;
  a no-card booking is `paymentStatus: 'no_payment_method'` (the pre-FB-3 path, still handled downstream);
  copy fee totals and timing onto the booking.
- `src/app/api/cron/hourly` + `cancellation-cutoff`: charge the hold only for `hold_at_cutoff` bookings.
  No-card bookings get the pay-link email at `checkInWindowHours` (existing section 3). New: automatic
  no-show for bookings whose `autoNoShowMinutesAtBooking` has passed with nobody checked in.
- `src/lib/cancel-booking.ts`: a late cancel under `late_cancel` / `late_cancel_or_no_show` charges the late
  fee then, plus GreenReserve's fee (B0); under `hold_at_cutoff` the kept hold is joined by GreenReserve's
  fee. Best effort: a failed charge is recorded and shown on Money → Cancellations, never blocks the cancel.
- `operator/bookings` `no_show` (and the automatic one): charge the no-show fee when set, plus
  GreenReserve's fee (existing FB-3 path); `still_coming` refunds both.
- Golfer surfaces — the course page, the booking page, the confirmation email and the check-in page —
  print `describePolicy()` for the terms the booking was made under.
- Birdie's operator knowledge and course context describe the options.

### B5. Verification (Part B)

- Unit-style checks of `describePolicy` for every combination.
- Local Postgres: a booking under each timing, driven through cutoff (cron run by hand),
  late cancel, no-show, still coming and check-in; the DB state and recorded events are
  checked after each step. Stripe can't run locally, so each charge path is verified to the
  call site with the amount logged; a live walk on a test course is the final check.

---

## Built — Part A (2026-10-05)

Migration `staff_permissions` (CourseStaff.permissions/preset/permissionsSetAt + StaffPermissionChange).
Every route in A5 gated; the 200/403 matrix was run for owner, Manager, Front desk, Starter and a Legacy row
and matched A2/A3 cell for cell (Legacy: everything it had, 403 on weather-cancel apply and waive). Single
cancel gained "Cancel, no fee" (sheet.waive_fee) on Money → Cancellations. Live walk pending.

## Built — Part B (2026-10-05)

Migration `cancellation_policy` (additive). `src/lib/cancel-policy.ts` (policy, card rule, fee maths,
`describePolicy`), `src/lib/no-show-fee.ts` (one mark-a-no-show path for staff and the cron, plus the
"still coming" refund). Booking asks for a card only when required (Stripe JS loads only then, via
`@stripe/stripe-js/pure`); the policy is copied onto the booking. Crons hold only `hold_at_cutoff`
bookings; late-cancel timings charge at the cancellation; GreenReserve's fee follows any course fee (and
the old "refund our fee on every cancel" now applies only to free/waived cancels); automatic no-show in
the hourly cron. Owner screen: Settings → Pricing & cancellation → Cancellation & card with a live
"What golfers will see" preview; the course page, booking page, confirmation email, Money page and Birdie
use the same wording. Verified locally: policy save/validation/owner-only; card refused/omitted per
policy; terms copied onto the booking; automatic no-show marked by the hourly cron; a late cancel with no
card cancels and records the failed fee. Stripe charge calls can't run locally — verified to the call
site; a live walk on a test course with real cards is the final check.

## Build order

1. **A — permissions** (migration A4, lib, route gates, Settings screen, sidebar/sheet,
   admin Team tab). This closes the /gr-review HIGH.
2. **B without the card switch** (basis, timing, no-show fee, policy screen,
   `describePolicy`, all golfer copy).
3. **B card switch** after Cam decides B0.

Each lands as its own PR with a local migration check, and its queue box stays open until
a live walk.
