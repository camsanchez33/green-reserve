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

- W2-7 part A built (2026-10-20): migration `w2_7_shop_options` (additive: ShopItem.sku, parentId, optionLabel). An option is its own sellable ShopItem row under its parent, named "<item> — <option>", so receipts, sale lines and booking lines need no change; a parent with options is refused by both sale paths (lib/shop.ts, lib/shop-sales.ts). lib/shop-catalog.ts owns create (single or bulk, all-or-nothing, up to 500), edit (options synced: dropped options deleted, or hidden when ever sold), show/hide (a parent takes its options) and delete. lib/shop-import.ts parses pasted rows / CSV (headers in any order, sizes in one cell or one row per size); lib/shop-ai-import.ts has the AI read any list into the same preview (Opus 5.5, writes nothing, 20/hour per course, needs ANTHROPIC_API_KEY). Selling page: search by name/size/SKU, category filter, tap an item to pick its size. Part B (Stripe Tax) next — decided 2026-10-20: courses' Stripe accounts are EXPRESS, which can't turn Stripe Tax on themselves, so setup lives in GreenReserve (Settings → Pro shop → Sales tax: the course confirms its address and the state(s) it holds a sales-tax permit in; we set its Stripe tax settings and registrations through the API with the course's Stripe-Account). Stripe charges $0 where no registration exists, so until setup is done shop sales ring up with no tax and the page says so. Launch scope: pro-shop items only (walk-up and added to a round), each item with a tax category; green fees, carts and GreenReserve's booking fee stay untaxed until each launch course's state is checked. Still to confirm from Stripe before building: who is billed for Stripe Tax on Express direct charges.

Shipped (2026-10-20): W2-1, W2-2, W2-3 (#148); W2-4, W2-5 (#149).

### W2-6 rework — course setup, Schedule and Booking rules linked (Cam 2026-10-20)

Cam, verbatim: "need a rework on the whole scheduling and the booking rules in settings it needs to all be linked so if its only 18 there shouldnt still be the 27 holes from before that i had alos it jsut needs to be an easier and smoother process becasue a lot of courses will do an 18 and then ahve morning 9 times or have 9 twighlight times some have 3 nines or a nine and a 18 or maybe two 18s and that transisition from whatever there particular course does it and making it into a schedule needs to be seamless and easy to navigate so think about how to do that process and the way to go about that"

Decisions (asked 2026-10-20):
- ONE guided "Your course" setup replaces Course layout's separate steps: pick the shape (9 / 18 / 18 + a separate 9 / three nines (27) / two 18s (36) / other) → names fill in (Front/Back, North/South/West, the course's two course names) → the rounds golfers can book are suggested from the shape (18 → "18 holes" + optional "Front 9" / "Back 9"; 27 → each pair + optional single nines; 18 + 9 → "18 holes" + the separate nine; two 18s → each course) → land on Schedule with one tab per round. The 9-hole morning / twilight case is a 9-hole round with its own schedule (or a price period), not a second course.
- Changing shape (27 → 18) RETIRES what no longer fits after ONE confirm that lists exactly what changes ("North + South stops being sold; its schedule pauses; N booked times stay booked"). No leftover nines or rounds from an old shape.
- Overlaps WARN, never block (only an exact same start on the same first tee stays refused): e.g. back-nine starts while 18s are making the turn get a plain "leave a gap around 9:15" note.
- Booking rules stay course-wide, with per-round exceptions (walking/cart, group size, how far ahead) set on that round's Schedule tab. Dress code and the cancellation policy stay course-wide (the policy carries fees).

Status (2026-10-21): slice 1, the one-save "Your course" setup with shape-change retire, shipped (camsanchez33/green-reserve#155). Slice 2, overlaps warn instead of block (lib/schedule-conflict checkSchedule: refused only when one tee time would be sold twice; notes shown in the Schedule save preview), shipped (camsanchez33/green-reserve#156). Slice 3, per-round booking rules (CourseProduct walkingPolicy / minPlayers / maxPlayers / publicAdvanceDays, merged by lib/booking-rules; a round window only shortens the course's), is in review. It also makes the course's own group size, walking rule and each schedule's "Golfers can walk" enforced at booking for the first time. Staff/phone bookings and moves are not restricted.

W2-7 part B ships in two steps (2026-10-20): B1 = walk-up sales on the Pro shop page (cash and pay links), with the Settings copy saying so; B2 = shop items added to a round (they ride roundChargeCents and are NOT taxed until B2 lands). Known gaps: a refund — in the Stripe dashboard, or (since B2) an in-app refund of a round with taxed shop items — doesn't reverse the tax record (the course's tax report keeps it); B2 (2026-10-21) taxes shop items added to a round through lib/round-shop-tax.ts, quoted under the charge's own lock; who pays Stripe Tax per calculation on Express accounts is still unconfirmed (Cam asked to check with Stripe).

### W2-6 Schedule simplification — decisions (Cam 2026-10-21, asked in session)

Cam: price period naming and juggling separate schedules for different times, prices and nines is confusing — "keep what it can do, make it more efficient and simple". The course thinks in three things, not "schedules": when we're open, what golfers can book, what it costs. The Schedule page should read that way; what is stored underneath (TeeTimeSchedule rows, `lib/schedule-plans.ts`) can stay as it is.

1. **When you're open.** First tee, last tee (goes off AT that time, W2-3), minutes apart. Courses are usually the same every day, but ANY day may differ (Monday maintenance start, Friday league): default one set of hours for all days, with "Different hours on some days". Seasons: no date-scheduled changes — the course edits its hours whenever it needs to. Cam's idea for the same need: show upcoming weather on the dashboard so they can plan (check what the tee-sheet weather already shows before building more).
2. **What golfers can book.** Nines must accommodate anything the course does; the common cases are back nine in the morning and front nine at twilight. A round is a toggle with WHEN it's sold ("all day" or between times), set inside the same page, never a second schedule the course has to build.
3. **What it costs — one price table.** Starts as one row ("All day"); "+ Add a price change" asks only "From what time?". Period names are AUTOMATIC from the start time (Morning / Midday / Afternoon / Twilight) and can be renamed by tapping the name — no name box to fill. Weekday and weekend price per row. **Cart price can differ by time and by round** (an 18-hole cart, a 9-hole cart, a twilight cart — whatever they charge). **Member and resident price columns only appear when the course has a membership or a resident list.** Walking stays available but out of the price rows.
4. **Leagues, standing blocks, tournaments and outings** are NOT set here. Weekly blocks are set on the tee sheet (block a run of times, repeat weekly). Cam 2026-10-21: "we need to make a tab for tournaments and outings" — a dashboard tab of its own (the hidden "Soon" Tournaments / Outings placeholders); its contents still to be specified with Cam.

Visible bugs on the current Add a schedule form (screenshot 2026-10-21): the round picker reads "18 holes · 18 holes" (name and hole count repeated); Minutes apart shows "010"; the "Golfers can walk 6:30 AM – 3:00 PM" line sits inside the price block.

Answers (Cam 2026-10-22, asked in session): the price table is ONE table per set of days — a row per round, a column per price change (shared by every round); days with different hours can also have their own prices; no real courses yet, so existing setups are converted freely.

Built (2026-10-22): the Schedule page is three sections — When you're open (usual hours; "Different hours on some days" adds sets of days with their own hours and price table, or closed), What golfers can book (each round on/off, all day or between two times), What it costs (a row per round × a column per price change, weekday/weekend, cart, member/resident rows only when the course has them; names automatic, tap to rename). One "Review and save" for the whole page shows the tee-sheet preview first. `lib/course-plan.ts` is the model: `compilePlan()` writes it as TeeTimeSchedule rows (one per set of days × round × price column, back to back), `readPlan()` reads rows back, `checkPlan()`/`checkRows()` validate (overlaps keep W2-6 slice 2's rule: refuse one tee time sold twice, warn the rest). PUT /api/operator/schedule `{ coursePlan }` replaces the course's rows in one transaction and rebuilds the coming days (booked/blocked times untouched); preview op `course`. Generation and charging are unchanged. A round switched off in Your course drops out of the plan on the next save. Walking is per round ("Golfers can walk" under What golfers can book; off = cart required and charged on every tee time, stored as walkingAllowed false on its rows). A day that was closed and is reopened starts at the usual prices. Closed days, per-round booking rules and booking windows are as before. The admin's course page still edits single rows (AW, other session).

