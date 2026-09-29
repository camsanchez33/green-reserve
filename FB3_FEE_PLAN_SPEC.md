# FB-3 — collecting the $1.50/player when the round isn't paid by card

Status: **PLAN — needs Cam's re-confirmation before any build.** Money path;
attended. Written 2026-09-29 from a read-only map of every payment path.

## The problem (Cam's note)
When a golfer pays at the counter, staff mark the booking "paid offline" and no
card is charged — so GreenReserve's $1.50/player is never collected.

## What the code does today
- Every charge is ONE direct charge on the course's Stripe account at check-in:
  green + cart + range + the $1.50/player, with the $1.50 taken as Stripe's
  `application_fee_amount` (lib/checkin-booking.ts, lib/stripe.ts). The course
  is merchant of record and pays Stripe's fee on the whole amount.
- The $1.50 is lost on: **paid offline** (operator/bookings, no Stripe call),
  **no-shows** (only a hold fee, charged with application fee 0), and **no-card
  courses** (no late-cancel policy → the booking page collects no card at all).
- Nothing is charged at booking. The operator agreement §2, Terms §2/§4 and the
  LQ-2 frozen copy all say the fee is collected "in the same card payment".

## Option A — what was decided: charge the $1.50 at booking (separate charge)
- A second PaymentIntent on every round: Stripe's 2.9% + 30¢ on $1.50 ≈ **34¢
  (~23% of the fee)**, and the 30¢ fixed fee is paid twice per round.
  - On the course's account: the course loses money on every 1-player booking.
  - On the platform account: GreenReserve keeps ~$1.16 of each $1.50, becomes
    merchant of record for it, and handles its disputes/refunds separately.
- Rewrites: booking API + book page, check-in charge (drop the fee from it),
  cancellations/refunds/party-size/swap-time, crons (keyed on paymentStatus),
  revenue/reconciliation/export, ~15 golfer-facing strings, Terms, the frozen
  LQ-2 copy, and a new operator agreement version every course re-signs.

## Option B — recommended: keep one payment; charge the fee only when it'd be lost
1. **Every course collects a card at booking** (kept from Cam's decision). The
   no-card flow ends; the server enforces it (today only the page does).
2. **Paid offline** → at that click, charge **only the $1.50/player** to the
   saved card, off-session. One extra charge, only on rounds that would
   otherwise pay us nothing.
3. **No-show** → the same fee charge when staff mark the no-show (reversible
   "still coming" refunds it).
4. Card rounds are unchanged: one payment at check-in, fee inside it — the
   agreement, Terms and LQ-2 copy stay true, except one added sentence each
   ("if the round isn't paid by card, the $1.50/player is charged to the card on
   file").
- Cost: the 34¢-on-$1.50 problem exists only on paid-offline/no-show rounds, not
  every round. Open: charge those on the platform account (we pay the ~34¢) or
  the course's (course pays it).

## Found while mapping (bugs regardless of option)
- **Zero-price member rounds**: a tier with a $0 green fee makes the check-in
  charge = the $1.50 alone → the course pays Stripe's fee on money it never
  keeps (negative net). Needs a rule (skip the fee, or no charge).
- **Admin manual bookings** record accessFeeTotal = $1.50/player; operator
  walk-ins record $0. Pick one.
- **A fee course whose Stripe account is inactive** silently drops the golfer's
  saved card at booking.
- change-players / swap-time hardcode 150 instead of ACCESS_FEE_CENTS.
- CLAUDE.md line 4 says the fee is "charged to the golfer at booking"; the code
  and the Payment-flow section say check-in.

## Questions for Cam
1. Option A (every round, separate charge at booking) or Option B (one payment;
   fee charged separately only on paid-offline / no-show)?
2. For those separate fee charges: platform account (we eat ~34¢) or course
   account (course eats it)?
3. Zero-price member rounds: charge the $1.50 or not?
