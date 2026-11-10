# Demo script — 15 minutes on the product

In the order a course lives a day: a golfer books → the counter sees it → the group checks in and
pays → the shop sells → the owner checks the money. Run it on **The GreenReserve Test Course**
(`Course.isTest`), never a real course.

**Where it runs matters.** "Simulate a tap" on the card reader exists only on a deployment whose
Stripe key is a test key — it is one key for the whole site, not per course. On greenreserve.app with
live keys there is no simulated tap, and checking in a group with a saved card is a **real charge**.
So either run the demo on a test-key deployment, or on production: use a real test card you refund, or
show check-in with Take cash and the pay link only, and skip the reader tap (see Questions for Cam).

## Before the call (not in the 15 minutes)

- Test course has tee times today and the next few days, a cancellation policy with a no-show fee,
  a member tier, a resident or two, a few pro-shop items with photos, and a handful of bookings in
  every money state: paid, booked not paid, a declined card, one checked in, one member.
- Register is **closed** at the start, so you can open it in step 4 (it refuses cash until it's open —
  that's a feature, show it).
- Two windows: the golfer page on a phone-sized window, the dashboard on the laptop.
- From the call or the course's site, know three things: how they book today, whether they have a
  pro shop, whether they have members or residents. Spend the minutes where their answer points.

## 0:00 – 1:00 · Their day, not our product

"Before I show anything — walk me through a Saturday morning at your counter." Listen. Name back the
one thing that sounded painful. Every step below is shown as the fix to something they said.

## 1:00 – 4:00 · 1. The booking page (golfer phone)

Open `greenreserve.app/courses/{slug}`.

- It's the course's own name, logo, colors and photo — "this is what your golfers see, not us."
- Pick a day, party size, a time. The full price, including the $1.50 per player, shows before they
  book.
- The cancellation policy in plain words before they book. "These words come from your settings —
  you never write the policy twice."
- A card is asked for only when your policy can charge it (a late-cancel or no-show fee). No fees, no
  card.
- Confirmation screen and email, with the course's own note.
- Mention: a "Book a tee time" button for their own website; golfers can ask to be told when a full time
  opens up.
- If they have residents: a signed-in resident books themselves at the resident rate.

## 4:00 – 7:30 · 2. The tee sheet (laptop)

Open `/dashboard`.

- The booking just made is already on the sheet. Online, phone and walk-ins on one sheet — "online
  golfers only see what's really open."
- One row per tee time, a cell per seat. The cell's colour is the money: green paid, amber booked not
  paid, red a declined card or no-show. In, M and R tags are checked in, member, resident.
- Grid · List · Calendar switch — Calendar shows the month by how full each day is.
- Tap a time → its card: who's in it, what they owe, the buttons. Add a phone booking or a walk-in
  here.
- Drag a group to another time → it asks before anything moves.
- Block a run of times for a league or maintenance.
- Course alert banner (frost delay, cart path only) shows on the booking page.

## 7:30 – 10:00 · 3. Check-in and pay

On a group's card:

- **Check in** with a saved card → charged now, to the course's own Stripe account.
- **Text pay link** → the golfer pays on their own phone with Apple Pay, Google Pay or a card. Show the
  phone receiving the page. (Texts go only to golfers who ticked the text box when booking.)
- **Pay separately** → "John and three friends each want to pay" — split the group, each pays their own.
- Only two of four showed up → check in two; the other two stay open on the same time.
- **No-show** → the fee your policy sets; "still coming" undoes it.
- **Take cash** — try it: refused, the register is closed. "Cash only goes through an open register,
  so every dollar of cash lands in the close-out." Segue to step 4.

## 10:00 – 12:30 · 4. The register (Pro shop)

Open `/dashboard/shop`.

- **Open the register** — count the drawer.
- Ring up a sleeve of balls and a hat from the photo tiles: cash, or a pay link to the customer, or the
  card reader (simulated tap on a test-key deployment only).
- Back on the tee sheet: Take cash on that group now works, and lands in the register.
- **Close out** — count, leave a float, take out the deposit, a note for the next person. Expected cash
  is worked out from the day.
- Skip this step for a course with no pro shop; spend it on step 3 or members.

## 12:30 – 14:00 · 5. Money

Open `/dashboard/money` (owner login).

- The last 7 days: paid, not paid yet, the next payout.
- Needs you: declined cards, with a pay-link button right there. (Cam's Nov 9 notes take "Text pay
  link" off this list — check before Nov 30 and drop this line if it's gone.)
- Ledger: every dollar in and out — card, cash, refunds — and **Earned vs Paid out** for the dates
  picked. Download CSV for the bookkeeper.
- One line to close: "Payouts come from Stripe to your bank on Stripe's normal schedule. We never hold
  your green fees."
- If time, 20 seconds of Analytics: the monthly written review, built only from their own numbers. And
  the assistant: "ask it how today looks."

## 14:00 – 15:00 · The ask

"What would stop you from opening on this in the spring?" — then answer that one thing
(`objections.md`). Then: "The next step is a short setup call where we put in your times, prices and
policy. Want to pick a time now?"

Don't end on "any questions?". End on a date.

## Don't show / don't say

- Features not built or switched off: the 50¢ shop fee and the booking fee charged at booking (both
  built, both OFF), "Riding − N +" carts at checkout and the cart ticket (in progress).
- Admin, other courses, anything from the launch-wipe tools.
- Contract terms or how long anything takes. If asked, "it's in the Operator Agreement at
  greenreserve.app/operator-agreement — I'll send it."
- GreenReserve's own revenue per course.
