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
tap), sourced from the definitions block at the top of `src/lib/analytics.ts` — never
rewritten in the component.

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

(Filled from the page inventory — see below.)

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
