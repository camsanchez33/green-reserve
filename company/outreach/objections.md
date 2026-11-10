# Ten objections, and honest answers

Rule for every answer: say what the product does **today**. If it doesn't do it, say so and say what we
do instead. A GM forgives "not yet"; they never forgive finding out later. Fee sentences are LQ-2's.
No contract terms or durations — for those, send the Operator Agreement
(greenreserve.app/operator-agreement).

---

### 1. "We already have GolfNow."

*What's usually behind it:* GolfNow brings golfers, and often the course pays for it in tee times it
gives away (barter) rather than cash.

**Answer:** "GreenReserve isn't a marketplace — it's your own booking page and tee sheet. Golfers book
with you, under your name, and the golfer is yours. Is GolfNow your tee sheet too, or does it sell
some of your times? If it sells times, ask what those times are worth on a Saturday — that's what it
costs you." If they want to keep selling through a marketplace, don't fight it; ask whether their own
website's "Book" button goes to a page they own.

*Don't say* GreenReserve brings them new golfers. It's their booking page, not a marketplace with
traffic of its own.

### 2. "We already use foreUP / Lightspeed / Club Caddie."

**Answer:** "Then you have a full system and you're paying for it. What do you pay for it a year, and
what do you use? GreenReserve covers the booking page, the tee sheet, payments at check-in, members,
residents, the register with a card reader and the close-out, staff logins and analytics.
No setup fee, no monthly fee, no commission on your green fees." Then ask what they'd miss.

*Be honest:* a course deep into a full POS — inventory across locations, a restaurant, tournaments run
in the software, handicaps — may not be a fit today. Note it and move on; these are priority 4 in the
plan for a reason.

### 3. "Is it really free? What's the catch?"

**Answer:** "No setup fee, no monthly fee, no commission on your green fees. Golfers pay $1.50 per
player on each online booking, added to your price. Stripe's standard card-processing fee applies to
the payment, the same as any card you take today. GreenReserve charges you nothing on top of it."

If they push on the arithmetic (it's in `legal/LQ-2_FEE_COPY.md`): on a foursome at $60, Stripe's
percentage on our $6 is about 17¢ — and that is the course's cost. Say so if asked; never say the
course nets its green fee to the cent.

### 4. "What about our data? Who owns our golfers?"

**Answer:** "The Operator Agreement says it in one sentence: your booking history, the golfer contact
data collected through your bookings, and your revenue data belong to you, not GreenReserve. And we
never sell golfer or course data, or use your golfers or your data to promote another course. Day to
day, Money downloads every payment as a CSV for your bookkeeper, and Analytics downloads your golfer
lists."

(The first two sentences follow the Operator Agreement's §8 wording; the last is the product. If
they ask what happens if they leave, send the agreement — don't recite its terms.)

### 5. "Who supports us? You're one person."

**Answer, straight:** "Right now, me — and you'll talk to the person who builds it. I set every course
up myself. From the dashboard you send a message and I answer it, or email
admin@greenreserve.app, or call me at 845-499-3515. There's also an assistant in the dashboard that
answers questions about your day right away."

Don't promise phone support hours or a response time out loud — the Messages tab shows its own reply time.
Being small is honest and, for a town muni, often a plus. Being small *and* overpromising is the risk.

### 6. "Our golfers are older — they won't book online."

**Answer:** "Then they keep calling. Phone and walk-ins go on the same sheet, so nothing double-books.
Online is for the ones who want it — and paying can happen on their own phone from a text, or at the
counter in cash. Nobody is forced online."

### 7. "We don't want to take cards / we're a cash course."

**Answer:** "Cash works: staff open the register, take cash from the tee sheet, and it lands in the
close-out with an exact count. A card is asked for at booking only if you set a late-cancel or no-show
fee. If you set no fees, no card." (True per SP-B and CASH-1.)

*Honest limit:* every course connects its own **Stripe** account before it goes live — no exceptions
(the go-live step refuses without it). A course that can't open one isn't a fit today.

### 8. "We're a town/county course — the money has to go through our treasurer."

**Answer:** "Payments land in the course's own Stripe account and are paid out to whatever bank account
you connect, on Stripe's normal schedule; we never hold green-fee money. The ledger shows every dollar,
and exports for the treasurer. Who would need to approve a Stripe account on your side?"

*Then listen* — this is the biggest open question for municipal courses (see plan.md, Questions for Cam
#3). Don't promise a specific report format until we've seen what the treasurer needs.

### 9. "Switching is a pain — we have bookings and members in the old system."

**Answer:** "That's why I'd do it now, in the winter, when there are few bookings on the books. We set it
up with you around how you already run: your times, prices and policy. Members come in from a
spreadsheet — Members → Import a list takes a CSV. Your pro shop items too. Future tee times already
booked in the old system we enter with you during setup."

*Be honest:* there is no automatic import of another system's tee-time bookings.

### 10. "What happens if it goes down on a Saturday morning?"

**Answer:** "The tee sheet is a website — any computer, tablet or phone at the counter opens it. Golfers'
confirmations are in their email. If something breaks, call me: 845-499-3515." Admit the agreement
doesn't guarantee uptime, if asked directly — it says so, and pretending otherwise is worse.

---

## Heard but not in the top ten

- **"Can we see a course using it?"** — "Not yet; you'd be one of the first, and you'd get me setting it
  up." Never invent a reference.
- **"Can we do tournaments and outings?"** — Events exist (sign-up, payments, checklist). Show it only if
  asked; it's not in the 15 minutes.
- **"Will you raise the price later?"** — Don't answer with a promise. "Golfers pay $1.50 per player on each
  online booking, added to your price. Anything that changes would be in the Operator Agreement."
  Flag to Cam if it comes up more than twice.
