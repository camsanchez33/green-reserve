# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-11-10 23:36 UTC · branch `claude/walkthrough-2-prioritization-ui5xyu` · HEAD `6b4f9bd6` · working tree **12 dirty file(s)**

## ⚠ Drift — git and the queue disagree

`RUN_QUEUE.md` was last committed **2026-10-31**. 198 commit(s) since then are not mentioned anywhere in it:

| commit | date | subject |
|---|---|---|
| `8546021e` | 2026-11-10 | Lanes: four build lanes, one merge queue, effort per worker (#358) |
| `38567aa6` | 2026-11-10 | Testing lane: a course's first day — findings report (#359) |
| `55ae3814` | 2026-11-10 | Homepage writing: true to what ships today (#357) |
| `2b439771` | 2026-11-10 | Lanes, review: sign-in and money routes stay with Build; the admin phone CSS lands with the Admin sidebar PR |
| `c14fb38e` | 2026-11-10 | Lanes: four build lanes, one merge queue, worker effort levels; admin content full width on phones |
| `3c6464b6` | 2026-11-10 | Security lane: full sweep report 2026-11-10 (#354) |
| `807abc12` | 2026-11-10 | Front desk sees what each group owes; member sign-in link rate-limited; lanes (#356) |
| `0704cbb6` | 2026-11-10 | company: Nov 30 outreach kit (drafts) (#355) |
| `3f552007` | 2026-11-10 | STRESS-1110 #1, review: paid shop items stay behind money.payments; decisions from the security sweep |
| `26c63493` | 2026-11-10 | Member sign-in link: rate-limited, and the same answer for members and non-members |
| `64b7ad04` | 2026-11-10 | STRESS-1110 #1: front desk sees what each group owes; lanes for parallel work |
| `56d3f877` | 2026-11-10 | IMPORT-2: pro shop import reads real POS files and says what it couldn't (#353) |
| `48c91709` | 2026-11-10 | IMPORT-2: the pro shop import reads real POS files and says what it couldn't |
| `cb7a92cf` | 2026-11-10 | Tee sheet + Home: fixes from the stress test (#352) |
| `f4f4057e` | 2026-11-10 | Golfer pay page: hide the saved card only after a definite decline |
| `53857cdc` | 2026-11-10 | Stress fixes, review: sheet keeps re-reading during checkout; Home Retry clears; a declined card gets a new-card pay page |
| `dcaec7c7` | 2026-11-10 | Tee sheet + Home stress-test fixes: phone width, live Home, quiet re-reads, declined pay link, clearer cash |
| `dea6f5b4` | 2026-11-09 | CART-5: the receipt says the cart is paid; no cart ticket, no cart number (#351) |
| `a47a7025` | 2026-11-09 | CART-5: the receipt says the cart is paid; no cart ticket, no cart number |
| `ba4de30f` | 2026-11-09 | AUDIT-1109: close two register gaps; no silent failures in tonight's pages (#350) |
| `3ffa5f8f` | 2026-11-09 | AUDIT-1109: update two source pins for the new register gate and the Register's key |
| `74f02e7c` | 2026-11-09 | AUDIT-1109: close two register gaps; no silent failures in tonight's pages |
| `de83521b` | 2026-11-09 | EVENTS-2 + SCHED-2: event walk-through and guided event page; Schedule in tabs (#349) |
| `c40ae5e7` | 2026-11-09 | SCHED-2: Schedule in tabs, days adjusted like memberships, demand pricing explained |
| `9713a9b6` | 2026-11-09 | EVENTS-2: event setup walk-through and a guided event page |
| `7b62a972` | 2026-11-09 | MONEY-1: Money tab from Cam's notes (#348) |
| `3932b9fc` | 2026-11-09 | MONEY-1: Money tab from Cam's notes |
| `bd16e6d6` | 2026-11-09 | RECEIPT-3 + MSG-1: receipts you can see and text as a link; Messages from Cam's notes (#347) |
| `2981ca95` | 2026-11-09 | RECEIPT-3 + MSG-1: receipts staff can see and text as a link; Messages from Cam's notes |
| `69eb6ce5` | 2026-11-09 | DRAWER-1 + CART-4: the register is a loop; cart numbers, cart ticket, starter's sheet (#346) |
| `62742a74` | 2026-11-09 | Regenerate code map and status board |
| `ae63a885` | 2026-11-09 | DRAWER-1: open/reopen/fix take their seq from the snapshot checked (CI race) |
| `79c3f826` | 2026-11-09 | DRAWER-1 + CART-4: the register is a loop; cart numbers, cart ticket, starter's sheet |
| `84ccc1ed` | 2026-11-09 | CART-3: riders and range balls at checkout (#345) |
| `29496778` | 2026-11-09 | CART-3: riders and range balls at checkout (Riding − N +, buckets − N +) |
| `235630c1` | 2026-11-08 | POS-8: Stock list + one item form, upload what you have, sell anyway, Sales cleanup (#344) |
| `3d31bc28` | 2026-11-09 | POS-8: Stock list + one item form, upload what you have, sell anyway, Sales cleanup |
| `44217555` | 2026-11-08 | POS-7: Open the register (locked starting cash), tee sheet icons, sliding tabs (#343) |
| `9b6e7f6b` | 2026-11-09 | POS-7: Open the register (locked starting cash), tee sheet icons, sliding tabs |
| `4a51c27b` | 2026-11-08 | POS-6: Stock is where items are added; round packs off; tiles, ticket, Sales filters (#342) |
| `def61397` | 2026-11-09 | POS-6: Stock is where items are added; round packs off; tiles, ticket, Sales filters |
| `0682ac62` | 2026-11-08 | POS-5: Pro shop Stock, Round packs and Close out tabs; sliding tab highlight (#340) |
| `b99b4c8a` | 2026-11-08 | POS-5: Pro shop Stock, Round packs and Close out as their own tabs; sliding tab highlight |
| `b8512431` | 2026-11-08 | ACC-1: every booking and payment figure agrees across the site (#339) |
| `260583c3` | 2026-11-08 | ACC-1: one set of definitions so every booking and payment figure agrees |
| `437456cc` | 2026-11-08 | POS-4: Pro shop register as a real POS (#338) |
| `f4cc7d76` | 2026-11-08 | POS-4: Pro shop register as a real POS — tiles, one ticket, Charge in steps |
| `63efbf69` | 2026-11-08 | SEATS-1: close seats on a tee time one at a time (#337) |
| `ab8c4f43` | 2026-11-08 | SEATS-1: close seats on a tee time one at a time (Open seats − N + on the card) |
| `b324c547` | 2026-11-08 | Receipt: what was actually paid, how and when; prints on a receipt printer (#336) |
| `d26d15c1` | 2026-11-08 | Receipt: what was actually paid, how and when; prints on a receipt printer |
| `d6083d50` | 2026-11-08 | Time card: reader charges who's here, receipts, day actions in the sheet bar (#335) |
| `480f7d0e` | 2026-11-08 | Time card: the reader charges who's here, receipts, day actions in the sheet bar |
| `086b9403` | 2026-11-08 | Tee sheet: check-in in order — who's here, add to order, payment, done (#334) |
| `f7245efa` | 2026-11-08 | Fix the split-booking pin for the check-in steps' rest line |
| `506f38f0` | 2026-11-08 | Tee sheet: check-in in order — who's here, add to order, payment, done |
| `8bed0df0` | 2026-11-06 | Tee sheet time card: who can book the open seats, reader on the card, type a card (#333) |
| `23a4f354` | 2026-11-06 | Tee sheet time card: who can book the open seats, the reader on the card, type a card |
| `de19b14e` | 2026-11-06 | Carts: per player or per cart (2 riders), set in Settings (#332) |
| `fe626db0` | 2026-11-06 | Carts: per player or per cart (2 riders), set by the owner in Settings |
| `ba23e030` | 2026-11-06 | Tee sheet: a Square-style Charge screen, and one "Paying now" control (#331) |
| `d9f007fa` | 2026-11-06 | Tee sheet: a Square-style Charge screen, and one "Paying now" control |
| `54cc0d80` | 2026-11-05 | Tee sheet: the group card asks how they're paying, then one button that says what it does (#330) |
| `bd10ddf4` | 2026-11-06 | Tee sheet: the group card asks how they're paying, then one button that says what it does |
| `337e9a0a` | 2026-11-05 | Tee sheet: Message golfers by email, text or both, with ready-made messages and a preview (#329) |
| `e616bb78` | 2026-11-06 | Regenerate the code map and status board |
| `2e16380b` | 2026-11-06 | Owner 2FA: match a code and its step on one clock |
| `c146bfe6` | 2026-11-06 | Tee sheet: Message golfers by email, text or both, with ready-made messages and a preview |
| `2bea8fe8` | 2026-11-05 | Tee sheet: a cleaner weather window that updates as you pick the times (#328) |
| `97875d10` | 2026-11-06 | Tee sheet: a cleaner weather window that updates as you pick the times |
| `e2a8f2f7` | 2026-11-05 | Tee sheet: Add tee time from the day's prices, keep a time for staff, safer Block and Delete (#327) |
| `60b0470c` | 2026-11-06 | Test: the engine's delete pin includes the staff-only guard |
| `ff613483` | 2026-11-06 | Tee sheet: Add tee time from the day's prices, keep a time for staff, safer Block and Delete |
| `c5f4ba4b` | 2026-11-05 | Tee sheet: On the course, a fuller List, a Calendar that says why (#326) |
| `f8d6b25b` | 2026-11-06 | Tee sheet: On the course, a List with the grid's details, a Calendar that says why |
| `be8b68ee` | 2026-11-05 | Home: the week-ahead link offers demand pricing and lands on it (#325) |
| `58a9e0d0` | 2026-11-06 | Home: the week-ahead link offers demand pricing and lands on it |
| `b9baa354` | 2026-11-05 | Tee sheet: cleaner top bar, Times booked, filled groups, 9-hole/twilight labels, no glow (#324) |
| `52978014` | 2026-11-06 | Tee sheet: cleaner top bar, Times booked, filled groups with In/M/R, 9-hole and twilight labels, no glow |
| `91764419` | 2026-11-05 | Public SMS consent page at /sms-consent for Twilio's checker (#323) |
| `41e8a0af` | 2026-11-06 | Public SMS consent page at /sms-consent for Twilio's checker |
| `b147abf7` | 2026-11-05 | Host the SMS consent screenshot at /sms-opt-in.png for Twilio (#322) |
| `9db7e811` | 2026-11-06 | Host the SMS consent screenshot at /sms-opt-in.png for Twilio |
| `92afb06e` | 2026-11-05 | Home: goals on the numbers the course picks, and its own course-condition lines (#321) |
| `8ec892ce` | 2026-11-05 | Home: goals on the numbers the course picks, and its own course-condition lines |
| `e14b7752` | 2026-11-05 | Home: weather + next tee times on top, field-level setup links, Needs you counts, Staff notes (#320) |
| `a5bb5088` | 2026-11-05 | Home: weather and next tee times on top, field-level setup links, Needs you counts, Staff notes |
| `901ba99b` | 2026-11-05 | Text-message opt-in names GreenReserve as the sender (Twilio campaign review) (#319) |
| `d12656c7` | 2026-11-05 | Text-message opt-in names GreenReserve as the sender, with the carriers' disclosure phrases; texts lead with GreenReserve |
| `211403ca` | 2026-11-05 | Terms and Privacy: Twilio A2P campaign wording (#318) |
| `acd00f57` | 2026-11-05 | Terms and Privacy: Twilio A2P campaign wording (SMS Terms heading, no selling or sharing opt-in data) |
| `d43ed864` | 2026-11-04 | Database audit: crons read only due dates, Stripe-id indexes, rate-limit sweep (#317) |
| `ba4df316` | 2026-11-05 | Database load from the audit: crons read only due tee dates, Stripe-id indexes, rate-limit sweep, sheet money strip asks less |
| `15c9cb2e` | 2026-11-04 | Security audit: money races (keyed refunds, recharge after refund, holds vs check-in, no-show vs still coming) (#316) |
| `37df560b` | 2026-11-05 | Regenerate the code map and status board for lib/hold-key.ts |
| `7cc238df` | 2026-11-05 | Money races from the security audit: keyed refunds, recharge after refund, cron hold vs check-in, no-show vs still coming |
| `df7ad5bd` | 2026-11-04 | Security audit: one tee-time row per slot (migration) (#315) |
| `8286cf5a` | 2026-11-05 | Tests: give each test tee time its own slot (one row per slot is now enforced) |
| `ab7235ec` | 2026-11-05 | One tee-time row per slot: fold existing duplicates, unique index, generation skips and never deletes a booked slot |
| `596b4b52` | 2026-11-04 | Security audit: one card charge per round at a time (#314) |
| `5be9c0cf` | 2026-11-05 | One card charge per round at a time: claim the round before charging; cash and the reader refuse a live claim |
| `4c7680ad` | 2026-11-04 | Security audit: sign-in hardening (#313) |
| `bfa71331` | 2026-11-05 | Sign-in hardening from the security audit: US/Canada-only texts, escaped email, exact phone linking, trimmed memberships list |
| `24b7474c` | 2026-11-04 | Settings restyle to the DASH-D mockup (#312) |
| `56471e89` | 2026-11-05 | Settings restyle to the DASH-D mockup: 26px title, section nav as raised tabs, 7px inputs and choice tiles |
| `b558efe3` | 2026-11-04 | Members restyle to the DASH-D mockup (#311) |
| `5e0a462c` | 2026-11-05 | Members restyle to the DASH-D mockup: 26px title, four stat cards with 24px numbers, 7px buttons |
| `e43e8996` | 2026-11-04 | Register restyle to the DASH-D mockup (#310) |
| `b36fe621` | 2026-11-05 | Register restyle to the DASH-D mockup: segmented tabs, tiles, steppers, total, pay tiles |
| `dfcf2b74` | 2026-11-04 | Analytics: golfer groups — regulars, new, at risk, inactive (SEG-1) (#309) |
| `537fb89a` | 2026-11-05 | SEG-1 review fix: golfer contact on Analytics only with See golfer email and phone |
| `241549e9` | 2026-11-05 | Analytics: golfer groups — regulars, new, at risk, inactive (SEG-1) |
| `3bf3f7fa` | 2026-11-04 | Events: command center strip and organizer bill coverage (EVENTS-1) (#308) |
| `4c554dc8` | 2026-11-04 | EVENTS-1 review fix: name players past the confirmed headcount instead of hiding them |
| `fed27d5f` | 2026-11-04 | Events: command center strip and organizer bill coverage per player (EVENTS-1) |
| `f75dd615` | 2026-11-04 | Money: earned vs paid out on the Ledger (EARNED-1) (#307) |
| `533f74d5` | 2026-11-04 | EARNED-1 review fixes: payout arrival day, one minus sign, per-day filter, keyboard detail |
| `3e901199` | 2026-11-04 | EARNED-1: CLAUDE.md wording |
| `3b06f8d3` | 2026-11-04 | Money: earned vs paid out on the Ledger (EARNED-1) |
| `ddeaa003` | 2026-11-04 | Tee sheet: 1st and 10th tee side by side; Schedule: prices as one table (#306) |
| `56fffcae` | 2026-11-04 | TEES-1 / PRICES-1 review fixes: same-tee times stack, nine order; one rename field, every price change shown |
| `988566c5` | 2026-11-04 | Schedule: prices as one table, rounds side by side (PRICES-1) |
| `497612df` | 2026-11-04 | Tee sheet: 1st and 10th tee side by side (TEES-1) |
| `80935727` | 2026-11-03 | Partial check-in keeps the rest of the group booked (PARTIAL-1) (#305) |
| `c4ee41dd` | 2026-11-04 | PARTIAL-1: split parts are not new bookings on Analytics |
| `d88474dc` | 2026-11-04 | PARTIAL-1 review fixes: split parts off Admin Home counts, confirms quote the card's figure |
| `fce72d26` | 2026-11-04 | Partial check-in keeps the rest of the group booked (PARTIAL-1) |
| `327461ef` | 2026-11-03 | Glass that actually shows, and a cleaner group-card checkout (#304) |
| `5fb78584` | 2026-11-04 | Status board |
| `b689a296` | 2026-11-04 | Glass: soften the glow a step and move the second one low right, darker light text and lighter dark text, so every token clears 4.5:1 on cards and on the bare page |
| `38ea94b2` | 2026-11-04 | Group card checkout: + adds on first tap, − says when it removes several, exact SKU scan, no reader promised where none is, tests |
| `2ab4d6b2` | 2026-11-04 | Group card checkout: party size behind Edit group, the card reader always shown with its reason, register-style tiles for shop items |
| `c472b412` | 2026-11-04 | Glass: let the glow through the page layer, stronger glow and clearer cards, darker text tokens so it stays readable |
| `e54302c2` | 2026-11-03 | Booking: a stale golfer sign-in books as a guest instead of crashing (#303) |
| `3298d526` | 2026-11-04 | Booking: a golfer signed in to an account that no longer exists books as a guest instead of crashing |
| `9aea09cc` | 2026-11-03 | Tee sheet views: Grid, List and Calendar (#302) |
| `9652f9f5` | 2026-11-03 | Tee sheet views: say the shown state to screen readers, no price on checked-in lines, calendar follows the day stepper |
| `659066c6` | 2026-11-03 | Tee sheet views: Grid, List and Calendar |
| `aec2961f` | 2026-11-02 | Glass dashboard: green glow, frosted cards and rail, tab lifts on hover (#301) |
| `f45e3113` | 2026-11-03 | Glass: keep pop-up panels solid and darken faint text so both clear AA |
| `52abf641` | 2026-11-03 | Glass dashboard: green glow behind the page, frosted cards and rail, tab lifts on hover |
| `66238486` | 2026-11-02 | Accuracy pass: plain Analytics definitions and one stock wording (#300) |
| `d2052372` | 2026-11-02 | Accuracy pass: plain Analytics definitions, sold-out dates in the download, one stock wording |
| `e83ec9db` | 2026-11-02 | Tee sheet: pay separately — split players off a group and pay their share (#299) |
| `5cfea0f0` | 2026-11-02 | Regenerate code map and status board |
| `7458886d` | 2026-11-02 | Pay separately: give back the leavers' share of a hold already taken |
| `f3ad66bb` | 2026-11-02 | Tee sheet: pay separately — split players off a group and pay their share |
| `90f8f79d` | 2026-11-02 | Dashboard: "/" or Cmd/Ctrl K jumps to golfer search; Home flags stale conditions (#298) |
| `06d5e4c6` | 2026-11-02 | Dashboard: / or Ctrl/Cmd K jumps to golfer search; Home says when conditions are off the booking page |
| `2aa723d8` | 2026-11-02 | Booking page: today's course conditions while fresh (#297) |
| `449bd296` | 2026-11-02 | Booking page: today's course conditions (carts, range, greens, pins) while fresh |
| `360913a3` | 2026-11-02 | Register: item photos on the tiles (+ Home review follow-ups) (#296) |
| `b04c0c83` | 2026-11-02 | Register: item photos on the tiles (+ Home review follow-ups) |
| `0394ca3b` | 2026-11-02 | Home: shift note, course conditions, week ahead, month vs goal (#295) |
| `7de2b772` | 2026-11-02 | operator-home test: accept the money permission read once and passed to operatorHome |
| `61cb526c` | 2026-11-02 | Home: shift note, course conditions, week ahead, month vs goal |
| `0ca08896` | 2026-11-02 | Tee sheet: till-style check-in on the time card (#294) |
| `383b5af1` | 2026-11-02 | Regenerate code map and status board |
| `1b7f3b82` | 2026-11-02 | Tests follow the till: Here-now buttons, pay-link day rule, owed amount as the ticket Total |
| `d65d1332` | 2026-11-02 | Tee sheet: till-style check-in on the time card |
| `bbcc7c63` | 2026-11-02 | Dashboard foundation: Geist, grey page + white panels, grouped rail, Light/Dark (#293) |
| `ba7d3ab1` | 2026-11-02 | Regenerate code map and status board |
| `14d6254a` | 2026-11-02 | Dark mode is screen-only (prints stay light); theme cookie Secure only over https |
| `7ca659d0` | 2026-11-02 | Rail groups never drop a tab; tests follow the grouped rail and the mem-fill token |
| `46a688fc` | 2026-11-02 | Dashboard foundation: Geist, grey page + white panels, grouped rail, Light/Dark |
| `3ae2293d` | 2026-11-02 | Pricing switches + busy-season data + speed + counter fixes + SMS opt-in (Twilio) (#289) |
| `3659755c` | 2026-11-02 | SMS-1 follow-up: Home / Money declined cards ask before texting, like the tee sheet |
| `bffab6e9` | 2026-11-02 | Event money needs "Mark paid at the counter"; a member with history can't be deleted |
| `53e31df1` | 2026-11-02 | Counter friction B: card beside the sheet, Home opens a time's card, member opens golfer record, cash through a failed tax quote |
| `b80496f3` | 2026-11-02 | SMS-1: texts only to numbers that agreed (Twilio A2P 10DLC opt-in) |
| `db252e4b` | 2026-11-02 | Status board refresh |
| `b199995d` | 2026-11-02 | Counter friction: one-tap check-in, no-show waits 10 min, cart off by default, search on phones |
| `45ca1d0e` | 2026-11-02 | Speed with volume: one time-zone formatter per zone (Analytics 90 days 10.7s → 1.2s) |
| `4054bff4` | 2026-11-02 | Test course: busy-season sample data, with every money table filled |
| `91745c5a` | 2026-11-01 | member-portal-price test: its course has member prices, so the switches are on |
| `96cd687f` | 2026-11-01 | Pricing switches: Members / Residents off means the public price (backfill + auto-on) |
| `1db52953` | 2026-11-01 | Audit wording: what the sheet, members, settings and golfer page say, made true (#288) |
| `93f3ff63` | 2026-11-01 | Audit wording: what the sheet, members, settings and golfer page say, made true |
| `b5d27f01` | 2026-11-01 | Audit numbers: partial refunds, event money, event player swap, shop today, payout tile (#287) |
| `c6efa694` | 2026-11-01 | Audit numbers: partial refunds, event money, event player swap, shop today, payout tile |
| `10ab79d8` | 2026-11-01 | DENSE-10 Settings part 2: the Settings cards, labels over sentences (#286) |
| `6bbb7c6d` | 2026-11-01 | DENSE-10 Settings part 2: the Settings cards, labels over sentences |
| `bda21776` | 2026-11-01 | DENSE-10 Settings part 1: labels over sentences (#285) |
| `e4bc0f02` | 2026-11-01 | DENSE-10 Settings part 1: labels over sentences |
| `6d571671` | 2026-11-01 | DENSE-9 Messages: the intro is the reply-time line and the email (#284) |
| `d74792b2` | 2026-11-01 | DENSE-9 Messages: the intro is the reply-time line and the email |
| `fe34fcb1` | 2026-11-01 | DENSE-8 Events: the list is a table with what each event still owes (#283) |
| `1bbbbbc8` | 2026-11-01 | DENSE-8 Events: the list is a table with what each event still owes |
| `286a3d44` | 2026-11-01 | DENSE-7 Pro shop: labels over sentences (text only) (#282) |
| `06c09849` | 2026-11-01 | DENSE-7 Pro shop: labels over sentences (text only) |
| `4274c1a6` | 2026-11-01 | DENSE-6 Schedule: labels over sentences (#281) |
| `3ee7b212` | 2026-11-01 | DENSE-6 Schedule: labels over sentences |
| `a59c32eb` | 2026-10-31 | Audit cleanups: ledger guard + Stripe's fee, Return items retries returns only, admin actions confirm (#280) |
| `20f25179` | 2026-11-01 | Audit cleanups: ledger guard sees statement and renewal charges, ledger takes Stripe's fee, Return items retries returns only, admin actions confirm |
| `f353d52a` | 2026-10-31 | Security follow-ups: once-per-golfer promo codes, contact details behind their permission, paused membership blocks online join (#279) |
| `5db27c7b` | 2026-11-01 | Security follow-ups: once-per-golfer promo codes hold, contact details stay behind their permission, a paused membership stops joining online |
| `46be1bc6` | 2026-10-31 | Money audit fixes: dues total pinned, term change stops auto-renew, credited round returns our fee, pay link on the day (#278) |
| `efef5f62` | 2026-11-01 | Money audit fixes: dues charge only the shown total, tier term change stops auto-renew, credited round returns our fee, pay link opens on the day |

**Meaning:** work shipped that the queue does not know about. Either record the run, or check the box.

### Uncommitted working tree (12 file(s))

- `M .claude/agents/admin-ux-auditor.md`
- `M .claude/agents/design-auditor.md`
- `M .claude/agents/final-reviewer.md`
- `M .claude/agents/spec-conformance.md`
- `M CLAUDE.md`
- `M LANES.md`
- `M scripts/policy-wording-test.ts`
- `M src/lib/cancel-policy.ts`
- `M src/lib/email.ts`
- `?? .claude/agents/check-runner.md`
- `?? .claude/agents/light-reviewer.md`
- `?? lanes/build/`

**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply
the queue header's `git checkout -- .` cleanup until that run has committed, or the work is gone.

## In flight

- **ROADMAP-1 — Cam 2026-10-07: build beyond the tee sheet, AI/BI first. The plan, order and open decisions live in `PLATFORM_ROADMAP_SPEC.md`: BI-1 monthly AI review (BUILT) → ACT-1 move a group → ACT-2 ** — `RUN_QUEUE.md:102`
  - PARTIALLY BUILT — shipped: BI-1 #92, ACT-1 #93, ACT-2 #94, MSG-1 v1 #95, SHEET-2 #97–99, POS-1a #106. Now: POS-1b. After launch: OUT-1, FB-1, PWA-1.

## Built but not signed off

Open checkbox **because the review has not run**, not because the code is missing.
This is the distinction a raw checkbox count gets wrong.

| item | shipped | age | commit | source |
|---|---|---|---|---|
| BUG: orphan banner loops forever — BUILT b88c8bf — CAM: open /admin/courses → acknowledged orphans → Force del | 2026-07-22 | 111d | `b88c8bf3` | `RUN_QUEUE.md:2412` |

## Not started — the actual queue

1. DENSE — Cam 2026-10-27: "too much words on the pages … think OpenTable, Stripe, Lightspeed, Toast … apply across all tabs on both dashboard and admin". Lots of data, almost no sent — `RUN_QUEUE.md:101`
2. WALKS — CAM: live walks before launch (code merged; each needs real Stripe/Resend/phone). — `RUN_QUEUE.md:104`
3. RV-LEDGER — Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checke — `RUN_QUEUE.md:111`
4. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:290`
5. CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:393`
6. SETUP — CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars; verify on /admin/system. Blob and Birdie done. — `RUN_QUEUE.md:3048`

## Waiting on you (not on a build)

- CAM: live walks before launch (code merged — `RUN_QUEUE.md:104`
- Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checked against th — `RUN_QUEUE.md:111`
- Cam: which business address to publish, and confirming the Terms' governing law moves from New Jersey to New York (LLC is NY) — `RUN_QUEUE.md:290`
- CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf course name") to the demo event, so homepage demo inquiries arrive  — `RUN_QUEUE.md:393`
- CAM: open /admin/courses → acknowledged orphans → Force delete DaisyLinks (or fold into the PRELAUNCH purge) Loop fix is code-verified: sweepOrphanCourses skips archived [ORPHAN] c — `RUN_QUEUE.md:2412`
- CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars — `RUN_QUEUE.md:3048`

## Revise campaign (page-by-page pass)

15 pages closed · 7 open. One page in flight at a time.

- A-03 /admin/inquiries/[id] — DETAIL — items 1-7 BUILT (item 1 cbbf1e0, — `REVISE_QUEUE.md:292`
- A-07 /admin/golfers — support lookup — `REVISE_QUEUE.md:554`
- A-08 /admin/messages — threads (Cam 2026-07-23: functionally fine, "just needs to look a little better" — visual notes go to the AESTHETIC PASS; only structural — `REVISE_QUEUE.md:555`
- A-10 /admin/employees — roles, provisioning — `REVISE_QUEUE.md:557`
- A-11 /admin/broadcasts — compose, preview, history — `REVISE_QUEUE.md:558`
- A-12 /admin/create — manual build wizard (in-person tool) — `REVISE_QUEUE.md:559`
- A-13 /admin — `REVISE_QUEUE.md:560`

## Parked, with triggers

- Role-shaped admin (parked 2026-08-26 — TRIGGER: first employee account provisioned)
- Future admin tabs (from brainstorm 2026-07-09 — each has a TRIGGER, don't build early)
- MP-4f — actorName strings onto real rows (parked 2026-10-17 — TRIGGER: after launch, with Cam present for the backfill)
- Golfer course directory /courses (parked — TRIGGER: Cam wants browse/search)
- PB — private-club billing (parked 2026-10-17 — TRIGGER: Cam sets prices AND first private club signs)
- EV-2 — operator analytics reports (parked — TRIGGER: a live operator names the questions)
- Operator 2FA backup codes + staff sessionVersion (parked 2026-10-17 — TRIGGER: after launch, attended migration)

## Ideas — not specced, not queued

- OPERATOR STAFF ACCOUNTS rework (Cam, 2026-07-10: "whole thing is going to be reworked and better") — current section contradicts itself: copy says "full dashboard access", role dropdown says "tee sheet access". Rework ne
- Promo codes / featured placement tools — TRIGGER: marketplace mode ships
- Admin audit log (who changed what, beyond activity feed) — TRIGGER: 2nd real employee with manager+ role
- Disputes / refund-request queue — TRIGGER: first real golfer dispute
- Reviews & reputation — TRIGGER: marketplace mode
- Referral program (course-refers-course) — TRIGGER: 10+ live courses; earlier fit: "founding courses" word-of-mouth
- PRELAUNCH (when go-live nears): scripts/purge-test-data.ts — owner-run purge of test courses + all related records, dry-run mode first, backup before, attended; keeps the payment-history archive guard intact in the app
- MANAGE_BOOKING M3 (update card via token-gated SetupIntent) — SKIPPED 2026-07-08, Cam's call: check-in fresh-card path covers it; revisit if a golfer/course asks
- Remove or keep "No account yet" badge on dashboard members list (GolferAccount linking undecided)
- Outings & tournaments: real models + operator features (dashboard pages are placeholders)
- Marketplace mode: golfer-facing homepage + course directory (when course volume justifies)
- Work email provisioning for employees (Google Workspace — outside the app)
- Product walkthrough video for homepage (SHOW_VIDEO flag ready after public site run)
- Dashboard screenshots → public/screenshots/dashboard-1/2/3.png (Cam captures — retake AFTER Clubhouse sweep)
- Course hero photos: upload flow for course pages (D3 adds the slot)
- Employees → Team & access nav move (from MP-8b)
- calcomUid column / atomic Cal.com dedupe (from CAL-2)

## Spec inventory

`open refs` = how many open queue items still point at this spec. Zero + old = fully consumed.

| spec | open refs | last touched | age |
|---|---|---|---|
| `CLAUDE.md` | 1 | 2026-11-10 | 0d |
| `DENSE_UI_SPEC.md` | 1 | 2026-11-01 | 9d |
| `PLATFORM_ROADMAP_SPEC.md` | 1 | 2026-10-20 | 20d |
| `STRESS_1110_SPEC.md` | 0 | 2026-11-10 | 0d |
| `LAUNCH_PLAN_SPEC.md` | 0 | 2026-11-09 | 1d |
| `STAFF_POLICY_SPEC.md` | 0 | 2026-10-26 | 15d |
| `OPERATOR_REWORK_SPEC.md` | 0 | 2026-10-25 | 16d |
| `ADMIN_V5_SPEC.md` | 0 | 2026-10-23 | 18d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-23 | 18d |
| `AGREEMENT_SPEC.md` | 0 | 2026-10-22 | 19d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-10-22 | 19d |
| `ONBOARDING_SPEC.md` | 0 | 2026-10-22 | 19d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-10-22 | 19d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-10-22 | 19d |
| `RECEIPT_SPEC.md` | 0 | 2026-10-22 | 19d |
| `ADMIN_MASTER_PLAN.md` | 0 | 2026-10-20 | 20d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-10-20 | 20d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-10-20 | 20d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-10-20 | 20d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-10-20 | 20d |
| `ARCHITECTURE.md` | 0 | 2026-10-20 | 20d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-10-20 | 20d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-10-20 | 20d |
| `CODEMAP_SPEC.md` | 0 | 2026-10-20 | 20d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-10-20 | 20d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-10-20 | 20d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-10-20 | 20d |
| `FB2_COPY_SPEC.md` | 0 | 2026-10-20 | 20d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-10-20 | 20d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-10-20 | 20d |
| `GOLFER_SPEC.md` | 0 | 2026-10-20 | 20d |
| `HARDENING_SPEC.md` | 0 | 2026-10-20 | 20d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-10-20 | 20d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-10-20 | 20d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-10-20 | 20d |
| `PRIVATE_BILLING_SPEC.md` | 0 | 2026-10-20 | 20d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-10-20 | 20d |
| `REVIEW_SPEC.md` | 0 | 2026-10-20 | 20d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-10-20 | 20d |
| `UI_REVISE_SPEC.md` | 0 | 2026-10-20 | 20d |

## Recent commits

- `8546021e` 2026-11-10 — Lanes: four build lanes, one merge queue, effort per worker (#358)
- `38567aa6` 2026-11-10 — Testing lane: a course's first day — findings report (#359)
- `55ae3814` 2026-11-10 — Homepage writing: true to what ships today (#357)
- `260602c0` 2026-11-10 — queue/spec update
- `9c71d7a0` 2026-11-10 — queue/spec update
- `2b439771` 2026-11-10 — Lanes, review: sign-in and money routes stay with Build; the admin phone CSS lands with the Admin sidebar PR
- `c14fb38e` 2026-11-10 — Lanes: four build lanes, one merge queue, worker effort levels; admin content full width on phones
- `3c6464b6` 2026-11-10 — Security lane: full sweep report 2026-11-10 (#354)
- `807abc12` 2026-11-10 — Front desk sees what each group owes; member sign-in link rate-limited; lanes (#356)
- `0704cbb6` 2026-11-10 — company: Nov 30 outreach kit (drafts) (#355)
- `1245f673` 2026-11-10 — queue/spec update
- `3f552007` 2026-11-10 — STRESS-1110 #1, review: paid shop items stay behind money.payments; decisions from the security sweep

---

**Totals:** 345 done · 1 awaiting review · 1 in flight · 6 not started · 7 revise pages open · 17 ideas · 7 parked.
