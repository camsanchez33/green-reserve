# PB — Private-club billing

Status: **DECIDED (Cam 2026-09-29)** — model below. **BLOCKED** only on Cam's prices
(the preview blocker was dropped 2026-09-29; the schema change is verified locally
per CLAUDE.md). Money path — attended build.

## Decision
- **Public courses — unchanged.** The golfer pays GreenReserve $1.50/player on each
  online booking, inside the check-in charge; the course pays nothing.
- **Private clubs — the CLUB pays GreenReserve; members pay $0.** A club picks one:
  1. **Subscription** — a flat monthly price (tiered by club size), everything
     included: member bookings, staff-entered bookings, guests, the member portal.
  2. **Pay as you go** — $1.50 per round (member booking or staff-entered), billed to
     the club monthly, **capped at the subscription price** for its tier. A busy month
     never costs more than the flat plan, so staff never avoid entering rounds.
- Guests of members may still pay a guest fee the CLUB sets (club's money, not ours).

## Why not per-booking with no cap (Cam's first idea)
Charging the club per staff-entered round penalises entering rounds — the sheet goes
incomplete, which is what makes the product worthless to the club. Private clubs also
buy tee-sheet software as a fixed annual/monthly line (ForeTees, Club Prophet, Jonas
sell that way). The cap keeps pay-as-you-go without the disincentive.

## Build (when unblocked)
1. **Schema** (additive): `Course.billingPlan` ('none' | 'subscription' | 'payg'),
   `Course.billingTier`, `Course.stripeBillingCustomerId`,
   `Course.stripeSubscriptionId`, `Course.billingStartedAt`. Migration, verified
   locally, schema-check workflow.
2. **Stripe Billing on the PLATFORM account** (GreenReserve is the seller): one
   Product "GreenReserve for private clubs", a monthly Price per tier; pay-as-you-go
   as a metered Price with usage reported at month end and the invoice capped by
   crediting any amount above the tier price (or a monthly job that computes
   min(rounds × $1.50, tier price) and adds one invoice item — simpler, recommended).
3. **Onboarding**: private clubs choose a plan at the "connect Stripe" step (card or
   ACH via Stripe Checkout in `setup` / `subscription` mode); the operator dashboard
   gets a Billing panel (plan, next invoice, invoices, change plan).
4. **Bookings**: at a private club with a plan, `accessFeeTotal = 0` on member
   bookings (book page + API + the FB-3 separate-fee path, which then has nothing to
   charge). Pay-as-you-go counts rounds from `Booking` (member + staff-entered,
   checked in or paid offline, not cancelled/no-show).
5. **Admin**: Revenue gets a "Club subscriptions" line (MRR + PAYG invoices); the
   course page shows the plan and payment status; a failed invoice shows on the
   Money-problems list.
6. **Legal / copy (LQ-2 frozen — Cam approves wording)**: operator agreement gains a
   private-club billing section (new version, re-accept); /for-courses and the
   homepage pricing section get a "Private clubs" line; Terms §2 drops the member fee
   at private clubs.

## Open questions for Cam
1. **Prices**: the monthly subscription per tier. Suggested tiers by member count:
   under 300 / 300–600 / 600+ — suggested starting points to react to, not
   researched market prices: $149 / $249 / $349 a month; annual prepay = 2 months
   free?
2. **Which clubs are "private"**: any course with `type = private`, or should a
   public course with a member program (passes/memberships) also be allowed a plan?
3. **Trial**: first 30/60 days free for private clubs?
4. **Existing private clubs** (none live yet) — nothing to migrate.
