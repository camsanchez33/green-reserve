# OPERATOR_REWORK_SPEC — the operator dashboard rework (launch walk 2)

Cam's notes from walking the operator pages, kept word-for-word in spirit and
numbered so each can be decided and built. Nothing here is built yet. Decisions
are recorded under each item as Cam makes them. Order of the rework (Cam
2026-10-19): login → 2FA → dashboard (Tee Sheet first) → Analytics → the rest.

## 1. Operator login — DECIDED (HOMEPAGE_SPEC §0a, 2026-10-19)
Keep it minimal; a photo/brand panel beside the form (form only on phones); a
"Need help signing in?" line pointing to support. Not built yet.

## 2. Two-step code page — /dashboard/login/2fa (Cam 2026-10-19)
- The wording is wrong: it says "send to email" but the code is sent
  automatically. Rewrite it to say the code was sent, and where.
- Offer sending the code to the phone number on the account (SMS) as an option.
- "Also needs to be better" — a cleaner page overall.
- Claude note: SMS codes need Twilio A2P registration (already a launch
  dependency, RUN_QUEUE SETUP) and a verified phone on the login.

## 3. Dashboard chrome (every dashboard page)
- **The icon in the corner** "looks stupid, doesn't do anything" — remove it or
  give it a job.
- **The top banner** (an admin announcement — "Operator agreement" — rendered by
  `AnnouncementBanner.tsx`) doesn't go away after the agreement is accepted, and
  doesn't look urgent; it looks weird at the top. Claude note: it is a broadcast
  from Admin with only a small X to dismiss; nothing ties it to signing. Options:
  auto-clear an agreement announcement once the course has signed the current
  version, and give urgent notices a real urgent look (the 3px left-border
  attention style) instead of a thin white strip.
- **Tabs across the top** (Tee sheet, Analytics, Schedule, Members, Money,
  Messages, Settings): keep — Cam likes them.
- **Course alert** (top right): good spot; rethink what it does, what it says
  and what it shows.
- **Your page** and **Sign out**: fine.
- **Multiple tee sheets:** a course should NOT be able to make multiple tee
  sheets, unless it is a facility with more than one course — and that feature
  must be much more organized and built out.

## 4. Tee Sheet page — /dashboard (Cam 2026-10-19)
- **Header line:** keep the date and the booked / checked-in counts; ADD
  "awaiting check-in".
- **"18 holes · $70 + $10 cart"** (the product/price line): Cam doesn't see the
  point — remove it or replace it with something useful.
- **Find golfer** (right side): keep; make it more organized, not floating in
  space.
- **Refresh button:** not needed as a button — a small refresh icon somewhere
  sensible.
- **Weather** and **Message golfers:** rethink whether they're needed and what
  they say — today they don't explain what they do.