Still open for Cam: 27/36-hole crossover courses at launch — fully self-serve, or set up with GreenReserve's help (W2-6 says launch courses include 27 holes / 3 nines).

### W2-8 Analytics — research and decisions (Cam 2026-10-22)

Research (sources in the proposal sent to Cam 2026-10-22): the metrics that move a public course are revenue per available spot (not fill alone), rate actually paid vs posted, spend beyond the green fee, booking pace ahead, demand turned away, no-shows/short-shows by whether a fee applies, weather-adjusted cancellations, and keeping regulars. Not built on purpose: industry benchmark lines (different denominators), "lost revenue" as a dollar figure, forecasts, vanity counts, weather-API charts, any tile outside Analytics (AN-1).

Decisions (asked in session): build all nine, small ones first; pro-shop money is its OWN line, never in the headline revenue; the resident report is the course's (a CSV it forwards to its city/county); the gone-quiet list shows name, email and phone. Weather/closure cancels are marked explicitly: `performCancellation(..., { courseCalledOff })`, written on the cancel event by lib/weather-cancel.ts ('weather') and lib/course-closure.ts ('closure').

Built, slice a (2026-10-22): Busy times — the heatmap switches between "How full" and "Earned per spot" (collected course share ÷ spots offered, past tee times); "Golfers you turned away" (times sold out, by day × hour; TeeTimeAlert sign-ups, CSV). No-shows & cancellations — short-shows (groups that came with fewer players), no-show and missing-player rates split by whether the booking carried a fee; rounds the course called off (weather / closure) counted apart and left out of the cancellation rate, with the closed days listed. Golfers — "Residents and everyone else" (paid rounds since RES-1, Oct 19 2026, players and green fees, CSV). Built, slice b (2026-10-22): Revenue — "Beyond the green fee": rounds with a cart (share of paid bookings), shop items added to paid rounds (total and per round played), walk-up shop sales paid in the range — all before tax and NOT in revenue. Golfers — "Regulars who've gone quiet": 3+ rounds on different days, last round 14+ days and more than twice their usual gap ago (to the range end or today), with name, email and phone (tap to email/call) and a CSV. Built, slice c (2026-10-22): Revenue — "What golfers paid against your posted price": green fees on paid rounds vs each tee time's posted price × the players who paid, by rate (Standard, Residents, each member tier), with the total below posted (exact, CSV); twilight and other rounds are measured against their own posted price, not a peak rate. Busy times — "The next two weeks": players booked so far for each of the next 14 days vs the same weekday the same number of days out over the last four weeks (bookings made by then and not cancelled by then), a day under 80% of usual marked behind. All nine W2-8 items are built.

