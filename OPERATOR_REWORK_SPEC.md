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

Still to ask: Members layout, Messages response-time wording, twilight start (fixed time vs before sunset).