- **Add time:** fine, but needs thinking through. Courses add a time to fit
  someone in, so: warn when it's within ~5 minutes of another group; and maybe
  a separate "Ring someone up" action for a quick sale (Cam: "really needs to
  be thought through").
- **Date picker** ("Sun October 18"): the calendar popup is cut off by the
  side of the screen — it must open fully on screen.
- **The empty bar under the date:** use it for small live warnings/alerts —
  e.g. "2 groups not checked in from the last hour" — what needs doing now.
- **Times listed in hour order:** keep, it's organized.
- **Bottom of the page:** probably nothing needed; think about it.
- **The 3 colored dots (legend)** are too small and sit at the bottom where no
  one sees them. Make the whole square take the color, and move the key into
  the empty bar near the top.
- **Birdie:** needs a better look, and it must be obvious that this is where
  you ask questions — that it's there at all.

**Decisions (Cam 2026-10-19):**
- The price line ("18 holes · $70 + $10 cart") leaves the header and goes
  where staff use it — in the time slot's detail.
- The side panel needs a complete rework. DECIDED (Claude's proposal, Cam
  2026-10-19 "do your idea"): on a laptop, a wide card that opens over part of
  the sheet with the surrounding times still visible (staff keep seeing who's
  next and can still drag groups); on a phone, a full-screen sheet that slides
  up. It shows everything for that time in one place: each group, players,
  paid or not, the price, and check in / pay / move / cancel.
  Built (TT-CARD, branch claude/time-card): the card above, with the price
  line in it, each group's amount (to logins that see payments), its status in
  words, the main action first, the rest as plain links, cancel last. The
  homepage demo mirrors it. The sheet bar now wraps on a phone (it pushed the
  page 30px wider than the screen).
- "Ring someone up" waits for the card reader (POS-1b, after launch). For
  launch: "Add a walk-in" with fit-in warnings (within ~5 minutes of another
  group, slot capacity).

**Decisions, round 2 (Cam 2026-10-19):**
- The corner icon is the TOP-LEFT one: the course's uploaded logo in a small
  white box beside the course name (OperatorSidebar.tsx). It does nothing —
  remove it (or give it a job).
- Weather: keep, rename and explain ("Weather delay / cancel": delay the
  morning's start, or cancel a range of times and email those golfers). Cam
  also doesn't like how it works today — "fix that and ways it can be better".
- Message golfers: keep, rename and explain ("Message today's golfers": who
  gets it — everyone booked on that date — and how: email, and text once
  texting is approved).
- Course alert: a notice on the course's booking page (e.g. "Cart path only
  today", "Back nine closed") until it ends, AND optionally emails everyone
  booked that day.

**Built (PR, branch claude/teesheet-1, 2026-10-19):** header "awaiting
check-in" and no rate; Find golfer + refresh icon in the sheet bar; late
groups and the color key in the bar under the date; tinted squares; calendar
on screen; agreement announcement clears once signed and looks urgent; "Mark
no-show" and "Still coming" on a late group's row in the panel.

## 5. Next from Cam: Analytics (notes to come)

## Analytics — AN-3 (Cam 2026-10-19)

Cam's notes: switching tabs flashed the top bar green ("looks cheap"); "How your course is doing" is childish — it should say Analytics; the dates under it explain nothing; the four presets plus Pick dates looked thrown together — wants a calendar defaulting to the past week; "Money collected" makes no sense (revenue); "Tee sheet filled" is solid; "Bookings" could be better; "Empty spots $86,900" makes no sense; "What to look at" is liked but must be clear and help them act, with Birdie offered for more; the monthly review smaller and say what it will provide; every tab (money, busy times, no-shows, golfers) needs better organisation and explanation, not new data; golfers must know their data is collected; any agreement must be impossible to skip.

Decisions (Cam's picks):
- Dates: ONE button naming the range, opening shortcuts (Last 7 days, This week, Last week, This month, Last month, Last 30 days, This season) beside a month calendar. Defaults to the last 7 days.
- Top four: Revenue · Tee sheet filled · Rounds played · Average per round, each vs the period before, each with a one-line plain explanation. The unsold-spots dollar total is gone everywhere (it is open spots × full green fee — a number no course could ever earn); Busy times lists open spots as a count.
- Under the title: one sentence built only from the numbers ("You took in $X, up N% on the 7 days before, and Saturdays and 8 AM tee times filled best.").
- Golfer consent: a required, unticked Terms + Privacy checkbox at booking naming that the course and GreenReserve keep the booking history (clickwrap), recorded with version and time. Separate run.

Built (my calls, Cam said "think about it"):
- What to look at: each line restates the page's numbers, adds one idea to try where there is a clear one, and an "Ask Birdie" that opens Birdie with the question typed (not sent). Shown only when Birdie is on.
- Monthly review: one compact card; before the first review it says what it will contain and when.
- Tabs: Revenue · Busy times · No-shows & cancellations · Golfers · How they book. Every block has a one-sentence "what this tells you". Golfers says where the data comes from and links the Privacy Policy.
- The green flash: OperatorSidebar started on the default pine until the course loaded on each page; it now keeps the course's identity between tabs and clears it on course switch and sign-out.

## Schedule, Members, Money, Messages — round 1 (Cam 2026-10-19)

Cam's notes. Schedule: "this page sucks … think of what is needed to be known, ease and understanding and functionality … rework the whole thing." Members: straightforward, but needs a full rework to look good, make sense and be organised. Money: "Money" alone means nothing; "Stripe connected" is useless — say this is where you view Stripe; Payments shows every payment ever with random information; Cancellations holds the cancellation policy (belongs in Settings) and an "Upcoming bookings" list (makes no sense) and needs a rework; Payouts — keep the GreenReserve disclaimer but cleaner, and show a table of their payouts so we don't send them to Stripe for everything; Refresh should be an icon on every page. Messages: fine; a little design and wording, maybe an email option and an expected response time. Birdie gets in the way on Messages — should there be a way to move it away at all times?

Decisions (Cam's picks):
- Schedule = "Your week", visual: each day's first/last tee time, interval and price as bands; click to edit. Rates (public, twilight, member, resident; weekday/weekend) in their own table. Closed days and outings as a calendar on the same page.
- Saving hours or prices applies to the tee sheet automatically: every future day updates, booked times are never touched, and the save first shows exactly what will change. No "Apply to tee sheet" button.
- Money = an overview (this week's paid and not-yet-paid, next payout and its date, "Open your Stripe dashboard") + tabs Payments (grouped by day, plain statuses, search), Payouts (table of Stripe payouts), Cancellations (history only). The cancellation policy moves to Settings; "Upcoming bookings" is removed; Refresh becomes an icon site-wide.
- Birdie can be tucked into a small edge tab, remembered per person, and sits clear of buttons and inputs on every page.

- Members = list first: counts on top (active, unpaid, renewing this month), ONE searchable list (name, tier, dues status, last round) filtered by tier / unpaid, tiers in a smaller section beneath; Add member and Import list at the top.
- Price periods are the course's own (Cam: "up to the course if they want twilight times and morning times, whatever they want"): any number of named periods by time of day, each with its own weekday/weekend/member/resident prices. No built-in "twilight" rule.
- Messages promises: "We reply within one business day", plus Cam's cell for urgent mornings once he sends it.

## Settings — round 1 (Cam 2026-10-19)

Cam's notes: "This is where everything is changed for the entire course so this needs to be so good and it's so bad right now — an entire rework." The strip "Test Course 3 · live to golfers · Stripe connected · 0 accounts · 0 photos" means nothing to a course. Remove the "Getting paid moved" note. Your course: "How you look" is fine; course identity changes need GreenReserve's approval (it's for our records), golfer-facing things don't. Description: let them ask the AI to help write it. Course details are confusing — needs to be step by step (holes, then par…); the blurb makes no sense. Nines: you can't name a nine, it just says 36 — rethink nines, bookable products and tee sets together. Gallery is fine; Birdie should help with it. Booking rules: reword and organise; the dress-code and walking-policy selection buttons are bad. Pricing & cancellation: important information, confusing presentation; member vs resident pricing, membership tiers and season passes confuse people. Facilities: "the worst thing I have ever seen" — complete rework. Pro shop: a POS this weak won't cut it. Staff & account: 2FA sits in the middle of everything and change password is stranded at the bottom — rework.

Decisions (Cam's picks):
- Layout: a left list of sections in setup order — Your course · Course layout · Booking rules · Prices & fees · Facilities · Pro shop · Staff · Your account. At the top, instead of the status strip, a "Finish setting up" list of what is actually missing, each with a button; it disappears when everything is done.
- Course layout: guided, one step at a time — holes (9/18/27/36) → name each nine → tee sets (name, colour, yardage, par, rating/slope) → what golfers can book (filled in from the first two steps; they tick). Each step shows what golfers will see; Birdie can help.
- Prices: one "Who pays what" table — rows are the kinds of golfer the course has (Public, Resident, Members by tier, Season pass), columns weekday/weekend/(named periods), each row with one plain sentence on who it is and how staff check. Rows are turned on only if used.
- Pro shop for launch: a proper catalog (categories, prices, stock, quick-add) and ringing items up onto a round or as a walk-up sale (pay link or cash). A card reader (Stripe Terminal) comes after launch. The 50¢ shop fee stays off until the agreement lists it.

My calls (no question needed): course identity edits go to GreenReserve for approval, golfer-facing content saves straight away; Staff (people, permissions) and Your account (login email, password, two-factor) are separate sections; dress code and walking policy become plain text boxes with examples and a live preview of how golfers see them; Facilities becomes a checklist of what the course has, each with a short optional note, shown on the booking page.

Shipped notes (2026-10-19):
- Facilities has no separate note per item. Adding one would need a new column, and that migration waits until after launch. The existing detail fields (range type and balls, pro shop phone, rental prices, caddie type, rates and note, tournament frequency) do that job, and anything else goes in "Anything else" (one line each).
- Tee colour comes from the tee's name (Blue, Black, Gold…); it is not stored. Par stays one number for the course; there is no par per tee.
- "Who pays what": built (branch claude/who-pays). Prices & fees opens with one table — Public, Residents (when a schedule has a resident price), each active membership — weekdays and weekends per named price period, each row one plain sentence. It READS Schedule and Members, computed with the booking's own rules (applyTierRates, the resident rate), with links to change them there; it does not store prices a second time, so two editors can never disagree. The member/resident toggles and resident county/state/proof stay below it as "Members and residents".
- Resident rates: built (RES-1, Cam 2026-10-19 "yes build the resident flow"). Members → Residents holds the list (name, email, card number, card good until, notes). A signed-in golfer on the list books themselves at the resident rate; the rest of the group pays the public rate (per player, as municipal courses charge — not the whole group). The tee-sheet panel's "Residents" picker sets how many of an unpaid group are residents. A member rate is never combined with it.

## Pro shop — POS-2 (Cam 2026-10-19: "everything")

Catalog in Settings → Pro shop: one-tap starter items, categories, optional stock count. Selling on a new Pro shop page (nav, for logins with "Sell from the pro shop"): tap items into a sale, then take cash or text/email a pay link; today's sales below with Send again / Took cash / Void for unpaid links. The customer pays on their phone (Apple Pay, Google Pay or card) as a direct charge on the course's Stripe account; GreenReserve takes nothing while the shop fee is off. Not yet: refunds of a paid walk-up sale from the dashboard (Stripe dashboard for now), a card reader (Stripe Terminal, after launch), sales reporting on Analytics.


## Walkthrough 2 (Cam 2026-10-19)

Cam's notes, verbatim (dashboard part; homepage part is in HOMEPAGE_SPEC "Walkthrough 2"):

> Dashboard
>
> Birdie should still be in bottom corner just think that it should have an optioon to be pushed off screen
>
> Analytics I want you to do deep search what analytics would actullay help golf course and help them improve and help like what do they really need what should we actullay have there do deep research we really want to help them
>
> Schedule is still a bit confusing in the regard of to make twighlight time they ahve to make seperate schedule there should be a way to seperate it out in one schedule set up and the last tee time being the one before stop at doesnt make sense it should be the last one goes at at the stop at time
>
> Pro shop needs to be thought out think of it they need to add a ton of stuff like really think this shit out
>
> they this is for settings course layouthave need to think out how to make that easier in regards to what products are bookable if thye can just book back nine in the morning all of those things need to be seamless and smooth like for instance all these things pop up in the schedule when i click them but they really need to be organized and make complete sense should be trying to help the courses with course management making sure they have the tee time lined up in a format and timely manner that will work dont prohibit anything  but try to point them in right directions this is a huge part and needs to be thought out deeply with good questions
>
> in settings your account make it established that this is the owner account so that they know that they are in the admin for there own course
>
> The whole pricing and fees setting in sections makes no sense like genuinely rethink the whole think the whole thing and make sure that everything actually makes sense like the resident pricing and everything

Items (nothing built yet; decisions recorded here as Cam makes them):

- **W2-1 Birdie placement.** Reverses #143's md+ top-bar button: the launcher goes back to the bottom corner on every screen size, with a way to push it off screen (the phone tuck tab, `TUCK_KEY` in `BirdieWidget.tsx`, extended to desktop). If the corner launcher returns on desktop, restore the Messages composer inset (`pr-[8.5rem]`, made md-only in #143). Update `scripts/birdie-messages-test.ts` and the CLAUDE.md Birdie note.
- **W2-2 Owner account label.** Settings → Your account says plainly that this is the course OWNER login — the admin for their own course (vs staff logins).
- **W2-3 Schedule: last tee time AT "stop at".** Today the last generated time is the one before the stop time (`tee-sheet-engine.ts`, exclusive end). Cam: the last one goes off AT the stop time (inclusive). Touches generation (`generate-tee-times` cron) — overseer only.
- **W2-4 Schedule: price periods inside one schedule.** Today a twilight price means a second schedule (a second `TeeTimeSchedule` row). Cam: split one schedule's hours into price periods (already decided 2026-10-19: any number of named periods, the course's own names, each with weekday/weekend/member/resident prices). Additive migration, verified locally from scratch. Built together with W2-5 — same model.
- **W2-5 Prices & fees: rethink the whole section.** "Makes no sense … genuinely rethink the whole thing … the resident pricing and everything." One model for who pays what (public, resident, member tiers, season pass) × when (price periods, weekday/weekend) and fees (booking fee, late/no-show, card at booking). Builds on "Who pays what" (claude/who-pays) and RES-1.
- **W2-6 Course layout / bookable products.** Make nines, tee sets and bookable products (e.g. back nine only in the morning) seamless; the options that pop up in Schedule must be organised and make sense. Help courses lay out a workable tee sheet — never prohibit, point them in the right direction (warnings and suggestions, not blocks). Needs questions to Cam first.
- **W2-7 Pro shop, thought through.** Courses need to add a lot of items fast (bulk add / import, categories, variants such as sizes, stock). Builds on POS-2.
- **W2-8 Analytics: deep research first.** Research what analytics actually help a golf course improve, then a proposal to Cam before building. Metrics stay in `src/lib/analytics.ts`; AN-1/AN-2 rules hold.

Decisions (Cam 2026-10-20, asked in session):
- W2-1: no preference given; built as recommended — the corner launcher on every screen, the tuck remembered per browser, the top-bar button removed.
- W2-3: no clear answer given; built as recommended — the field reads "Last tee time"; the last slot is the last one on the interval at or before it (7:00 every 8 min to 6:00pm ends 5:58). The generator reconciles future days, so already-generated open days gain the end slot on its next run. Back-to-back schedules: the one that starts at the shared time owns it.
- W2-5: reorganise + price periods for launch (one Prices page: who pays × when, fees in their own section); pricing rules underneath unchanged.
- W2-6: launch courses have plain 18, back-nine starts and 27 holes / 3 nines; shotgun / leagues not definite but plan for them.
- W2-7: courses ring up the shop on GreenReserve from day one — bulk add and variants are pre-launch work.

- W2-4 built WITHOUT a schema change (overseer 2026-10-20): each price period stays one TeeTimeSchedule row; `lib/schedule-plans.ts` groups back-to-back rows (same round, days, interval, holes, on/off) into one schedule, so existing morning + twilight setups read as one with nothing to backfill. `PUT /api/operator/schedule` saves a whole schedule in one transaction. Periods start on a tee time (snapped to the grid). The "additive migration" in the W2-4 bullet above was not needed.
- Open question for Cam (raised 2026-10-20): a membership's flat price ignores price periods, so a member can pay more at twilight than the public. Fix options: a membership price per period, or "the lower of the member and public price". Not changed — W2-5 kept pricing rules as they are.

- W2-7 pro shop (Cam 2026-10-20, asked in session): sizes/colors are OPTIONS under one item (tap the polo, pick the size; each option its own stock; same price unless overridden). Bulk add by paste from a spreadsheet, CSV upload, AND AI ("AI could also help": paste any list or invoice, it fills the rows, staff confirm). Items carry a SKU / barcode number (scanning after launch). Sales tax: Cam — "based by state … the exact location of their course and we will follow those tax laws"; challenged that hand-kept rules make GreenReserve own every rate; Cam chose Stripe Tax (automatic, by the course address and each item's tax category; ~0.5% of taxed sales; the course turns Stripe Tax on in its own Stripe account and still files its own returns). Built in two parts: A = options, SKU, bulk/CSV/AI add, faster selling screen; B = Stripe Tax on walk-up sales and on shop items added to a round (money — overseer only).

- W2-7 part A built (2026-10-20): migration `w2_7_shop_options` (additive: ShopItem.sku, parentId, optionLabel). An option is its own sellable ShopItem row under its parent, named "<item> — <option>", so receipts, sale lines and booking lines need no change; a parent with options is refused by both sale paths (lib/shop.ts, lib/shop-sales.ts). lib/shop-catalog.ts owns create (single or bulk, all-or-nothing, up to 500), edit (options synced: dropped options deleted, or hidden when ever sold), show/hide (a parent takes its options) and delete. lib/shop-import.ts parses pasted rows / CSV (headers in any order, sizes in one cell or one row per size); lib/shop-ai-import.ts has the AI read any list into the same preview (Opus 5.5, writes nothing, 20/hour per course, needs ANTHROPIC_API_KEY). Selling page: search by name/size/SKU, category filter, tap an item to pick its size. Part B (Stripe Tax) next.

Shipped (2026-10-20): W2-1, W2-2, W2-3 (#148); W2-4, W2-5 (#149).