### W2-9 Tournaments & Outings tab (Cam 2026-10-21, asked in session)

Cam: "should help walk through a course working how to input a outing or tournament, help with organization and preparation." A dashboard tab of its own (the hidden "Soon" Tournaments / Outings placeholders become one "Events" tab — name to confirm with Cam).

- **Guided setup, step by step** (Birdie can also draft an event and its checklist from a description, via a propose tool — never writes): event type (outing / tournament / league night / other) → date and start (shotgun on N holes, or tee times from a time) → groups / players → organizer contact, price per player and what's included (cart, range, food) → payment (below) → review. Saving blocks the tee sheet and builds the checklist.
- **Block the tee sheet:** the times are held so golfers can't book them; shotgun blocks every tee on the chosen holes for the round's length. Uses the existing block machinery; the blocked times show the event's name on the board.
- **Prep checklist** with due dates counted back from the event: confirm headcount, pairings, cart signs, scorecards, rules sheet, food order, final invoice. Staff tick items off; overdue items show on the event and on the tee sheet day.
- **Player list + pairings:** add or import players (paste / CSV), put them into groups and starting holes, print or send the pairings.
- **Payment — every common way, chosen per event:**
  1. Pay at the course (cash/card at the counter, recorded on the event; no GreenReserve fee, like `paid_offline`).
  2. Organizer pays: a deposit link, then a balance link once the headcount is final.
  3. Per-player pay links: text/email each player their own link from the player list.
  4. Player sign-up page: a public page where players register and pay themselves.
  All online payments are a direct charge on the course's Stripe account (same as pay links), with **GreenReserve's $1.50 per player added** (Cam 2026-10-21) — on the organizer's bill it is $1.50 × players. Money = overseer only. BEFORE charging it: the fee must be in the Operator Agreement and `legal/LQ-2_FEE_COPY.md` (Cam's sign-off).
