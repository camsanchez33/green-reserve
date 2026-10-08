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
| 1 | BI-1 Monthly AI review | built (PR) | — |
| 2 | ACT-1 Move a group (staff) | spec | — |
| 3 | ACT-2 Birdie acts on the tee sheet | spec | confirm the rule change (below) |
| 4 | POS-1 Pro shop sales | spec | hardware + fee decision |
| 5 | MSG-1 Reminders + messages to golfers | spec | Twilio A2P registration (SMS only) |
| 6 | OUT-1 Tournaments & outings + invoices | spec | — |
| 7 | FB-1 Food & beverage | after POS-1 | — |
| 8 | PWA-1 "Add to Home Screen" booking app | small, any time | — |
| 9 | SHEET-2 Board view of the tee sheet (drag to move) | after ACT-1 | — |
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
  time's rate" when the rates differ, offered only for standard-rate bookings.
  The golfer's own swap keeps repricing to the new slot (they chose it), but
  member rates are re-applied through the tier and the booking fee keeps its
  per-player amount (0 stays 0). The tier-rate helper moves out of the
  bookings route into src/lib/tier-rates.ts unchanged.
- **Cancellation window:** the policy copied onto the booking stays; the
  cutoff moves with the tee time. A hold already charged stays charged (it is
  refunded at check-in as always). Moving into a time whose cutoff has passed
  shows "the free-cancellation window for this time has closed — the hold is
  charged within the hour" before confirming.
- New BookingEvent type `booking_moved` (additive enum value) with from/to.
- Golfer emailed (`sendBookingModifiedEmail`); texted once MSG-1 is live.
- Permission key `sheet.move` ("Move a group to another time"), in the Front
  desk+ presets that already hold `sheet.walkin`.
- Tee sheet: expanded row → Move → day picker + times with room, price and
  window notes, Confirm. Toast "{name} moved to 8:16 AM."

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
- **Counter sale** (no booking): needs a card reader. **Decision for Cam:**
  Stripe Terminal smart readers (server-driven, work from the web dashboard,
  ~$250–350 each) vs Tap to Pay on iPhone (no hardware, but needs a native app,
  which we don't have). Recommendation: server-driven reader first.
- **Decision for Cam:** does GreenReserve take a fee on shop sales (a second
  revenue line), and how is it worded? Fee copy is legal-gated (legal/LQ-2).
- Daily sales on Analytics; feeds BI-1.

## 5. MSG-1 — reminders and messages to golfers

Email works today; SMS is blocked on Twilio A2P registration (Cam). Build both,
SMS switched on by env. Automatic reminders (day before, with the check-in /
pay link); course messages to a day's golfers ("frost delay to 9am"), to
members, or to past golfers who opted in. Opt-out honoured on every text; the
STOP keyword is handled. Lives on the existing Messages tab.

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

## Parked (and why)

- **Employee scheduling** — Homebase and 7shifts already do it well and free;
  no course switches tee sheets for it. Revisit if courses ask; link out first.
- **Maintenance spending** — superintendents run their own tools and it doesn't
  drive a switch. Revisit after POS-1 (spend tracking may fall out of it).
- **A native app per course** — see PWA-1.
