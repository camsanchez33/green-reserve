# Money walk — the register, cash and the card reader (Oct 2026)

One walk, about an hour, on the live site. It covers what shipped Oct 22–25:
pay links, **Take cash**, walk-ins paying cash, the register, refunds, the card
reader and the close-out. Every step says what you should see. Anything else is
a bug — write down the step number and what you saw, and I'll fix it.

Everything you make here is wiped by the launch wipe (closes Dec 1), so don't
clean up.

## Before you start (5 min)

1. Use a course you own on the live site, with Stripe connected. A course
   marked as a test is best (it stays out of the platform's numbers).
2. **Settings → Pricing & cancellation → Card at booking: No card at booking.**
   Pay link: 3 hours before the round.
3. **Today's tee sheet:** pick two open times later today and set them to
   **$10 a player, no cart** (any price works; the numbers below assume $10).
4. **Settings → Pro shop:** add an item **Hat, $25**.
5. **Find out which Stripe keys the site runs on.** Settings → Pro shop → card
   readers. If you see **"No reader yet? Add a simulated reader"**, the site
   is on test keys: use Stripe's test card 4242 4242 4242 4242 below and do
   step 7. If you don't see it, it's on live keys: cards are real (refund
   yourself in Stripe afterwards) and you skip step 7 until a reader arrives.
6. Texts need Twilio, which isn't registered yet — use the **email** pay link
   everywhere below.

Keep a scrap of paper: you'll check the close-out against it at the end.

## The walk

**1. Online booking, paid by pay link.** On your phone, open the course's
booking page as a golfer and book **2 players** at the first time, with your
own email.
- The confirmation screen and email come through; no card asked for.
- Tee sheet: the group shows **No Card Required**, $23.00 ($20 + $3.00 booking fee).
- Open the time → **Email pay link** → the email arrives.
- Open it on your phone → the button reads **Check in · pay $23.00** → pay.
- You see **You're checked in!** and get a receipt email (from billing@).
- Refresh the tee sheet: **Checked In & Paid**.

**2. Online booking, one of two shows, pays cash at the desk.** Book another
**2 players** online (any name). On the tee sheet open the time:
- The group has **Check in**, **Take cash** and **Email pay link**. There is no "paid at counter".
- Tap **Take cash**. It asks how many showed: enter **1**.
- The prompt reads **"Take $10.00 cash from … for 1 of 2 players? … the sale goes on today's register."** (no booking fee in cash — that's on purpose).
- After you OK it: the toast reads **"Cash taken — … is checked in."** and the group reads **Checked In · Paid at the register**.
- Pro shop page → today's sales: a **Paid in cash** sale for $10.00 with the round on it.

**3. Walk-in paying cash.** Open the second time → **Add a walk-in or phone
booking** → Walk-in, a name, **3 players**, tick **"Paying cash now — take it and
check this group in"**.
- The button reads **Add + take $30.00 cash**. Tap it.
- The group appears checked in, **Checked In · Paid at the register**; a $30.00 cash sale is on the Pro shop page.
- Repeat with the box **unticked**, 1 player: the group reads **Pays in store** and offers **Take cash · check in** (don't take it — leave it unpaid for step 6).

**4. A shop sale in cash, with change.** Pro shop page → add **Hat** → pay
**Cash** → under **Cash handed over** type **40**.
- It shows **Change: $15.00**. The button reads **Take $25.00 cash**. Tap it.
- The sale shows **Paid in cash**. Send yourself the receipt by email → it arrives.

**5. A cash refund.** On that hat sale → **Refund** → amount **10**, a reason → confirm.
- It warns **"Recorded only — hand the cash back yourself."**
- After: **"Refund recorded — hand the cash back."**

**6. The register picks up an unpaid group.** Pro shop page → **Groups still to
pay** lists the 1-player walk-in from step 3. Don't take it. Check that the
close-out in step 8 doesn't count it.

**7. Card reader (test keys only — skip on live keys).** Settings → Pro shop →
**Add a simulated reader**; it shows **Online**.
- Book **1 player** online at a time today. On the tee sheet the group now also shows **Card reader**. Tap it.
- The Pro shop page opens with that group picked and **Card reader** chosen. The button reads **Charge $11.50 on the reader** ($10 + $1.50 — a card pays the booking fee, like a pay link).
- Tap it → **"… waiting for the card"** → **Simulate a decline** → it says not paid, and offers **Try the reader again**.
- Try again → **Simulate a tap** → the group is **Checked In & Paid** on the tee sheet.
- Try a hat on the reader too: **Charge $25.00 on the reader** → **Simulate a tap** → **Paid by card**.

**8. Close out the day.** Pro shop page → foot → **Close out the day** → **Count the drawer**.
- **Cash sales at the register · 3 sales — $65.00**, with **Shop items $25.00 · green fees $40.00** under it (steps 2, 3, 4).
- **Cash refunds · 1 — −$10.00**. **Cash taken — $55.00**.
- No line called "Marked paid at the counter".
- **Card, for reference:** rounds paid by card show $23.00 from step 1 (plus $11.50 if you did step 7); shop sales by card $25.00 if you did step 7.
- Starting cash **100**, cash counted **150** → **Should be in the drawer $155.00**, **Short $5.00**.
- **Close out today** → **"Saved — short $5.00 against $155.00 expected."**
- Count again with **155** → the button reads **Save this recount**; Recent close-outs shows today **Even** on top and the first count as **(recounted)**.

## What to send me

The step numbers that didn't match, each with what you saw (a screenshot is
best). "All matched" is a fine answer too. Either way I'll mark the walk done
on the queue.
