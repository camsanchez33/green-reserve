# Manage Booking Spec — guests manage tee times without an account

Read CLAUDE.md first. One phase per run. GreenReserve accounts are a FUTURE feature
(save info across courses). Managing ONE booking must never require login — it works
off the booking's emailed token, exactly like the existing check-in flow
(/checkin/[bookingId]?token=). Today "Manage My Booking" wrongly points at /account
and dead-ends guests at /account/login. Fix that.

Token: reuse the existing Booking.checkInToken as the single booking-access key for
BOTH check-in and manage/cancel/modify. No new token field. (Decided with Cam.)

---

## Phase M1 — Token-gated manage page: view + cancel (no login)

- New page /manage/[bookingId]?token= — validates checkInToken, shows: course, date,
  time, party size, price breakdown, payment status, and the cancellation policy in
  plain language (free until X, fee after, or free always).
- Actions: **Cancel booking** (with a confirm step that restates the fee if past the
  window). Reuses the existing cancel-booking.ts logic and claimTeeTime capacity
  release — no parallel logic.
- Cancel API (src/app/api/bookings/cancel): accept a valid checkInToken as an
  alternative to getGolferSession — token OR session, either authorizes cancelling
  THAT booking only. Rate-limit the token path (security run pattern).
- Email fix: "Manage My Booking" button in ALL confirmation email variants →
  /manage/[bookingId]?token=... (not /account). Logged-in golfers with a real account
  can still reach it from /account; the token link is the universal path.
- Token lifetime: valid until tee time + a short grace; expired token → friendly
  "this link has expired, contact the course" page, not a crash.
- Mobile-first, course brandColor, D3 styling.

## Phase M2 — Modify on the manage page (no login)

- From /manage: **Change tee time** (same course) and **change party size**.
- Change time: show the same corresponding tee-sheet availability (reuse G2 filters),
  pick a new slot, claimTeeTime the new slot + release the old ATOMICALLY (one
  transaction — never release-then-claim, or the golfer can lose their slot to a race
  and get nothing). If the new slot's price differs, show the new breakdown before
  confirming.
- Change party size: capped at the slot's remaining seats (their own current seats
  count as available); recompute green fee + $1.50/player service fee; show the diff.
- Card-on-file consequence: since nothing is charged until check-in, a modify just
  updates the booking — no new charge at modify time. If party size drops after a
  late-cancel fee was already charged, handle per existing fee logic (verify, don't
  invent).
- Confirmation email re-sent on successful modify (new details, same manage/check-in
  links). One email, not spam.

## Phase M3 — Update card on the manage page (SCOPED — read the recommendation)

RECOMMENDATION TO CAM before building: check-in already lets a golfer enter a fresh
card at pay time (the walk-up-decline path). So a standalone "change card" on manage
is partly redundant. Build it ONLY as: token-gated Stripe SetupIntent (Stripe
Elements — the card number NEVER touches our server, PCI-safe, same as booking), that
replaces the saved PaymentMethod on the booking. Guardrails:
- Card entry is Stripe Elements only; we store the PaymentMethod id, never PAN.
- Rate-limit; the manage token is the only auth — acceptable because it can already
  cancel, and a card swap can't extract money (only future check-in charge uses it).
- No display of the existing card beyond brand + last4 (already what Stripe returns).
If this feels like more risk than value for v1, SKIP M3 — cancel + modify cover the
real need and check-in handles a bad card. Cam decides at run time.

## Phase M4 — Course-configurable check-in window ("time to check in" email)

The check-in reminder email (sendCheckInAvailableEmail) ALREADY fires ~3h before tee
time from the crons. Two gaps:
- Make the window course-configurable: Course.checkInWindowHours Int @default(3)
  (schema change). Operator sets it in dashboard Settings ("Let golfers check in ___
  hours before their tee time"). The crons use this per-course value instead of the
  hardcoded ~3h.
- The email already links to /checkin/[bookingId]?token= (online) and explains staff
  can check them in at the clubhouse — verify copy says both clearly: "Check in
  online now, or do it at the clubhouse when you arrive."
- This is the "confirming I'm coming" flow Cam described: course sets the window →
  golfer emailed when it opens → confirm/check in online or in person.
- Schema change → run attended (prisma migration per the production-readiness run's
  new workflow, if that's shipped; else db push).

---

## Ground rules
- One phase per run. M4 is a schema change (attended). M1–M3 no migration.
- The manage token authorizes exactly ONE booking — never enumerate or cross to other
  bookings; verify with an isolation test case (wrong token / other booking id → 404).
- Card data: Stripe Elements/SetupIntent only, never on our server. No PAN in logs.
- Reuse: cancel-booking.ts, claimTeeTime(), G2 filter UI, existing emails. Extend,
  don't duplicate.
- Modify time = atomic swap (new claim + old release in one transaction).
- CLAUDE.md gotchas apply.
