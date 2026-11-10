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

## Not building
- **Yesterday line on Home** — Cam: unpaid rounds are covered by the course's no-show / cancellation fee and the
  midnight auto no-show set in Settings.
- **A 5th player on a 4-seat time** — Cam: they use Add time, and charge separately in the pro shop.
- **Recording who removed a declined card** — Cam: it's rare; fine as is.
- From the tee sheet extras, only one-tap card check-in was picked: no Block/Counter-only button, no not-today
  warning, phones don't default to List.
