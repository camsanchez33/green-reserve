# ADMIN-REDO — GreenReserve headquarters (Cam 2026-11-11)

Cam's plan, in chat 2026-11-11: the admin is a separate product from the course dashboard — "the headquarters of a
software company", like Stripe / Ramp / Linear, not a golf-course dashboard. Same GreenReserve branding (forest green,
our fonts, serif headings where they fit, off-white page), its own visual identity.

## Decisions (question feature, 2026-11-11)
- **Now, one page at a time.** Each page: a mockup with example content (clearly marked) → Cam reviews what is on it
  and how it looks → built with real numbers only → Cam reviews live → next page. Nothing goes out all at once.
- **Mockup first**, starting with Overview.
- **The look (Cam 2026-11-11, on the Overview mockup `lanes/admin/overview-mockup.html`,
  claude.ai/artifact/Lp9VdYJTqNEJeQ9jbj9hRk): the admin is GREEN GLASS** — green-tinted frosted panels over soft
  blurred green shapes, light by default with a dark switch, highlight tiles in forest green + one warm gold, EB Garamond
  headings + Libre Franklin. It replaces ADMIN-C (white, Inter) for `/admin/*` and overrides, for the admin only, the
  bans on rounded-xl, shadows above 0 1px 2px and the dark background. Glass stays readable: solid panels under
  `prefers-reduced-transparency`, text on glass clears 4.5:1 in both themes.
- **The course dashboard goes CHARCOAL** (the mockup's third direction: solid raised cards, no glass, light default
  with a dark option) — carried over page by page AFTER the admin Overview is built and approved. Build's job.
- The homepage demo's phone keeps the $1.50 line (it mirrors the real booking page).
- **#360 (old admin Home) closed; #365 (Problems) merged** — Problems becomes Support & Issues later.

## Navigation (Cam's)
Workspace: Overview · Golf Courses · Onboarding · Bookings · Users & Golfers.
Financials: Revenue & Payments · Expenses · Financial Analytics.
Management: Business Analytics · Support & Issues · Platform Activity · Settings.
Global search, notifications and a Quick actions button (add course, add user, record expense, create report, view
alerts, export data) on every page.

