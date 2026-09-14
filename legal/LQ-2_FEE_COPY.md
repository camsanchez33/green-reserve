# LQ-2 — Fee-flow decision and the exact copy (2026-09-14)

**Decision (Cam, 2026-09-14): keep the payment structure, rewrite the words.**
One Stripe direct charge on the course's connected account for green fee + cart +
GreenReserve's $1.50 per player; the course is merchant of record; Stripe's
processing fee applies to the whole payment and the course bears it; GreenReserve's
fee is then taken as a Stripe `application_fee`. Cam's reasoning, on record: the
course covers Stripe's few cents on the service-fee portion because GreenReserve
charges courses nothing to run their tee sheet. Option B (second PaymentIntent) and
the "absorb the 17¢" variant were both declined.

**What that means in numbers** (for the docs, the FAQ, and every sales call — do
not put the arithmetic on the marketing pages, put the sentence):
4 players × $60 → golfer pays $246.00 · Stripe 2.9% + 30¢ = $7.43 · GreenReserve
$6.00 · **course receives $232.57**. The same foursome with no GreenReserve, taken on
the course's own Stripe account: $232.74. The difference — 17¢ — is Stripe's
percentage on GreenReserve's $6, and it is the course's cost. Say so if asked.

**Banned phrases from this point on** (every surface, including new copy):
"keep 100%" · "never touches your Stripe account" · "never deducted from what you
receive" · "not part of your payout" · "you are never responsible for it" · "our
only fee" (see L-4 below) · any sentence implying the course nets its listed green
fee to the cent.

**Allowed, true sentences** (use these, or ones that say strictly less):
- "Golfers pay $1.50 per player on each online booking, added to your price."
- "Your green fee and our fee are collected in one card payment to your own Stripe
  account; our $1.50 per player is then passed to GreenReserve."
- "Stripe's standard card-processing fee applies to the payment, the same as any
  card you take today. GreenReserve charges you nothing on top of it."
- "No setup fee, no monthly fee, no commission on your green fees."

**L-4 folds in here (assumption — Cam has not ruled on it):** the $0.50 taken on
each membership-dues payment (`MEMBERSHIP_FEE_CENTS`) stays and is DISCLOSED in the
same pass. If Cam would rather delete that fee, delete the sentence and the
constant together — never one without the other.

---

## The copy, surface by surface

### 1. `src/app/HomeContent.tsx` — pricing section

Sub line under "Free for courses.":
> No setup fee, no monthly fee, no contract. Golfers pay $1.50 per player on each
> online booking, added to your price — they see it before they book. Stripe's
> card-processing fee applies to the payment, the same as any card you take today.

Delete the LQ-2 placeholder `<div className={s.note}>` and the "FROZEN" comment
block at the top of the file (lines ~15–18). Tile bullets stay. The "Your money"
story beat ("A card holds the time. Golfers pay when they check in, and it lands in
your own Stripe account on its normal schedule.") is true and stays.

### 2. `src/app/for-courses/ForCoursesContent.tsx`

Line ~255 (hero sub):
> Free to list. $0 / month. Golfers pay our $1.50 per player — added to their
> total, not taken from your green fee.

Stat label ~550: `'Per player, added to the golfer's total'`.

Box ~562:
> You set your green fee; the golfer pays it plus our $1.50 per player in one card
> payment to your own Stripe account. Stripe's standard processing fee (currently
> 2.9% + 30¢ per payment) comes out of that payment, as with any card you take —
> GreenReserve charges you nothing on top of it. Our $1.50 per player is then passed
> to GreenReserve. That, plus 50¢ on each membership-dues payment collected through
> GreenReserve, is our only revenue: no setup fee, no monthly fee, no commission on
> your green fees.

FAQ ~574 "What does it cost to list my course?":
> Nothing. $0 to set up, $0/month, no long-term contract. Golfers pay $1.50 per
> player at checkout, on top of your price.

FAQ ~575 "Who pays the $1.50?":
> The golfer, as a line on their checkout above your green fee. It's collected in
> the same card payment as your green fee and passed to GreenReserve, so your listed
> price isn't reduced. Stripe's normal processing fee applies to the payment as a
> whole, like any card you take today.

### 3. `src/app/terms/page.tsx` — "Service fee"

> GreenReserve charges a **$1.50 per-player service fee** on every online booking,
> shown to the golfer and added to the course's price at the time of booking or
> check-in depending on the course's payment flow. The fee is collected within the
> same card payment as the green fee, on the course's Stripe account, and passed to
> GreenReserve. Where a course collects membership dues through GreenReserve, a
> **$0.50 fee per dues payment** applies in the same way. GreenReserve charges
> courses no listing, subscription, or commission fees. Stripe's processing fees
> apply to each payment under the course's own Stripe agreement.

Bump `CURRENT_TERMS_VERSION` in `src/lib/terms.ts`.

### 4. `src/app/operator-agreement/page.tsx`

§1, replace the "only fee … never deducted" sentence:
> Listing is free. GreenReserve's fees are a $1.50 per-player service fee on each
> online booking and a $0.50 fee on each membership-dues payment collected through
> GreenReserve; both are added to what the golfer or member pays, not deducted from
> your listed prices.

§2 "Payments and Stripe Connect", replace the whole first paragraph:
> Green fees, cart fees and GreenReserve's service fee are collected in one card
> payment on your Stripe Connect account; **you are the merchant of record.
> GreenReserve never holds, pools, or delays green-fee funds** — they settle to your
> Stripe account on Stripe's normal schedule. Stripe's standard processing fees apply
> to the full payment, including the service-fee portion, and are borne by you as
> they are for any card payment you accept; GreenReserve charges you no fees on top
> of Stripe's. GreenReserve's service fee is then transferred from that payment to
> GreenReserve as a Stripe application fee. When a booking is refunded in full, the
> service fee is refunded to the golfer together with the green fee.

Disputes paragraph: keep as is (it is still true).

### 5. `src/components/Footer.tsx`

No fee copy returns to the footer. Delete the "FROZEN behind the LQ-2 placeholder"
comment; leave the footer without a fee line.

### 6. `UI_REVISE_SPEC.md` §0.6 / §5 item 8

Mark the fee-copy freeze lifted by this file.

---

## Run

One small run, no migration: **`LQ-2 copy run`** in RUN_QUEUE. Verify by grepping
the five surfaces for every banned phrase (expect zero hits), reading each new
sentence against `src/lib/checkin-booking.ts` + `src/lib/stripe.ts` (application
fee on a direct charge; `refund_application_fee: true` on refunds), and bumping the
terms version. Then: Register PM-4 → MET, CC-6 → MET, PM-5 → MET (L-3 was already
fixed in code — the register lagged). ⚖️ COUNSEL stays on the Operator Agreement
until an attorney reads it; this pass makes the words true, it does not make them
reviewed.
