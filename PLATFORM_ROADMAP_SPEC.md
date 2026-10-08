# PLATFORM_ROADMAP_SPEC — beyond the tee sheet (Cam 2026-10-07)

Cam 2026-10-07: "us being free is a huge advantage but still needs to be
excellent … we need to cover everything excellently not just the tee sheet …
I really want the AI and business intelligence to be big." Then: "start to do
all the other stuff too."

**The test for every item:** does it remove a reason a course won't switch, or
does it make money? One reviewed PR per item, in the order below. Money, schema
and auth work stays with the overseer (CLAUDE.md). No course is live yet, so
the first live course's feedback re-orders this list.

| # | Item | Status | Waiting on Cam |
|---|---|---|---|
| 1 | BI-1 Monthly AI review | shipped (#92) | — |
| 2 | ACT-1 Move a group (staff) | shipped (#93) | — |
| 3 | ACT-2 Birdie acts on the tee sheet | shipped (#94) — cancels wait | confirm the rule change (below) |
| 4 | POS-1 Pro shop sales | spec | hardware + fee decision |
| 5 | MSG-1 Reminders + messages to golfers | v1 built (PR): notices to a day's golfers | Twilio A2P registration (SMS only) |
| 6 | OUT-1 Tournaments & outings + invoices | spec | — |
| 7 | FB-1 Food & beverage | after POS-1 | — |
| 8 | PWA-1 "Add to Home Screen" booking app | small, any time | — |
| 9 | SHEET-2 Board view of the tee sheet (drag to move) | built (PR) | — |
| — | Employee scheduling, maintenance spend, native app per course | parked | see "Parked" |

---

## 1. BI-1 — the monthly AI review (decided 2026-10-07)

On the 1st of each month every live course gets a written review of the month
before, on Analytics and emailed to the owner.

- **The numbers come from code, never from the model.** `computeAnalytics()`
  (src/lib/analytics.ts) computes the month; the model only interprets them
  ("the AI doesn't make up numbers but it can interpret them"). Every figure in
  the text must be one it was given; the prompt forbids new numbers and the
  route checks the output against the input's numbers before saving.
- **Month 1 is the baseline** (Cam: "after 1 month then metrics are set"). The
  first full month a course is live sets its targets automatically: fill rate,
  collected revenue, no-show rate, cancellation rate, unfilled-slot loss,
  returning-customer share. Its review says what happened and "this is your
  starting line". From month 2 the review measures against the baseline and the
  previous month. The owner can reset a target (a rained-out month). A partial
  first month (went live mid-month) is not a baseline; the next full month is.
- **Shape:** a one-sentence verdict; what went well; where the course fell short
  of a target and by how much; three specific recommendations, each tied to a
  number ("Tue–Wed 1–4pm ran 22% full while weekend mornings sold out — a
  twilight rate on those blocks"). Where a recommendation maps to a Birdie draft
  (a rate change, a schedule change) the review links "Set this up" to Birdie.
- **Thin data says so.** Under ~40 bookings in the month the review says the
  sample is small and gives no recommendation it can't support.
- **Delivery:** Analytics → "Monthly reviews" (newest first, owner logins and
  `analytics.view` only), and an email to the course owner.
- **Built:** migration `20261007234814_monthly_review` (MonthlyReview, additive),
  `cronRoute('monthly-review')` daily at 12:00 UTC ("due and not yet written",
  12 courses a run, failed drafts retried next day), `src/lib/monthly-review.ts`,
  `/api/operator/monthly-reviews` (analytics.view), Analytics → Monthly reviews,
  `sendMonthlyReviewEmail`, `scripts/monthly-review-test.ts`.
- **BI-1b (next, small):** the owner resets a target ("use this month as my
  starting line"); "Set this up" links from a recommendation to a Birdie draft.

## 2. ACT-1 — move a group to another time (staff)

Doesn't exist today, even by hand. What already moves bookings, and how:
the golfer's own "change my time" (`/api/manage/[id]/swap-time`) reprices to
the new slot's STANDARD rate and resets the booking fee to $1.50 × players —
wrong for member bookings (they lose their rate) and for counter bookings
(they gain a fee they never had) — and logs no event; frost delay
(`lib/frost-delay.ts`) keeps the price and logs no event.

Build ONE `moveBooking()` (src/lib/move-booking.ts) that all three use:
- Serializable transaction (claim new slot, release old, P2034 → "just taken").
- Same course, new slot not blocked, room for the whole group, not in the
  past, booking still confirmed and not checked in.
- **Price:** the booked price is KEPT by default (a course-initiated move
  shouldn't change what the golfer agreed to). Staff may tick "Charge the new
  time's rate" when the rates differ; a member is priced at their tier's rate
  for the new day. A round already PAID (admin "collect payment") is never
  repriced. A flagged no-show can't be moved — "Still coming" first (it
  refunds any no-show charges).
  The golfer's own swap keeps repricing to the new slot (they chose it), but
  member rates are re-applied through the tier and the booking fee keeps its
  per-player amount (0 stays 0). The tier-rate helper moves out of the
  bookings route into src/lib/tier-rates.ts unchanged.
- **Cancellation window:** the policy copied onto the booking stays; the
  cutoff moves with the tee time. A hold already charged stays charged (it is
  refunded at check-in as always). **Open question for Cam:** when the COURSE moves a
  group whose hold was already taken to a later time (back outside the
  window), the hold stays, so cancelling then keeps it — the golfer lost free
  cancellation through no act of their own. Option: refund the hold on a staff
  move that lands outside the window. Today staff need `sheet.waive_fee` to
  make it right. Moving into a time whose cutoff has passed
  shows "the free-cancellation window for this time has closed — the hold is
  charged within the hour" before confirming.
- New BookingEvent type `booking_moved` (additive enum value) with from/to.
- Golfer emailed (`sendBookingModifiedEmail`); texted once MSG-1 is live.
- Permission key `sheet.move` ("Move a group to another time"), in the Front
  desk+ presets that already hold `sheet.walkin`.
- Tee sheet: expanded row → Move → day picker + times with room, price and
  window notes, Confirm. Toast "{name} moved to 8:16 AM."

**Checked-in groups (Cam 2026-10-08, "people are going to check in online"):**
staff — and Birdie's move draft — can move a group that has already checked
in. The round is paid, so the price always stays and nothing is charged or
refunded; the move email drops "Check In & Pay" and reads the total as already
paid. The golfer's own swap and the frost delay still refuse checked-in groups.

## 3. ACT-2 — Birdie acts on the tee sheet

Cam: "integrated into the tee sheet able to move around stuff cancel stuff etc
not just a chat bot." New propose tools: move a group (ACT-1), cancel one
booking, batch-cancel ("everything after 1pm Saturday — weather"), add a phone
booking or walk-in, block/unblock specific times, send pay links.

**Rule kept: every action ends in one tap from a person.** Birdie drafts, the
confirm card shows exactly what will happen, the staff member taps Confirm, and
the page's own route does it under that person's permissions. A batch is one
tap. **Rule changed (pending Cam's yes):** cancels move ONTO Birdie, guarded by
the card stating the money outcome in the golfers' own wording
(`cancelNowWords()`): "$25 late fee charged" vs "no fee", with the waive choice
on the card when the person may waive. Birdie never picks the money outcome.
Refunds, Stripe, the policy and staff stay off it. Each new tool: a propose
function, its route in PROPOSAL_ROUTES, a check in birdie-isolation-test.ts.

## 4. POS-1 — pro shop sales

Removes the "what about my POS?" objection. Not a full retail system:
- A product catalog per course (apparel, balls, range buckets, cart, rental
  clubs): name, price, category, optional stock count.
- **Add to the round:** staff add items to a group's booking on the tee sheet;
  they're charged with the round at check-in or on the golfer's pay link — this
  works with what exists today, no hardware.
- **Counter sale** (no booking): a **Stripe Terminal smart reader** (Cam
  2026-10-08: "I would do reader"). Server-driven: staff ring the sale up on the
  dashboard, the reader on the counter takes tap / chip / swipe. Tap to Pay is
  out — it only works inside a native app.
- **GreenReserve's fee (Cam 2026-10-08):** $0.50 **per sale** (not per item),
  **paid by the golfer** ("our whole thing is free for course"), collected as
  the Stripe application fee on the sale.
  - **Open, needs legal (LQ-2) before the counter fee ships:** a fee added only
    when a golfer pays by card at a register is a card *surcharge* under card
    network rules (credit only, capped as a % of the sale — 50¢ on a $4 item is
    12.5% — advance notice, receipt disclosure) and some states restrict or ban
    surcharges. Items added to a round ride the existing booking-fee model and
    are not affected. Until legal answers, counter sales are built with the fee
    as a setting that defaults OFF.
  - Note: GreenReserve's existing 50¢ on membership dues is taken from the
    course's side (application fee inside the dues), the opposite of this rule.
- **Build order:**
  - POS-1a: shop catalog (Settings → Pro shop) + "Add to round" from the tee
    sheet panel; items are charged with the round (check-in, pay link) with the
    50¢ fee. Touches every round-charge path (check-in, pay link, partial party,
    move, refunds, receipts) — overseer-only, schema change.
  - POS-1b: counter sale with the reader (Stripe Terminal location + reader
    registration in Settings, sale screen, card_present PaymentIntent with the
    application fee, refunds). Needs Cam to order a reader and Stripe Terminal
    enabled on the connected accounts; built against Stripe's simulated reader
    in test mode.
  - POS-1c: shop sales on Analytics (Money tab) and in the monthly review.
- Daily sales on Analytics; feeds BI-1.

## 5. MSG-1 — reminders and messages to golfers

Email works today; SMS is blocked on Twilio A2P registration (Cam). Build both,
SMS switched on by env. Automatic reminders (day before, with the check-in /
pay link); course messages to a day's golfers ("frost delay to 9am"), to
members, or to past golfers who opted in. Opt-out honoured on every text; the
STOP keyword is handled. Lives on the existing Messages tab.

**MSG-1 v1 (built 2026-10-08):** "Message golfers" on the tee sheet sends a
course's notice to everyone booked on a day or a window of it — email always,
text when Twilio is set up and the box is ticked ("Reply STOP to opt out"
appended). One message per golfer, replies go to the course's email, every
send logged (`CourseMessage`) with its outcome, six notices an hour per course,
permission `sheet.message_golfers` (Front desk, Manager). Day-before reminders
already exist (`send-reminders` cron). Later: members and opted-in past golfers
(needs consent + unsubscribe), and a Birdie draft for it.

## 6. OUT-1 — tournaments & outings, with invoices

Turns the "Soon" tabs real. An outing = a block of tee times (shotgun or tee
times), a contact, a headcount, a price per player, extras from the POS-1
catalog, and an invoice: deposit, balance due date, paid online through Stripe
on the course's account, reminders until paid. Tournaments add a field list and
pairings. Feeds BI-1.

## 7. FB-1 — food & beverage

POS-1 with a kitchen category and a cart-staff screen on a phone (sell from the
cart, charge to a group's round or take a card). After POS-1.

## 8. PWA-1 — "Add to Home Screen"

Instead of a native app per course (an App Store submission, review and update
cycle for every course): a web-app manifest and icon per course so regulars
can save the course's booking page to their phone, with a saved golfer account
for one-tap rebooking. Small; can ship any time.

## 9. SHEET-2 — a board view of the tee sheet (Cam 2026-10-07, "noted for later")

Cam: "in almost a calendar type style … each was a box on the page that can
easily be moved around … like a draft board." A second view beside today's list, laid out like a draft board: each tee time
is a card in a grid (a column per hour, that hour's times stacked down it, the
whole day visible at once), a group is a chip
inside its card, and dragging a group onto another card IS the ACT-1 move —
same checks, same price and window notes, same confirm. Builds on ACT-1, so it
comes after it. Guardrails: the list stays (a full day is 50–60 times; the
counter scans the list fastest), drag needs a tap-to-move fallback for touch
and keyboard, nothing moves without the confirm, and the homepage demo
mirrors whichever view is the default (CLAUDE.md: change one, check the other).

**Shipped (2026-10-08):** Tee sheet → **List | Board** toggle in the date bar
(remembered per browser; List stays the default, so the homepage demo is
unchanged). `src/components/dashboard/TeeSheetBoard.tsx`: a column per hour,
cards per time, a chip per group (checked-in groups carry the green dot).
Drag a chip onto a card, or tap the chip then the card (touch/keyboard; Esc
cancels), and the ACT-1 dialog opens with that time already priced; nothing
moves until "Move group". Tapping a card with nothing picked opens that time
in the list. Groups move under the same rules as the list's Move link.

**Board becomes the sheet (Cam 2026-10-08):** "on the board you should able to
pay and stuff … the board should just replace the list completely" and "these
should all be squares that you can see all the people in it and how many …
next up … green if its paid yellow if its booked". Built: equal squares (every
group and its count, "N of 4", open seats), a 3px left edge in `ok` (all paid)
/ `warn` (booked, not paid) / `bad` (declined card, no-show) with a legend,
"Next up" on the next time, and a side panel on tap carrying the list's exact
group buttons (check in, pay at counter, pay links, move, still coming) plus
walk-in, block and delete. Board is the default on tablet/desktop; phones
default to the list (a day of squares scrolls sideways there), and the toggle
stays. Queued: the homepage demo (`TeeSheetDemo.tsx`) still shows the list —
move it to the board.

**One sheet, fits the page, cancel (Cam 2026-10-08):** "make the tee sheet so
it fits the page", "is it smart to have both options" (no — one view), "you
have to be able to cancel someones time from the sheet". The list view and the
toggle are gone; the board is the sheet on every screen. One row per hour with
that hour's times across it (the busiest hour sets the column count, so :10
sits under :10), never a sideways scroll; phones get two across. The panel
gains Cancel booking / Cancel, no fee, with the same confirm and result wording
as Money → Cancellations (`lib/cancel-confirm.ts`), the same route and fee rules.
The homepage demo now shows the board and its panel too (2026-10-08).

## Parked (and why)

- **Employee scheduling** — Homebase and 7shifts already do it well and free;
  no course switches tee sheets for it. Revisit if courses ask; link out first.
- **Maintenance spending** — superintendents run their own tools and it doesn't
  drive a switch. Revisit after POS-1 (spend tracking may fall out of it).
- **A native app per course** — see PWA-1.
