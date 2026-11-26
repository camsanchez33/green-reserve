# Dashboard lane — the course dashboard (`/dashboard/*`)

Read this and CLAUDE.md only. Approved decisions, word for word, are in `ADMIN_REDO_SPEC.md` (sections named below);
older dashboard rules (tee sheet DENSE-4, VIEWS-1, TEES-1, Home board, AN-1 "no stats on operational tabs") are in
`docs/DECISIONS.md` → "Design system".

## Look
Charcoal glass by default; Light is glass too (dark ribbons on a light page). Every change ships in BOTH looks —
screenshot both before review (`scripts/glass-test.ts` fails a charcoal-only rule). Pages use tokens, never typed hex.
The rail: Today (Home, Tee sheet, Pro shop) · Business (Money, Members, Events, Schedule, Analytics) · Settings ·
Support (last, with its unread count). Search without placeholder words.

## Done (merged)
Home · Tee sheet + time card · Pro shop (Register, Sales, Stock, Close out; blind count) · Pro shop stock box ·
Support (chats) · Light parity. Specs: ADMIN_REDO_SPEC "Course dashboard Home", "Tee sheet + time card",
"Course dashboard Pro shop", "Pro shop item stock box", "Course dashboard Support", "Rule: Light and Charcoal".

## Next (launch-plan order)
1. **Revenue (was Money) — APPROVED, build it** (Cam 2026-11-15, "after those 2 comments go you can commit that page"). Mockup `lanes/dashboard/money-mockup.html` (https://claude.ai/artifact/3ZLTeoN59iucsJiRvhDkda) is the spec: build exactly what it shows, in both looks. Rail item renamed Revenue. The GreenReserve $1.50 fee is never in course revenue (one muted Totals line only); "Net revenue", never "profit". Both Stripe buttons are the small Stripe logo square (white mark on #635BFF); the "Open in Stripe" button inside a payout's detail stays as words. Data the page needs that the API doesn't return yet (30-day average-by-time-of-day line, Food & beverage from shop categories, Stripe-mismatch detail) comes from Build; agree the shape with Build before wiring it.
2. **Memberships (was Members) — APPROVED, build it** (Cam 2026-11-16, "that page is good to go"). Mockup `lanes/dashboard/members-mockup.html` (https://claude.ai/artifact/7Xg3rPg8RWJn78erp8emb3) is the spec, in both looks. Rail item renamed Memberships.
   - The top three numbers are Memberships offered, Season passes offered and Dues collected this year.
   - "Your memberships" and "Season passes" lists each show colour, name, price and count, most first, and each has a bare plus. Beside them, "Dues this year" is broken down by each membership and pass, aligned under the third number.
   - A row opens that membership's or pass's own page: three numbers (members, dues, overdue renewals), every member, and Details. There is a plus to add a member, and a member opens their card (photo, number, dues, payments, renew, change, edit, auto-renew, end).
   - Add a member: photo, name, email and phone, an auto member number, and payment by Card reader, Cash or Type a card (Stripe's own fields). They are a member only once paid.
   - The membership setup runs Name and colour → Payment (yearly or one time, optional initiation fee, length) → Booking and rates (the public window or further ahead; rates against the course's own price list, blank = public and 0 = free, or % off).
   - The season-pass setup runs Name and colour → Price and dates (buy online and/or at the course) → What it gives (price list per round, booking window).
   - Tiles, step bar, normal-size fields, Cancel and Back as plain links.
   - Import and reminders move to each membership's page. (No joining-online requests: Join online is gone, GOLFER-SIGNIN-RETIRED, Cam via Build 2026-11-18.)
   - Wire only what Build's data supports; hide the rest, never fake it.
   - No guest passes (GUEST-PASS-OFF, Cam 2026-11-24): the mockup's "Guest passes a year" field and guest-pass perks are not built. "Guests pay the member rate" stays.
3. **Events — APPROVED, build it** (Cam 2026-11-17, "events is good"). Mockup `lanes/dashboard/events-mockup.html` (https://claude.ai/artifact/BVqXkiviwzu8ktCdyNNR9H) is the spec, in both looks. All of Cam's comment threads on that artifact are part of the spec.
   - **Lists the course edits.** Every built-in list on the page can be extended by the course (plus) and edited or removed (pencil, popup).
   - **Who builds the roster.** In outing setup it's one choice: the organizer gives the list OR players add themselves (radio, never both).
   - **Terms step.** One dropdown per case (deposit, balance, group cancels, course cancels, rain), with real presets. The chosen preset is what refunds and Cancel event actually DO, and golfer wording comes from describePolicy(). "Write your own" adds the course's own note beside it, labelled as theirs; it never replaces the rule.
   - **Sign-up questions** are an "Add question" builder: text, answer type, required. Name, email and phone are always asked.
   - **Option tiles** span the card width.
   - **Build first:**
     - Event terms need the same legal review as the agreements before golfers accept them.
     - Automatic reminder texts go only to golfers who agreed to texts (`sendSms()`).
     - The event-day timeline, food count and rain plan need new fields.
     Wire only what the data supports, hide the rest, never fake it.
4. **Schedule — APPROVED, build it** (Cam 2026-11-16, "that real nice just fix the one comment i made and then ur good"). Mockup `lanes/dashboard/schedule-mockup.html` (https://claude.ai/artifact/ANSdTS9cjrJwxsQ1TLFynU) is the spec, in both looks. Page `/dashboard/schedules`; the tabs slide and come in this order:
   - **Bookable rounds** comes first. It lists the rounds the course sells, each with its holes (1–18, 1–9, 10–18) and a time bar showing when it can be booked. A pencil opens an edit popup, which also holds "Stop selling this round", and a bare plus adds a round. Rounds that aren't sold are not listed, and there's no hour scale under the bars.
   - **Hours and prices** has Weekdays and Weekends only, never an Every-day set that overlaps them. Each set's line says what it does: days, first and last tee, gap, twilight start. The round picker matches Bookable rounds. Price columns are named by time of day ("Twilight / After 3:00 PM"), with a Weekday or Weekend tag. Walking allowed is a switch per column. "Add a time-of-day price" opens a popup to name it and pick its start. The plus holds Senior and junior prices and Holidays. Unsaved changes show as a slim pill (Undo, Review and save), and saving shows what changes and that booked rounds keep their price.
   - **Promotions** (was Deals) lists live codes with the columns Code, Promo, Duration, Used and a pencil. Ended codes sit under a small "Past promos" toggle, each with "Use again". New and Edit open popups. Last-minute deals are removed from this page.
   - **Demand pricing** has an explainer bubble at the top. Until the course has 3 months of tee times it shows only the locked state: progress and the date it unlocks. Unlocked, it shows why it suggests the prices, the week of prices, floor and ceiling, and a terms checkbox. Demand prices show wherever the price does; members and residents keep their own rates.
   - **Closed days** is a month calendar. Green means golfers can book that day now, red means closed, and a closed day shows the reason. Tapping a day opens a popup to close it, with a warning if golfers are booked (they stay booked), or to open it again. There's no side list.
   - **Per-round rules** (Cam 2026-11-16: "when editing it it all is together"): fewest players, most players and public days ahead for each round go in that round's edit popup on Bookable rounds, next to its holes and booking window. Then the Booking rules tab goes.
   - **Booking rules** is removed from Schedule, because it lives in Settings. Anything on it that Settings lacks moves to Settings, not lost.
   - **Build first, before the page wires it:**
     - The demand engine (`src/lib/demand-pricing.ts`) unlocks at 28 days of data, but Cam wants 3 months.
     - The demand terms need a new agreement version and counsel. Until then the page shows the locked state only.
     - Removing last-minute deals from the UI needs Build to decide what happens to deals already running. Never leave a live deal no one can see.
     - Wire only what the data supports; hide the rest, never fake it.
5. **Analytics — APPROVED, build it** (Cam 2026-11-17, "analytics is good to go"). Mockup `lanes/dashboard/analytics-mockup.html` (https://claude.ai/artifact/Af1CzqBo6W2DcXke7u3C9V) is the spec, in both looks.
   - **The page.** A snapshot of the last month, worded in the past tense, with the period beside the title. The header icons (date, filter, download) are bare, with no boxes. The tabs, which slide, are Tee sheet, Bookings, Golfers, No-shows, Pro shop and Reviews. Each number appears in exactly one place, and money lives on Revenue (a quiet link there).
   - **Figures.** Every figure row has one-line labels and its numbers on the same line. Money lost shows red with a minus, recovered shows green with a plus, and there's a Net figure; colour is used nowhere else.
   - **Removed by Cam.** "First-timers who came back" (unfair at the end of a month) and "Missed more than once" are gone. The Golfers row has three numbers.
   - **No-shows tab.** "When they cancelled" shows the spots filled again by how far ahead the golfer cancelled (7+ days, 2–7 days, 24–48 hours, under 24 hours), with the line tying it to the course's late-cancel cutoff.
   - **Where the numbers come from.** Every money number comes from the ledger (`src/lib/money-ledger.ts` views), the same as Revenue, never from `lib/analytics.ts` money sums, so the two pages can't disagree.
   - **Data Build must add first:**
     - projections for the next 30 days against the last 30
     - no-shows by how they booked
     - spots filled again by cancel lead time: a spot counts as refilled when the same tee time gets a new booking after the cancel
     - pro shop stock value
     - the written monthly reports, with a PDF download
     Wire only what Build's data supports, hide the rest, and never fake a number.
6. **Settings — APPROVED, build it** (Cam 2026-11-17, "fix settings messages and then good to go"). Mockup `lanes/dashboard/settings-mockup.html` (https://claude.ai/artifact/SMcWgq9LQ18y8rWLr6sGBR) and all its comment threads are the spec, in both looks.
   - **The home** lists four areas as cards with no icons inside: Your course, Booking, Payments, Your account. Search sits in the header as a small icon. Each area has a one-line intro under its title, and a section sidebar down the side on desktop (a horizontal bar on a phone).
   - **Groups** have short, direct names: Name and location, Booking Page, Facilities, Booking rules, Carts, and so on.
   - **Editing.** Every editable row opens its own small popup; read-only rows don't look clickable.
   - **Confirmation email** (was "What golfers are told") shows a live preview of the email. The course edits only its own parts (arrival, dress code, parking, a note, contact). The policy wording comes from describePolicy() ("From your cancellation policy · Change"). There is a "Send me a test" link.
   - **Sales tax** shows "set from your address in <state>", with Change.
   - **At the counter.** Takes cash, and card readers with an online/offline StatusDot, last seen, Test reader and what to do when offline. Readers are tested for real in the build.
   - **Moved out of Settings.**
     - **Staff** move to a new Team page under Business; its mockup is coming. Until Team is built, keep the existing staff screen reachable, never lose it.
     - **Per-round rules** are on Schedule.
     - **Member and resident price switches** are not on this page (Memberships owns rates). Removing the switches themselves is a separate Build decision; ask Cam.
7. **Course alert — APPROVED, build after the Dashboard lane's open PRs** (Cam 2026-11-17, "course alert is good when those comments are fixed"). Mockup `lanes/dashboard/alert-mockup.html` (https://claude.ai/artifact/Agm6uJR2Z7ARcqRUkFyr6y) and its threads are the spec. Course alert becomes a page.
   - **Left column.** The live alert, with a preview of what golfers see. Editing opens a popup without quick starts. It can tell golfers booked today: email to everyone, and text only to golfers who agreed (sendSms).
   - **Right column: course conditions, in depth.** Course status, carts, greens, pins, range, wetness, temporary rules. Each shows who updated it and when, and the course can add its own conditions and delete any.
   - **Bad weather.** "Delayed start" (was Frost delay) asks why: frost, fog, wet course or other. "Close for weather" is a four-step walkthrough that previews every group's new time, or what each group gets back under the cancellation policy, before anything moves. Close needs a checkbox before the final button.
   - **Past alerts** sit in a dropdown.
   - **Build first.** Delayed start and Close for weather MUST run through the tee sheet's existing server code (frost-delay, weather-cancel), not a second copy. Conditions (add/delete, extra fields) and past alerts need data.
8. **Team — APPROVED** (Cam 2026-11-17, "we are all good"). Mockup `lanes/dashboard/team-mockup.html` (https://claude.ai/artifact/L2SZ76WpfdZMx4krCiubf1) and its threads are the spec. Team is a new rail item under Business.
   - **One view:** roles in rank order, each with its people listed under it as compact rows.
   - **A new course starts with only Owner,** plus Suggested roles the owner can add (never pre-created).
   - **A Roles tab** sets what each role can access, through about six access areas, each No access / View / Full, with the individual switches under Advanced (Cam: "less buttons"). A mixed set shows as "Custom". Giving View or Full on an area that moves money lists those keys and asks for confirmation; nothing is granted silently. A person's own page adjusts their access too.
   - **Invite** asks for name, email and an optional phone, and sends a full welcome email.
   - **Reset password** emails a link (no temporary password).
   - **Build adds:** editable roles, invite by email, reset links, last active.
   - **Challenge noted for review:** a role edit changes everyone in it, so the role editor must say how many people it affects before saving.

9. **Settings: golfer log-in, alerts, range balls — APPROVED** (Cam 2026-11-18, "after all those comments are fixed we
   are good to merge that"). Dashboard screens of `lanes/golfer/login-alerts-mockup.html`. Each is one switch with one
   line, in both looks, and nothing else.
   - **"Show Log in on your booking page"**: the line is built from what the course offers, e.g. "Lets your members
     and residents log in online to get their rates and booking window." It links to "Groups and benefits are set in
     Memberships." Groups are NOT repeated here.
   - **"Let golfers set tee time alerts"**: "Golfers can ask to be emailed (or texted, if they agree) when a tee time
     opens on a day they pick, right from your booking page. First come, first served; nothing is held."
   - **"Sell range balls with tee times"**: "Golfers can add a bucket when they book. Buckets and prices come from
     your Range settings."
   - The Join online and Residents-copy follow-ups are under Small follow-ups (GOLFER-SIGNIN-RETIRED).

## Small follow-ups (do with the next PR that touches the file)
- **Join online is gone (GOLFER-SIGNIN-RETIRED, Cam via Build 2026-11-18; golfers buy memberships from the course, which adds them).** Golfers can no longer join online, so: remove the "Join online" / "Ask to join" tiles and their hint ("Golfers pay online and are members as soon as it's paid") from `src/components/dashboard/members/MembershipSetup.tsx` and default a new membership to `joinOnline: 'off'`; remove the "Joining" row on `src/app/dashboard/members/page.tsx`. `MembershipTier.joinOnline` stays in the schema. Build then makes `/api/operator/tiers` store `'off'` and drops the dead `joinTier` / `joinableTiers` / `myMembership` helpers in `src/lib/membership-join.ts`.
- **Residents card copy (GOLFER-SIGNIN-RETIRED).** "a golfer signed in with a listed email books at the resident rate" is now true only for a golfer signed in to the course as a member; a resident who isn't a member gets the rate at the counter until the "Log in" build.
- Takes cash follow-ups (#458): hide cash buttons when `Course.takesCash` is off and handle `{ cashOff: true }` on the 409s; tell staff why the switch is disabled (owner only); let staff sell by card at the Register without opening the drawer first; the stale "display only" comment in `home/page.tsx`; delete the unused `TakesCashToggle.tsx`.
- `StockTab` side card goes solid at lg after a tap: use `max-lg:fixed max-lg:inset-0`.
