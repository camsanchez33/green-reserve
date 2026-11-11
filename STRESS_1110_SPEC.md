# STRESS-1110 — Cam's decisions from the tee sheet / Home / pro shop stress tests (2026-11-10)

Asked with the question feature on 2026-11-10. Each line is Cam's answer; build in this order.

## Build
1. **Front desk sees what to collect.** Anyone allowed to take payment (`sheet.counter_payment` or `sheet.checkin`)
   sees the group's amount, cash due and change on the tee sheet. Day totals, Paid history and Money stay behind
   `money.payments`.
2. **Pay separately comes back as a one-player shortcut.** One tap splits one player off a group; each part can be
   named (no more "John Smith · guest" for every part).
3. **Cash: a confirm AND a 60-second Undo** (Cam: "both"). One "Take $350 cash?" confirm, and an Undo in the
   checked-in box for a minute that voids the cash sale and reopens the group.
4. **Home shows the actual total taken in** (Cam: "have it show the actual total amount"). Replace "Paid today" with
   every dollar in today from the money ledger: rounds, shop, events, dues.
5. **One-tap card check-in.** "All 4 here · charge card on file $346" on the group card for the common case; the steps
   stay behind "Change something".
6. **Trends, pace and goals on Home need `analytics.view`.** Staff see today's sheet numbers only.
7. **Event and dues cash need the register open**, like every other cash payment (DRAWER-1's open question, closed:
   "the register should close and open at the beginning and end of the work day … keeping track of all the cash").
8. **A cancelled future event is listed under Past**, marked Cancelled.
9. **Required fields go red under themselves on every dashboard form**, page by page as each is touched.
10. **The organizer's contact stays required** when the organizer pays as one bill (as built).

11. **Voiding a cash sale needs "Take payment at the counter"** (security sweep L5; Cam: "if they don't have
    permission then they shouldn't be able to do it"). The register stays the one secure, simple cash loop Cam
    described: open → count the starting cash → every cash sale counted by the site → close → count, see over/short →
    the owner's set amount left in + a note for the rest → locked for the night, every step stored (DRAWER-1/R4).
12. **Permissions tightened** (security sweep; Cam picked all three — a full Settings / permissions simplification
    comes when the launch plan reaches Settings):
    - changing a membership tier's price or dues amount also needs `settings.edit`;
    - marking dues paid needs `sheet.counter_payment` (as every in-person payment), not `members.edit`;
    - switching member / resident pricing off is owner-only.
13. **The security sweep's 7 mediums** (lanes/security/2026-11-10-full-sweep.md M1–M7) — Cam: "after STRESS-1110".
    Build does them, two PRs, before Nov 30. The High (member sign-in link) is already fixed.

14. **Admin: confirm again before cancelling a booking or taking a course offline** (sweep L3) — Cam: yes, but with
    the Admin redo, not now ("let's go through the dashboard first"). The security mediums that are admin-only (M2,
    M3, M4) wait for the Admin redo too; the dashboard and golfer ones (M1, M5, M6, M7) come after STRESS-1110.

15. **"Not paid yet" has ONE definition everywhere** (Money's strip, its paid list, Payments' filter, Home) — Testing
    lane M2; Cam: groups that played or are playing today and still owe. No-shows are their own line, counted as owed
    only when there's a card and a no-show fee to charge.
16. **Where each revenue number lives** (Testing lane S1; Cam: "the tee sheet [shows] the revenue they are generating
    from anything on there, the pro shop already has the revenue from pro shops, and they are all accounted for in
    overall Money and Analytics because it is total revenue, and the register is supposed to show cash sales"):
    - Tee sheet: revenue from what's on the sheet (rounds, carts, items added to rounds);
    - Pro shop: pro shop revenue (its header says so — today it reads "$34 · 1 sale" while the register took $594);
    - Money and Analytics: TOTAL revenue — rounds + pro shop + events + dues ("Collected" and "Today" included);
    - Register / close-out: cash sales only.
17. **The booking confirmation keeps one price ($X online, booking fee included).** Cam: "we want them to pay online,
    so we don't advertise that paying cash at the course skips the fee." No change to the golfer wording.
18. **Owner sign-in stays strict** — a second check every time, no "remember this device" (the passkey is the quick way).

## Not building
- **Yesterday line on Home** — Cam: unpaid rounds are covered by the course's no-show / cancellation fee and the
  midnight auto no-show set in Settings.
- **A 5th player on a 4-seat time** — Cam: they use Add time, and charge separately in the pro shop.
- **Recording who removed a declined card** — Cam: it's rare; fine as is.
- From the tee sheet extras, only one-tap card check-in was picked: no Block/Counter-only button, no not-today
  warning, phones don't default to List.

## Decisions 2026-11-11 (asked with the question feature)
- **Homepage fee line: taken off** (Cam: "do we need to put it on there … if not take it off" — it isn't required; then "Take it off"). The homepage carries no fee sentence; "Free for your course." in the hero stays. The fee is covered on the demo call and in the agreement.
- **Pro shop on the homepage: its own section.**
- **The demo / screenshot course is named "GreenReserve Test Course"** (replaces "Hollow Brook Golf Club", which may be a real club).
- **The pay screenshot is an online booking** showing the $1.50 line.
- **Golfer fee name: "service fee"** on every golfer page, email and receipt (Build: the wording lives in `describePolicy()` / shared copy).
- **Golfer changes close at the same cutoff as free cancelling** at no-fee courses too (Build: shared rule).
- **The check-in link comes back after booking only to a signed-in golfer** (Build: POST /api/bookings).
