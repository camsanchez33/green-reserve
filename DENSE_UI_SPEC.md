# DENSE — lots of data, almost no sentences

Cam 2026-10-27, after the ChatGPT dashboard chat and the mockup canvas
(https://claude.ai/artifact/AxeBeYmHHbzcSCPr5P3xhv): "there is almost too much words
on the pages" … "think OpenTable, Stripe, Lightspeed Golf, Toast — they have so much
stuff on their dashboard but it still looks very clean and efficient" … on the round-3
boards: "that looks so much better … these principles need to be applied across all
tabs on both dashboard and admin."

This spec supersedes, for `/dashboard/*` and `/admin/*` only, the parts of AN-1, AN-2
and SHEET-2 named in §3. Everything else in CLAUDE.md's design system stands
(palette, Inter in the rail shells, StatusDot, no pills, no box-in-box, no decorative
icons, the course's `brandColor`).

## 1. The principles

P1. **Data is dense; prose is scarce.** A screen may carry many numbers, charts and
rows. It carries at most ONE sentence of its own (a headline that states the
finding, e.g. "You took in $975. Mondays and 7 AM filled best."). No subtitles that
describe the page, no definitions under numbers, no paragraphs under fields.

P2. **A number is: label (≤3 words) · value · comparison.** The comparison is a
delta against a stated period ("+12% vs last Sat") or a count that gives it scale
("14 groups"). Its definition lives behind the label (dotted underline → tooltip /
tap), from one terms file per area (`src/lib/analytics-terms.ts` for Analytics, kept
in step with the definitions block at the top of `src/lib/analytics.ts`) — never a
sentence under the number.

P3. **Every number opens its rows.** A number is a link to the filtered list behind
it (Stripe). "Not paid yet $1,120" opens Money → Payments at `?show=unpaid`. A number
with no rows behind it is a smell.

P4. **One chart style.** Plain HTML/CSS/inline SVG, no chart library (AN-1 stands).
One series colour (`pine` #173B2A); the comparison is a dashed `#9AA89E` line or a
`#C8D3CB` bar; a stacked mix uses the pine ramp `#173B2A → #4E7A62 → #8FA898 →
#C8D3CB`. Money-owed is `warn`, loss is `bad` — only when the series means that.
Every chart has `role="img"` + an `aria-label` that states the numbers, a legend in
words, and a "now" marker when it runs through today.

P5. **Warnings are one line + the button that fixes it.** "2 cards declined · $260
[Text pay link]". Never a paragraph explaining the problem. 3px left edge in the
semantic colour (unchanged).

P6. **Tables over cards for lists.** Rows divided by hairlines, tabular numerals,
right-aligned money, sortable headers where the list is long. A trend per row is an
inline sparkline (courses table, members table).

P7. **Settings: label + control + live preview.** Helper text only where a wrong
value costs money or locks someone out, and then one short line. The preview explains
the rest.

P8. **Young data has its own state.** Every chart, sparkline and comparison has a
designed state for "not enough history yet" (< 2 full periods): the block shows what
it WILL show and when ("Fills in after 2 weeks of bookings"), never an empty axis or a
fake trend. Every course is young at launch — this is not an edge case.

P9. **Words budget, enforced.** Each page file has a prose-word count, checked in
CI by a ratchet (§5): it may go down, never up.

P10. **Permissions still hide money.** Density never widens access: money figures
show only with `money.payments` (payouts with `money.payouts`); admin areas still
gate through `areaGate`. A number a login can't see is absent, not blurred.

## 2. Patterns (from the canvas)

| Pattern | Source | Used on |
|---|---|---|
| KPI strip: 4–5 cells, label · value · sparkline · delta, one card, hairline dividers | Stripe | Home, Analytics, Admin Home, Money |
| "Today" cumulative line vs same weekday last week, Now marker, balance/payout beside it | Stripe Home | Money, Admin Money |
| Sales by day / day of week / time of day, then a plain summary table | Toast Sales Summary | Money, Analytics → Money |
| Payment types mix (card online, reader, cash, pay link) | Square | Money |
| Needs you: one line + one button each | Shopify Home | Home, Admin Home |
| Pace: next 14 days booked vs usual-by-now | OpenTable covers pacing | Home, Analytics |
| Golfer card: rounds · spend · no-shows · last here | OpenTable guest profile | Tee sheet panel, Members, search |
| Seat rows: one row per time, price, 4 seat cells, group spans its seats | Lightspeed / foreUP | Tee sheet |
| Heatmap weekday × hour fill | — | Analytics → Busy times |
| Courses table, worst first, 8-week sparkline per row | Stripe customers | Admin Home, Admin Courses |

## 3. Decisions (Cam 2026-10-27)

- **D1. Seat rows everywhere** — reverses SHEET-2's board. The tee sheet is one row
  per tee time on every screen: time · price · four seat cells; a group spans the
  seats it holds; 3px left edge = money state (ok paid · warn owes · bad declined or
  no-show); light green fill = checked in; beige = member or resident; a line at
  "now". Desktop shows the selected day and the next day side by side; phone shows one
  day. The TT-CARD panel (card beside the sheet on a laptop, sheet from the bottom on
  a phone), drag-to-move with the ACT-1 confirm, and every action in `groupRow()` are
  unchanged — only the layout of the sheet changes. The homepage demo
  (`TeeSheetDemo.tsx`) must mirror it in the same PR (CLAUDE.md: change one, check the
  other).
- **D2. AN-1 is decided page by page.** Cam: "very number specific — depends what it
  would be, so when going through ask more specifically." Every page's PR names the
  exact numbers it would add to an operational tab and waits for Cam's yes/no on
  each before building them. Until then AN-1 holds.
- **D3. Spec first, one PR per page,** in the order of §4.

## 4. Pages, in build order

Each item is one PR. "Words" is the budget for P9 (set from the PR's own
before/after count; the number here is the target). Open questions go to Cam in the
PR, per D2.

Prose counts are from the 2026-10-27 inventory (sentences rendered by the page,
modals included). "New code" flags anything that is not a re-presentation of data a
route already returns — it needs its own design note in the PR, and money/auth parts
stay with the overseer.

### Course dashboard

- [x] **DENSE-1 Analytics** (MERGED #237) (`dashboard/analytics/page.tsx`, ~60+ sentences →
  ≤ 8). Lands `words-guard.mjs`. Top: period switcher (Today · 7D · 4W · 3M · 12M) +
  "vs previous"; one large chart whose metric is picked by clicking the four headline
  numbers (Revenue, Tee sheet filled, Rounds played, Per round); eight small cards with
  sparklines (no-show rate, late cancels, returning golfers, new golfers, rounds with a
  cart, booked ahead, open spots — a COUNT: the page never shows a dollar total for
unsold spots, an estimate AN-3 removed and `analytics-3-test.ts` pins). Then the existing tabs with
  every Section `why=` and tile `explain=` moved behind the label (P2). "What to look
  at" becomes one-line rows with their button (P5). Monthly review: one line until the
  first review exists. Unused fields to surface: `revenue.perAvailableTeeTimeCents`,
  `utilization.byDay`, `utilization.blockedTimes`. Sparklines need per-period series
  → small addition in `computeAnalytics` (new code, server-side, no money logic).
- [x] **DENSE-2 Money** (BUILT 2026-10-27: Sales view on top — today vs same weekday last week, sales by day / weekday / hour, summary, how golfers paid, cash drawer; title stays "Payments and payouts" per money-rework-test) (`dashboard/money/*`, ~15 → ≤ 3). Sales tab first:
  Stripe "Today" cumulative line vs same weekday last week + next payout + not paid
  yet; Toast's sales by day / day of week / time of day; Sales summary table (green
  fees, carts, range, shop on rounds, register sales, late/no-show fees, refunds, net;
  tax and golfers' booking fee listed as not in sales); Cash drawer (last
  `RegisterClose`: expected, counted, over/short); How golfers paid (card online,
  reader, cash, pay link); Declined cards. Payments rows show the split already in
  `MoneyBooking` (green/cart/range) on expand. The 4-sentence fee card → one line +
  link. New code: the intraday cumulative series and payment-method split (read-only
  aggregation; overseer — it is money).
- [x] **DENSE-3 Home** (BUILT 2026-10-28 — Cam picked: the 14-day pace row, Coming up kept with checked-in, money panel = Next payout only, 7-week trend lines under players / fill / paid; Not paid yet = every unpaid group today, as on the tee sheet strip) (`dashboard/home`, ~4 → ≤ 2). KPI strip with sparklines vs
  same weekday; "Today by tee time" fill grid with the now marker; Next 14 days pace
  (booked vs usual-by-now — already `pace` in analytics); Needs you (existing three +
  pace alerts); Next up with checked-in state (`comingUp[].groups[].checkedIn` is
  returned and unused) and a short golfer history; Paid today mix + next payout. AN-1
  exception already covers Home. Golfer history tags = new code (see DENSE-4).
- [x] **DENSE-4 Tee sheet: seat rows** (BUILT 2026-10-27, one day per screen; the next day side by side on desktop and the day strip / golfer card follow as DENSE-4b, each asked of Cam per D2) (`dashboard/page.tsx`, `TeeSheetBoard.tsx`
  → `TeeSheetRows.tsx`, `TeeSheetDemo.tsx`; ~15–20 → ≤ 6, modals keep only what a
  wrong click costs). D1 layout; day strip across the top only if Cam says yes to each
  number (D2: players · checked in · paid · owed · fill by hour — ask); golfer card in
  the TT-CARD panel: rounds · spend · no-shows · last here at this course (new code:
  a per-course golfer summary keyed like analytics' "customer"; tenant-scoped; money
  shown only with `money.payments`). Drag, panel actions, Next up, pay links
  unchanged. Homepage demo mirrors it in the same PR. Phone: one day, same rows.
- [x] **DENSE-4c Past tee times out of the way** (BUILT 2026-10-27, Cam: "after like 20 minutes the tee time should be sent down where they can still access it but it isnt in the way"): today's times 20 min after they went off (`LATE_ADD_MINUTES`, `lib/late-add.ts`) sit in a collapsed "Past tee times · N" section under the live rows; the next time is first. `claimTeeTime()` refuses new bookings on them (`PAST`), so every path agrees; staff can still record a forgotten walk-in there with "Add a walk-in who already played" (today only, walk-ins only — `late` → `allowLate`). Search shows every time in order; a late chip opens the section.
- [x] **DENSE-5 Members** (BUILT 2026-10-28 — Cam picked: strip = Active · Not renewed (expired, not paid again) · Not linked · Member rounds this year; table = member + email · phone, membership, dues, renews, member since, rounds this year, spend this year (money.payments only), last round, sortable; no per-row trend line) (~15–20 → ≤ 4). Table with sortable columns (tier, dues
  status, rounds this season, last round, spend), sparkline of rounds per member;
  header strip: active · dues unpaid ($) · renewing in 30 days (ask D2). Wizard hints
  cut to labels; the 1% dues line stays (fee wording, LQ-2).
- [x] **DENSE-6 Schedule** (BUILT 2026-11-01: page words 458 → 330; the page's own sentences gone — subtitle, the hours, rounds, prices and closed-days explanations, the save-preview "note, not a block" line; kept: errors, confirmations, the save preview's one line per change, the money-setting helper lines in deals/demand pricing (P7)) (~12–15 → ≤ 3). Labels over sentences; the price table
  already is the right shape. Save preview keeps its warnings as one line each.
- [x] **DENSE-7 Pro shop** (BUILT 2026-11-01, text only — Cam: no sales strip or top items for now, today's total already shows and the close-out + sales report carry the rest; page words 733 → 660: subtitle → "$X today", reader/phone helper lines gone, round pay lines one short line each) (~12 → ≤ 3). Register stays task-first; add today's
  sales strip (sales · items · cash · card) and top items (Square) — ask D2.
  Close-out table unchanged, sentences → labels.
- [x] **DENSE-8 Events** (BUILT 2026-11-01 — Cam picked both numbers: Money owed and Open tasks. The list is a table: Event · Date · Players · Owed · To do; Owed is eventMoney()'s owedCents, the event page's own sum, blank for a cancelled or unpriced event, "Paid" at $0; To do keeps its dot (overdue / to do / ready). The event page's Money block was already label/value rows; the empty state and the sign-up line shortened) (~20–25 → ≤ 6). List as a table (date, kind, entrants of
  players, money owed, tasks); detail's Money block as label/value rows.
- [ ] **DENSE-9 Messages** (2 → 1). Minor: the reply-time line stays as the one
  sentence.
- [ ] **DENSE-10 Settings** (~85 incl. 35 permission helps → ≤ 25). P7 across the
  eight sections; live preview stays the explainer; helper lines only where money or
  sign-in is at stake (no-show/late fee timing, card at booking, time zone, 2FA);
  permission `help` sentences move behind each row's label. Fee and policy wording
  that is legal (describePolicy, LQ-2) is untouched.

### Admin

- [ ] **DENSE-11 Admin Home** (~3 → ≤ 1). KPI strip with sparklines (green fees
  booked through GreenReserve, GreenReserve fees, online bookings, live courses, card
  success rate); fees per day stacked collected vs not collected (paid at the
  counter); courses table worst first with an 8-week sparkline per row; Needs you;
  Pipeline as a funnel with median inquiry→live days; golfer numbers (new, booked
  again, at 2+ courses, avg group). New code: card success rate, green fees booked,
  golfers at 2+ courses, funnel timings (read-only aggregates; spread
  `REAL_COURSE`/TEST-2 into every one).
- [ ] **DENSE-12 Admin Money** (`admin/revenue`, ~25 → ≤ 6). Overview gets the
  Stripe "Today" line and the Toast trio; tables keep their columns; each explanatory
  paragraph → one line + the action. Owner-only blocks unchanged in access.
- [ ] **DENSE-13 Admin Courses + course detail** (~15 → ≤ 4). Courses table gains
  a sparkline column and fill %; course detail's Bookings and Money tab summaries stop
  being sentences that carry numbers — they become KPI strips (players, online share,
  last booking, 30-day change; fees this month vs last, failed charges).
- [ ] **DENSE-14 Pipeline + inquiry detail** (~30 → ≤ 10). Board unchanged; header
  count line becomes a funnel strip (leads · active · needs you · calls this week ·
  live) with median days in stage. Inquiry detail: modal and tab paragraphs → one line
  each; the "different email" warning stays (it prevents a wrong apply).
- [ ] **DENSE-15 Problems, Golfers, Messages, Announcements** (~12 → ≤ 4). Golfers
  record view gets the golfer card numbers (rounds, spend, no-shows, courses played);
  Messages shows `totalUnread` and median reply time; Announcements shows reach and
  dismissal rate.
- [ ] **DENSE-16 Goals, Team, Audit, Systems, Security, Groups, Company docs**
  (~35 → ≤ 10). Systems: status table (job · last run · result · next) instead of
  prose cards; Security: the 24h/30d sentence becomes a KPI strip; Groups shows the
  resident-list count; role/area descriptions move behind the label.

Per D2, every item above that adds a number to an OPERATIONAL tab (tee sheet, shop
register, members list, events, pipeline board) lists those numbers in its PR and
waits for Cam on each.

## 5. The words test

`scripts/words-guard.mjs`, built like `design-guard.mjs` (a ratchet, run in
`typecheck.yml`): for every `.tsx` under `src/app/dashboard`, `src/app/admin` and the
components they render, it counts the words of prose in JSX text and in string
literals that render as text (not classNames, keys, URLs or API values), and compares
each file with `scripts/words-guard.baseline.json`. A file may go down, never up; a new
file starts at the size of its first PR. `--update` rewrites the baseline after a
deliberate cut. Static on purpose: no server, no seed data, same failure on every
machine. It lands with the first PR (Analytics); the before/after numbers in each PR
come from it.

## 6. Not in scope

Golfer-facing pages (book, confirmation, check-in, manage) — already lean; their
policy wording is `describePolicy()` / LQ-2 and is legal text, not clutter. Emails.
The homepage, except the tee-sheet demo per D1.
