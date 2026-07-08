# Receipt Spec — on-brand itemized receipts for booking + payment

Goal: every money moment (booking made, payment at check-in) produces a clean,
itemized, on-brand GreenReserve receipt — page and email. The $1.50/player service
fee is our entire revenue model: it must be itemized by name everywhere, never
hidden behind "Fees".

No schema changes in this spec. Unattended OK. Two phases, commit + push after each.

---

## Phase R1 — Fee transparency (small)

The service fee currently appears as a vague "Fees" line. Rename it everywhere to:

    GreenReserve service fee ($1.50 × {players})

Locations (audit for others — any UI or email that itemizes booking charges):
- `src/app/book/page.tsx` — order summary "Fees" row (~line 263) and the
  confirmation state's estimated-total block (add full line items there: green fee,
  cart, range balls, service fee, total — it currently shows only the total)
- `src/lib/email.ts` → `sendBookingConfirmation` — "Fees" row (~line 65)
- `src/lib/email.ts` → `sendCheckInReceiptEmail` — "Fees" row (~line 293)
- `src/app/checkin/[bookingId]` page — if it itemizes charges
- `src/app/manage/[bookingId]` page (built in M1/M2) — if it itemizes charges

Add one shared constant/helper (e.g. `serviceFeeLabel(players)` in a lib file next
to where ACCESS_FEE_PER_PLAYER lives) so the label is defined ONCE. If
ACCESS_FEE_PER_PLAYER is duplicated across files, consolidate to a single export
while you're there.

Also add one short line under the total on the booking page order summary:
"The service fee supports online booking. Green fees go 100% to the course."

## Phase R2 — Real receipt page + receipt email upgrade (medium)

### R2a. Receipt page: `/receipt/[bookingId]?token=...`
- Token-gated exactly like check-in: reuse `checkInToken` (same pattern as
  `/checkin/[bookingId]` and `/manage/[bookingId]`). No login required.
- Server component (or client fetch) that renders a printable receipt:
  - Header: GreenReserve wordmark text (no logo image), "Receipt", booking ID,
    date paid
  - Course block: course name, city/state if available
  - Details: date, tee time, players, holes, walking/cart
  - Line items table: Green fee (× players), Cart fee (if any), Range balls
    (if any), GreenReserve service fee ($1.50 × players), late-cancel fee refund
    line (negative, only if one was refunded at check-in) — then Total charged
  - Payment line: "Paid at check-in" + card brand/last4 if available (see R2c)
  - Footer: hello@greenreserve.app, greenreserve.app
- States: if booking is checked in → full receipt. If confirmed but not checked
  in → "Booking confirmation" variant showing the same line items as ESTIMATED
  ("Due at course") with $0.00 paid so far. If cancelled → cancelled notice
  (+ late-cancel fee line if charged).
- Print styles: `@media print` — hide nav/buttons, black on white, fits one page.
  A visible "Print / Save as PDF" button that calls `window.print()`.
- Clubhouse design system throughout (paper bg, ink text, pine accents, serif
  page title, rounded-md max). NO orange, NO e-commerce copy ("order",
  "purchase" are banned words — this is a tee time, not a cart).

### R2b. Wire it in
- `sendCheckInReceiptEmail`: add a "View receipt →" button linking to the
  receipt page (NEXT_PUBLIC_URL + path + token).
- `sendBookingConfirmation`: add a quiet "View booking receipt" text link.
- Golfer self check-in success screen and `/account` booking history rows
  (completed bookings): link to the receipt page.
- Dashboard (operator) check-in success: no change needed.

### R2c. Receipt email upgrade (`sendCheckInReceiptEmail`)
- Bring it in line with the email conventions in CLAUDE.md (sharp corners,
  border-radius:4px, black header bar) and kill the font-weight:900 headline.
- Subject stays "Receipt: {course} — ${total}".
- Add: booking ID as "Receipt #", the service-fee label from R1, card brand +
  last4 IF the Stripe charge response already carries it through
  `performCheckIn()` (`payment_method_details.card`). Pass it along from the
  charge result — do NOT add a DB field or an extra Stripe API call. If it's not
  cleanly available, omit the card line entirely.

### Ground rules
- No schema changes, no new packages, no folder restructuring.
- Shared logic lives in src/lib, not duplicated in routes.
- Validate every changed .tsx parses with @babel/parser (CLAUDE.md gotcha #3/#4).
- Update RUN_QUEUE.md (check the box, commit hash) after each phase.
- Money display: always cents→dollars with .toFixed(2); totals must equal the sum
  of the displayed line items — write a quick sanity test if math is touched.