## Phase 1 (build first)
Overview · Golf Courses (directory + profile, readable without logging into the course's dashboard) · Onboarding
(pipeline + implementation checklist + profile) · Revenue & Payments (earned vs collected vs outstanding, per course,
per player) · Expenses (add, receipt, category, vendor, recurring) · global search and notifications.

## Phase 2 / 3 (later)
Financial and business analytics, golfer database and retention, acquisition funnel, reports and exports; then
automated onboarding, support tickets, advanced permissions, billing, platform health, forecasts.

## Overview (the first mockup)
Six cards: courses, revenue this month, bookings, active golfers, onboarding waiting, net profit — each against the
period before. Revenue chart with day/week/month/quarter/year and the period before. Recent activity and Needs
attention side by side.

## Rules carried over (Build will hold these, raising conflicts with Cam)
- Live numbers are counted, never estimated; example numbers appear only on mockups, marked as examples.
  Forecasts and break-even are estimates by nature — Phase 3, and Cam decides how they're labelled then.
- Test courses never count in platform numbers (TEST-2).
- There are no course subscriptions today; no subscription or MRR figures until there are.
- Admin areas (AW-11) and the owner-only doors stay; every new page gets an area and `areaGate`.

## Overview review (Cam 2026-11-11, on the built page)
- "Very nice" on the look. The top bar's "A system needs attention" line goes: each broken system is its own row in
  Needs attention, linking to the fix.
- Cards: courses live, revenue, onboarding pipeline, net profit, EXPENSES (new), and FEES MISSED (service fees not
  collected because golfers paid cash at the counter — PAY-2's counterFeesUncollected). Players and golfers come off.
- Quick actions: removed.
- Later: an AI assistant in the admin, like the course dashboard's — read-only, never shares information outside
  GreenReserve. Its own mockup and decisions when we get there.

## Page 2 — Golf Courses (Cam's comments 2026-11-12, then "approved, build it to match the mockup")
Mockup: `lanes/admin/courses-mockup.html` (claude.ai/artifact/S9uejLkUeukpvf9f3Hcgw2). A directory — course, status,
bookings this month (vs last month to the same day), our fees this month, last booking — with filters All · Live ·
At risk · Onboarding · Offline and a find box; clicking a course opens its profile beside the list (Overview: bookings,
fees, fees missed, failed charges, last booking, joined; Contact & agreement; Setup checklist; Payments; Notes) with
"Open full profile" (the existing admin course page) and "Open their booking page". Readable without signing in to the
course's dashboard. At risk = a live course with no bookings in 14 days (Build's default; Cam can change it).

Final mockup (after Cam's comments): `lanes/admin/courses-mockup.html` v13. The directory's last column is
"Booked online" (% of the month's rounds booked online — where our fee is earned), not last booking. The profile is
one column, no tabs: numbers (bookings, our fees, fees missed, failed charges) → Setup only while unfinished (first
for an onboarding course) → Contact → Agreement & payments (agreement, Stripe, joined, last booking) → Notes; "Full
profile →" and "Booking page ↗" are small pills beside the course name.

## ADMIN FORMAT — every admin page follows this (Cam 2026-11-12, from his comments on Golf Courses)
1. **No subheadings.** A page title is the title alone ("Golf courses") — no sentence under it, no date line.
2. **One search, in the top bar, frosted glass, no wording** — a magnifier and the field. Never a second search box
   on the page; the top search finds courses, golfers and payments.
3. **Filters are one "Filter" button** that opens a short menu with counts; the button then reads "Filter: At risk".
   No rows of filter chips.
4. **Separate things are separate glass cards with a gap** (as the Overview's cards). Inside a card: no boxes —
   numbers, facts and notes are plain rows divided by hairlines.
5. **Few cards, no decoration:** the alerts bell and other top-bar controls sit without boxes; only search is glass.
6. **Links to elsewhere are small pills at the top of their panel**, never a row of boxed buttons at the bottom.
7. **Menu group headings (Workspace, Financials, Management) are bold, full ink** — readable, not faint grey.
8. **One column over tabs** when a panel's parts fit in one scroll; the most useful part first.
9. **Columns and cards show business numbers** — what earns, leaks or needs action (e.g. "Booked online", "Fees
   missed"), not trivia like "last booking".
The Overview is brought into line with these (no date line under the title, glass search with no wording, bold menu
headings, no boxed top-bar controls).

## Page 3 — Onboarding (Cam commented through the mockup, then approved 2026-11-12)
Mockup: `lanes/admin/onboarding-mockup.html` (claude.ai/artifact/U6Zot4ybuj3B8L6Lqg2hYY, v16). No cards on top — one
list of every course in onboarding, SORTED BY WHAT IT NEEDS: overdue (waiting 7+ days) first, then call-or-email
(new inquiry, reviewing, waiting on them), then our setup (details in, building); longest
wait first within each. Columns: Course · Stage (with a progress bar) · Next step (one plain sentence; a small amber
"N days waiting" under it only when overdue) · Launch (expected date). A Filter button (All, Overdue, Call or email,
Our setup). The profile card: name + town and an "Inquiry →" pill (plus "Book on Cal.com ↗" before a demo);
a box saying where they are — "Step 2 of 8", the step in bold, the next action under it (no labels, no "with Cam",
no jargon like "chase"); the 8-step setup checklist with the current step marked; Contact (contact, came from,
expected launch, agreement); History (dated events); Notes with a plain field and a quiet arrow to save (no button).
Words: "Inquiry", never "enquiry".

## One home per course (Cam 2026-11-12: "a course that is onboarding shouldn't move over to the courses tab until
## it's ready")
A course lives on ONE admin page at a time: Onboarding from the first inquiry until it is approved and live; Golf
Courses only once live. Golf Courses therefore lists Live, At risk and Offline courses only — no Onboarding filter or
rows there — and a course moves there the day it goes live and leaves Onboarding the same day. Onboarding has no
"Check in" group or live rows; a new course's first-month check-in is a to-do in the Overview's Needs attention.

## Page 4 — Bookings (Cam's comments 2026-11-12; mockup `lanes/admin/bookings-mockup.html`)
**A read-only record** — "book keeping for legality if someone ever asks": every booking on GreenReserve, newest
booked first, columns Booking (GR-number) · Golfer · Course · Tee time · Players · Booked · Money (amount, status
under it). Top search finds by booking number, golfer or course; Filter: All, Problems, Today, Upcoming, No-shows,
Cancelled. The card: whether it's paid first (big, coloured), then the whole booking (tee time, course, round, booked
when/how, number, golfer contact, course policy, checked in — a declined card is NOT checked in), money lines with our
service fee and its state (collected / not collected / none), history. Pills: Course →, Stripe ↗ (view only).
**GreenReserve never charges, retries or refunds a golfer from the admin** (Cam: "we can't be able to just charge
people … it is not allowed or in our responsibility to retry the payment"). The round is the course's sale on the
course's Stripe account; ours is the service fee per the policy. → Build: remove the admin "Retry charge" (and check
admin refund) from the live Revenue page — Cam's decision; ask before removing admin refund.

**Purpose of the page (Cam 2026-11-12, "the whole point of the page to know while building"):** Bookings is the book-keeping record, so we can answer if anyone ever asks about a course or a player. GreenReserve gets paid through booking fees. We may NOT charge people ourselves, and retrying a golfer's payment is neither allowed nor our responsibility. The page only shows: every booking, what was owed, what was paid, whether our fee was collected, and the history. It has no charge, retry, refund or dispute actions, and the only links are Course → and Stripe ↗ (both view-only).

## Course dashboard look (Cam 2026-11-12)
Charcoal GLASS is the default, with a Light switch: soft grey blurred shapes behind frosted panels, the same build as
the admin's green glass. Monochrome chrome (charts, links, buttons white/grey) so colour carries meaning: green = paid / ahead of usual,
amber = to do soon (not paid yet, past their time, register closed, behind usual, unread), red = a problem (declined card).
The light behind the glass is abstract blurred ribbons, not round blobs. The course's own colour appears only on its crest and the active tab's dot. Mockup:
`lanes/dashboard/home-mockup.html`.

## Page 5 — Users & golfers (mockup `lanes/admin/users-mockup.html`, awaiting Cam's comments)
One list of golfers (with an account), guests (booked without one) and course staff logins. Filter: All · Golfers ·
Guests · Course staff · Problems. The search finds a name, email, phone or course. Card: their standing, the account
or login details (texts consent, sign-in, 2-step for staff), their record, their bookings (→ Bookings) and history.
Read-only, like Bookings.
Note for the Home build (Cam 2026-11-12): "Open the register" shows ONLY when the course has turned on, in Settings,
that it takes cash and we keep track of the register. Courses that don't take cash never see it.

## Course dashboard Home: APPROVED (Cam 2026-11-12, "approved, build the home page to match the mockup")
Mockup: `lanes/dashboard/home-mockup.html` (final version). What it settles:
- Look: charcoal glass by default with a Light switch. Monochrome chrome. Colour only where it means something:
  green = paid / ahead, amber = to do soon, red = a problem or unpaid, blue = rain. Abstract blurred ribbons behind
  frosted panels. "Powered by GreenReserve" with GreenReserve in our green.
- Top: the date (no Open tee sheet button), "As of", one search. "Open the register →" bar only when the course has
  switched on taking cash (new Settings switch; display only in this PR).
- Three cards: Next off · Checked in N of M players · weather (rain in blue: "rain at 4 PM").
- Four numbers: Players booked (+N vs last week) · Tee sheet filled (Up/Down X% vs last week) · Collected today
  (green, no second line) · Not paid yet (red, no second line).
- Today by hour: every bar the same height, filled by share. Played green, playing yellow, booked white, open red.
  One line under it: "N spots · N booked".
- Next 14 days: one column per day. The bar = booked out of the most seats any day has. The line = the 4-week average
  for that weekday. Amber when behind its usual pace. Today labelled like the others.
- Week ahead: four clear steps, with the % printed in each cell, heat in red.
- Events coming up: name, date, time, how full. No money.
- Right column: Action needed (just the list, no count tiles) · Next payout (own card) · Staff notes · Course
  conditions (cart path, pins, greens only, each with a detail line, no "set by" line) · goals coloured by how close
  to target (no line, no key).

## Page 5, Users & golfers: DROPPED (Cam 2026-11-12)
"there isn't a need for users and golfers yet because they aren't making an account with us, it's with the course."
There is no separate tab. Instead, each course's profile (Golf courses → the course) gets a People section: its staff
logins (role, 2-step, last sign-in), its members, and the golfers with sign-ins who book there. Looking up one golfer
across courses (a support email) is done from the Bookings search (name, email, booking number). The menu loses
"Users & golfers".

## Revenue (mockup `lanes/admin/revenue-mockup.html`, in review; Cam 2026-11-12 comments so far)
- Called "Revenue" everywhere (title, menu, cards). One column, no tabs. The Filter picks the period and everything follows it, the chart included.
- Cards: Revenue (vs the period before) · Average per live course · Stripe payout. No Stripe-fee card: rounds are
  charged on the COURSE's Stripe account, so the processing fee is theirs.
- Revenue chart: a running total for the period against the one before, plus a sentence saying ahead or behind by $X.
- By course (revenue, missed, vs last period, CSV) beside: Course payment problems (only a course NOT paid right:
  failed or short payouts; golfer disputes are the course's, with its player) · Payouts · Books vs Stripe.
- Ledger: every movement of our money (the MoneyMove ledger, GreenReserve's side), one row each, with a Stripe link and CSV.
- Removed: Disputes, Never reached us, Courses earning, Kept after Stripe fees.
- Legal to-do: the Operator Agreement's next version should say golfer disputes and chargebacks are the course's.
- Admin backdrop (Cam 2026-11-12, "more of a design, not just two dots"): every admin page swaps the round blobs for
  blurred SVG ribbons (greens + one gold thread), the same design as the course dashboard's charcoal.
- Revenue: Stripe links are a small arrow icon ("Open in Stripe"); CSV is a download icon. By course = bookings, revenue,
  vs the period before. The three small cards sit in one row; By course and the Ledger are full width below them.

## Revenue: APPROVED (Cam 2026-11-12, "approved, build the revenue page to match the mockup")
Final mockup: `lanes/admin/revenue-mockup.html`. The Admin lane builds the page; Build owns its data (money routes stay
Build's): the period numbers, the running-total series, by course, payouts, course payout problems, Books vs Stripe, and
the GreenReserve-side MoneyMove ledger with CSV. Owner-only parts stay owner-only (payouts and balances), and Money-area
gating stays.

## Theme changes (Cam 2026-11-12, queued; don't interrupt the work in flight)
- Course dashboard LIGHT mode stays glass: the same ribbon backdrop as charcoal, but on a light page with BLACK/charcoal
  ribbons behind frosted white panels (charcoal = dark page + light ribbons; light = light page + dark ribbons).
- Admin: NO light mode. Green glass dark only: remove the Light/Dark switch and the gr_admin_theme cookie's light value
  (treat any saved "light" as dark).

## Course dashboard Tee sheet + time card: APPROVED (Cam 2026-11-12)
Mockups: `lanes/dashboard/teesheet-mockup.html` and `lanes/dashboard/timecard-mockup.html` (final). Today's tee sheet,
unchanged in layout, in the charcoal glass, with:
- The five numbers as separate cards; Not paid yet in red.
- Time card: no "Still coming", no "Add a walk-in who already played". Mark no-show stays.
- Close this time / Hide online / Delete time show only on a time with nobody booked, and the server refuses them on a
  booked time.

## Disputes (Cam 2026-11-12)
Golfer chargebacks are the course's. Our Connect accounts are Express, so a course can answer one only when "Manage
disputes" is ON in GreenReserve's Stripe (Settings → Connect → Express Dashboard → features). Cam is turning it on
(Stripe docs: docs.stripe.com/connect/disputes and /connect/express-dashboard). The admin has no evidence pack. The
Operator Agreement's next version should say chargebacks are the course's to answer.

## Financial analytics: APPROVED (Cam 2026-11-12)
Mockup `lanes/admin/finance-mockup.html` (final). Owner only. Filter: last 12 / 6 / 3 months, this year.
- Cards: Revenue · Expenses · Profit · Margin, each with "Up/Down X% vs <the same stretch before>". No other sub-lines.
- Month by month: smooth revenue line (green) and expenses line (red). Between them, green where in profit and red where at a loss. $ levels on the left; the last month's value labelled.
- Revenue breakdown (by source: booking service fees, no-show & late-cancel fees, membership dues fees) and Expenses breakdown (by category, link to Expenses), side by side. Expenses are red everywhere.
- Months table: bookings, revenue, expenses, profit, margin. Clicking a month opens its breakdown: revenue by source, expenses by category (each vs the month before), by course (bookings · revenue), and the month (bookings, live courses, new courses live, profit). CSV.
Data from the MoneyMove ledger (GreenReserve side) and Expenses; counted, never estimated. The data is Build's.

## Goals: one pace rule everywhere (Cam 2026-11-12)
Every goal bar fills with progress so far, and its COLOUR says where the period ends at the current pace:
- Costs (Expenses' monthly budget): green = on pace to stay under · yellow = within 10% · red = on pace to go over.
- Revenue / bookings (admin Revenue's revenue goal, course dashboard Home goals): green = on pace to hit · yellow = within 10% short · red = on pace to miss.
Pace = progress so far ÷ elapsed share of the period, projected to the period's end. One shared helper for admin and
dashboard. Admin Revenue gains a revenue-goal card (owner sets it); Expenses gains a monthly budget (owner sets it).

## Expenses: APPROVED (Cam 2026-11-12)
Mockup `lanes/admin/expenses-mockup.html` (final). Owner only.
- Glass "Filter" and "+ Add" buttons side by side.
- Cards: Monthly costs (vs last month) · <Month> budget (spent of budget; the bar is coloured by pace: green under, yellow within 10%, red over; with the forecast for month end) · Spent this year (vs last year by today).
- Big numbers in ink. Colour only on the change line and the bar: coral, honey, leaf.
- Table: What it is · Category · How much · How often.
- Card: when it renews ("Renews in X days · date") or "Finished"/"Paid once", then the details shown saved. Pills at the top: Edit · End it/Restart · Delete. History is just a dated log, with no explanation text.
- Real categories: Infrastructure · Tools & services · Legal & professional · Other. Financial analytics uses the same four.
- Needs (Build): a monthly expense budget the owner sets, and expense change history.

## Business analytics: APPROVED (Cam 2026-11-12, "the business analytics is good to go")
Mockup `lanes/admin/business-mockup.html` (final). Course-focused; nothing about who is golfing. Filter: last 12 / 6 / 3 months, this year.
- Cards: Live courses · Online bookings (what earns our fee) · Tee sheets filled (average across live courses), each vs the stretch before.
- Bookings by month: stacked bars (online · phone & counter), gridlines with a scale, the total above each bar, the running month faded and marked *.
- What courses get from us (counted, never estimated): green fees booked online · bookings made after the shop closed · paid before they arrived · no-show & late fees collected for them.
- Courses joining: Reached out → Responded → Calls held → Signed → Built → Live, each with its count, % from the step before and average days at that step; then reached out to live (% · days), in progress now, waiting on us (red). "Reached out" needs an outreach log (new data).
- Courses table: online bookings, vs before, tee sheet filled, booked online, our revenue (GreenReserve's, the period picked). CSV.

## Course dashboard Pro shop: APPROVED (Cam 2026-11-12, "approved, build the pro shop")
Mockups `lanes/dashboard/shop-mockup.html` (Register) and `shop-sales|stock|close-mockup.html` (final). Charcoal glass.
- Register: the items full width until the first tap; one Filter button for categories; photo thumbnails on sale lines.
- Sales: a day with a calendar picker; "$taken · n sales" (taken = paid − refunds; voided and waiting not counted); a wordless search + one Filter (how paid, status). One line per sale: sale # (new per-course number, from the first new sale on, no backfill), time, items, how paid, total (voided struck through). Tap → detail on the right: items, tax, total, Receipt always, Refund on paid, and for an unpaid pay link Send again / They paid cash / Void.
- Stock: a wordless search, Filter (sold out, low, hidden, categories), one "+ Add" → One item / Many at once. One line per item: photo, name + category, "n in stock" / Not counted / Each size / Sold out (red), price; low = the item's reorderAt. Tap → detail: photo, price, in stock, barcode, Edit + Receive stock, "Hide from the register" link. Adding an item: pick a category or "+ New category".
- Close out: the drawer count is tap-only (− / + per bill and coin, summed on the client; only the total is stored). Expected = starting cash + Shop sales in cash + Rounds paid in cash (register sales carrying a round) − cash refunds (+ "Older rounds marked paid" only when non-zero). "Difference" (Short / Over / Even). Leave in the drawer: the last float, nearby amounts, Other.
- The rail search loses its words on every dashboard page.

## Course dashboard Support (was Messages): APPROVED (Cam 2026-11-12, "approved, build the support page")
Mockup `lanes/dashboard/messages-mockup.html` (final).
- The tab is renamed "Support" and moves to the bottom of the rail, after Settings, with its unread count (on a phone it lives in More).
- The page is only the chats: "Open chats" fills the page; each line = subject, last message ("You: …" when ours is last), and its state: Waiting on us (amber) · New reply (green) · Answered. A white "+" starts a new chat.
- Tapping a chat opens it full page: "‹ Chats" back, the subject, "Waiting on us · we reply within 2 business days", the messages, a box and a white paper-airplane Send (faded until typed).
- Gone: the three top cards (reply time, email, assistant questions), search, filter and the separate announcements list. GreenReserve announcements arrive as a chat from GreenReserve.
- New data: one chat per question (today it is one running thread per course; each operator message opens a ticket). Reply promise is 2 business days (Cam reversed MSG-1's 48 hours): the due time skips weekends.