- **Refunds / cancellations:** the course writes its own deposit and refund terms on each event; staff refund from the event page when they decide to (no fixed GreenReserve rule).
- **Build order** (so whatever misses Nov 1 is the last piece, not half of everything): (a) setup, block, contact/price, checklist, players/pairings; (b) pay at the course + organizer deposit/balance links; (c) per-player pay links; (d) the sign-up page.

**Decided (Cam 2026-10-22):** the tab is **Events**; owner logins and staff given the new "Run events" permission (in the Manager preset, not Front desk or Legacy). Default checklist: confirm the headcount (7 days before), order the food (5), make the pairings (2), cart signs / scorecards / rules sheet (1), send the final invoice (the day after). A shotgun holds every tee from an hour before the start to the end of the round — 4½ hours after for 18, 2¼ for 9 — and the course can end the hold at another time.

**Built — slice (a), 2026-10-22:** `CourseEvent` / `CourseEventTask` / `CourseEventPlayer` and `TeeTime.eventId` (additive migration `20261022010603_w2_9_events`). `src/lib/course-events.ts` owns it: saving blocks every OPEN tee time in the window with `eventId` set (booked times are never held — the event lists them to move, then "Hold the open times" (shown whenever an open time in the window isn't held — the page names each one); a time staff blocked by hand is never taken); times generated later are created already held (`heldBy()` in `src/lib/event-hold.ts`, read by `generateTeeTimes`); moving the event moves the hold and shifts the checklist's due dates; cancelling gives the held times back; a held time staff unblock leaves the event; reopening a closed day keeps an event's hold. Routes `/api/operator/events` and `/api/operator/events/[id]` (`events.manage`; writes also need the current agreement). Page `/dashboard/events` replaces the Tournaments / Outings placeholders (old URLs redirect): the guided setup (what it is → when → who and what → review showing the exact hold and the booked groups in the way), the event page (tee-sheet hold, checklist with due / overdue, players pasted from a spreadsheet, pair in list order, edit groups and starting holes, print or email the pairings — replies go to the staff member who sent them). The tee sheet names the event on held squares and in the time card, and the "needs doing" bar lists events with overdue checklist items. A short-notice event's default items are never due before the day it was set up. No money moves in slice (a): the price per player is recorded, not charged. Tests: `scripts/events-test.ts`, `scripts/events-db-test.ts`. Birdie drafting an event is not built yet.

**Decided (Cam 2026-10-22, after slice a):** setup asks how much of the course the event uses — the whole course (nothing in its hours can be booked) or part of it (a shotgun picks the nines it uses, where the course has more than one; any event picks times in its window that golfers can still book). Most courses won't share, but it has to be there. A time an event holds can't be unblocked or deleted from the tee sheet — the event is changed instead (the time card says so and links to it). The admin tee sheet is unchanged (another session owns it). Built: `CourseEvent.shareCourse` / `holdNineIds` / `keepOpen` (additive migration), `heldBy()` takes the round's nines.

### 27 / 36-hole courses (Cam 2026-10-21)

GreenReserve sets up 27/36-hole layouts (named nines, which pairs make an 18, crossovers, what's bookable) from information the course gives in the **onboarding details sheet** — add layout questions there. After setup the course can change and adjust everything itself in Your course / Schedule (W2-6).
