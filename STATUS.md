# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-11-10 23:32 UTC · branch `claude/golfer-manage` · HEAD `ce4e7f8` · working tree **5 dirty file(s)**

## ⚠ Drift — git and the queue disagree

`RUN_QUEUE.md` was last committed **2026-11-03**. 55 commit(s) since then are not mentioned anywhere in it:

| commit | date | subject |
|---|---|---|
| `8546021` | 2026-11-10 | Lanes: four build lanes, one merge queue, effort per worker (#358) |
| `d3e4f9c` | 2026-11-10 | Golfer manage, check-in, receipt: Stripe only for the card form, no dead ends, colour follows meaning |
| `38567aa` | 2026-11-10 | Testing lane: a course's first day — findings report (#359) |
| `55ae381` | 2026-11-10 | Homepage writing: true to what ships today (#357) |
| `3c6464b` | 2026-11-10 | Security lane: full sweep report 2026-11-10 (#354) |
| `807abc1` | 2026-11-10 | Front desk sees what each group owes; member sign-in link rate-limited; lanes (#356) |
| `0704cbb` | 2026-11-10 | company: Nov 30 outreach kit (drafts) (#355) |
| `56d3f87` | 2026-11-10 | IMPORT-2: pro shop import reads real POS files and says what it couldn't (#353) |
| `cb7a92c` | 2026-11-10 | Tee sheet + Home: fixes from the stress test (#352) |
| `dea6f5b` | 2026-11-09 | CART-5: the receipt says the cart is paid; no cart ticket, no cart number (#351) |
| `ba4de30` | 2026-11-09 | AUDIT-1109: close two register gaps; no silent failures in tonight's pages (#350) |
| `de83521` | 2026-11-09 | EVENTS-2 + SCHED-2: event walk-through and guided event page; Schedule in tabs (#349) |
| `7b62a97` | 2026-11-09 | MONEY-1: Money tab from Cam's notes (#348) |
| `bd16e6d` | 2026-11-09 | RECEIPT-3 + MSG-1: receipts you can see and text as a link; Messages from Cam's notes (#347) |
| `69eb6ce` | 2026-11-09 | DRAWER-1 + CART-4: the register is a loop; cart numbers, cart ticket, starter's sheet (#346) |
| `84ccc1e` | 2026-11-09 | CART-3: riders and range balls at checkout (#345) |
| `235630c` | 2026-11-08 | POS-8: Stock list + one item form, upload what you have, sell anyway, Sales cleanup (#344) |
| `4421755` | 2026-11-08 | POS-7: Open the register (locked starting cash), tee sheet icons, sliding tabs (#343) |
| `4a51c27` | 2026-11-08 | POS-6: Stock is where items are added; round packs off; tiles, ticket, Sales filters (#342) |
| `0682ac6` | 2026-11-08 | POS-5: Pro shop Stock, Round packs and Close out tabs; sliding tab highlight (#340) |
| `b851243` | 2026-11-08 | ACC-1: every booking and payment figure agrees across the site (#339) |
| `437456c` | 2026-11-08 | POS-4: Pro shop register as a real POS (#338) |
| `63efbf6` | 2026-11-08 | SEATS-1: close seats on a tee time one at a time (#337) |
| `b324c54` | 2026-11-08 | Receipt: what was actually paid, how and when; prints on a receipt printer (#336) |
| `d6083d5` | 2026-11-08 | Time card: reader charges who's here, receipts, day actions in the sheet bar (#335) |
| `086b940` | 2026-11-08 | Tee sheet: check-in in order — who's here, add to order, payment, done (#334) |
| `8bed0df` | 2026-11-06 | Tee sheet time card: who can book the open seats, reader on the card, type a card (#333) |
| `de19b14` | 2026-11-06 | Carts: per player or per cart (2 riders), set in Settings (#332) |
| `ba23e03` | 2026-11-06 | Tee sheet: a Square-style Charge screen, and one "Paying now" control (#331) |
| `54cc0d8` | 2026-11-05 | Tee sheet: the group card asks how they're paying, then one button that says what it does (#330) |
| `337e9a0` | 2026-11-05 | Tee sheet: Message golfers by email, text or both, with ready-made messages and a preview (#329) |
| `2bea8fe` | 2026-11-05 | Tee sheet: a cleaner weather window that updates as you pick the times (#328) |
| `e2a8f2f` | 2026-11-05 | Tee sheet: Add tee time from the day's prices, keep a time for staff, safer Block and Delete (#327) |
| `c5f4ba4` | 2026-11-05 | Tee sheet: On the course, a fuller List, a Calendar that says why (#326) |
| `be8b68e` | 2026-11-05 | Home: the week-ahead link offers demand pricing and lands on it (#325) |
| `b9baa35` | 2026-11-05 | Tee sheet: cleaner top bar, Times booked, filled groups, 9-hole/twilight labels, no glow (#324) |
| `9176441` | 2026-11-05 | Public SMS consent page at /sms-consent for Twilio's checker (#323) |
| `b147abf` | 2026-11-05 | Host the SMS consent screenshot at /sms-opt-in.png for Twilio (#322) |
| `92afb06` | 2026-11-05 | Home: goals on the numbers the course picks, and its own course-condition lines (#321) |
| `e14b775` | 2026-11-05 | Home: weather + next tee times on top, field-level setup links, Needs you counts, Staff notes (#320) |
| `901ba99` | 2026-11-05 | Text-message opt-in names GreenReserve as the sender (Twilio campaign review) (#319) |
| `211403c` | 2026-11-05 | Terms and Privacy: Twilio A2P campaign wording (#318) |
| `d43ed86` | 2026-11-04 | Database audit: crons read only due dates, Stripe-id indexes, rate-limit sweep (#317) |
| `15c9cb2` | 2026-11-04 | Security audit: money races (keyed refunds, recharge after refund, holds vs check-in, no-show vs still coming) (#316) |
| `df7ad5b` | 2026-11-04 | Security audit: one tee-time row per slot (migration) (#315) |
| `596b4b5` | 2026-11-04 | Security audit: one card charge per round at a time (#314) |
| `4c7680a` | 2026-11-04 | Security audit: sign-in hardening (#313) |
| `24b7474` | 2026-11-04 | Settings restyle to the DASH-D mockup (#312) |
| `b558efe` | 2026-11-04 | Members restyle to the DASH-D mockup (#311) |
| `e43e899` | 2026-11-04 | Register restyle to the DASH-D mockup (#310) |
| `dfcf2b7` | 2026-11-04 | Analytics: golfer groups — regulars, new, at risk, inactive (SEG-1) (#309) |
| `3bf3f7f` | 2026-11-04 | Events: command center strip and organizer bill coverage (EVENTS-1) (#308) |
| `f75dd61` | 2026-11-04 | Money: earned vs paid out on the Ledger (EARNED-1) (#307) |
| `ddeaa00` | 2026-11-04 | Tee sheet: 1st and 10th tee side by side; Schedule: prices as one table (#306) |
| `8093572` | 2026-11-03 | Partial check-in keeps the rest of the group booked (PARTIAL-1) (#305) |

**Meaning:** work shipped that the queue does not know about. Either record the run, or check the box.

### Uncommitted working tree (5 file(s))

- `M docs/CODEMAP.md`
- `M docs/codemap.json`
- `M scripts/golfer-manage-checkin-test.ts`
- `M src/app/manage/[bookingId]/page.tsx`
- `M src/app/receipt/[bookingId]/page.tsx`

**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply
the queue header's `git checkout -- .` cleanup until that run has committed, or the work is gone.

## In flight

- **ROADMAP-1 — Cam 2026-10-07: build beyond the tee sheet, AI/BI first. The plan, order and open decisions live in `PLATFORM_ROADMAP_SPEC.md`: BI-1 monthly AI review (BUILT) → ACT-1 move a group → ACT-2 ** — `RUN_QUEUE.md:102`
  - PARTIALLY BUILT — shipped: BI-1 #92, ACT-1 #93, ACT-2 #94, MSG-1 v1 #95, SHEET-2 #97–99, POS-1a #106. Now: POS-1b. After launch: OUT-1, FB-1, PWA-1.

## Built but not signed off

Open checkbox **because the review has not run**, not because the code is missing.
This is the distinction a raw checkbox count gets wrong.

Nothing awaiting review.

## Not started — the actual queue

1. DENSE — Cam 2026-10-27: "too much words on the pages … think OpenTable, Stripe, Lightspeed, Toast … apply across all tabs on both dashboard and admin". Lots of data, almost no sent — `RUN_QUEUE.md:101`
2. WALKS — CAM: live walks before launch (code merged; each needs real Stripe/Resend/phone). — `RUN_QUEUE.md:104`
3. RV-LEDGER — Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checke — `RUN_QUEUE.md:111`
4. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:290`
5. CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:393`
6. BUG: orphan banner loops forever — BUILT b88c8bf — CAM: open /admin/courses → acknowledged orphans → Force delete DaisyLinks (or fold into the PRELAUNCH purge) — `RUN_QUEUE.md:2412`
7. SETUP — CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars; verify on /admin/system. Blob and Birdie done. — `RUN_QUEUE.md:3048`

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
| `DENSE_UI_SPEC.md` | 1 | 2026-11-03 | 6d |
| `PLATFORM_ROADMAP_SPEC.md` | 1 | 2026-11-03 | 6d |
| `STRESS_1110_SPEC.md` | 0 | 2026-11-10 | 0d |
| `LAUNCH_PLAN_SPEC.md` | 0 | 2026-11-09 | 1d |
| `ADMIN_MASTER_PLAN.md` | 0 | 2026-11-03 | 6d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-11-03 | 6d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-11-03 | 6d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-11-03 | 6d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-11-03 | 6d |
| `ADMIN_V5_SPEC.md` | 0 | 2026-11-03 | 6d |
| `AGREEMENT_SPEC.md` | 0 | 2026-11-03 | 6d |
| `ARCHITECTURE.md` | 0 | 2026-11-03 | 6d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-11-03 | 6d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-11-03 | 6d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-11-03 | 6d |
| `CODEMAP_SPEC.md` | 0 | 2026-11-03 | 6d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-11-03 | 6d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-11-03 | 6d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-11-03 | 6d |
| `FB2_COPY_SPEC.md` | 0 | 2026-11-03 | 6d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-11-03 | 6d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-11-03 | 6d |
| `GOLFER_SPEC.md` | 0 | 2026-11-03 | 6d |
| `HARDENING_SPEC.md` | 0 | 2026-11-03 | 6d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-11-03 | 6d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-11-03 | 6d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-11-03 | 6d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-11-03 | 6d |
| `ONBOARDING_SPEC.md` | 0 | 2026-11-03 | 6d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-11-03 | 6d |
| `OPERATOR_REWORK_SPEC.md` | 0 | 2026-11-03 | 6d |
| `PRIVATE_BILLING_SPEC.md` | 0 | 2026-11-03 | 6d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-11-03 | 6d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-11-03 | 6d |
| `RECEIPT_SPEC.md` | 0 | 2026-11-03 | 6d |
| `REVIEW_SPEC.md` | 0 | 2026-11-03 | 6d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-11-03 | 6d |
| `STAFF_POLICY_SPEC.md` | 0 | 2026-11-03 | 6d |
| `UI_REVISE_SPEC.md` | 0 | 2026-11-03 | 6d |

## Recent commits

- `8546021` 2026-11-10 — Lanes: four build lanes, one merge queue, effort per worker (#358)
- `d3e4f9c` 2026-11-10 — Golfer manage, check-in, receipt: Stripe only for the card form, no dead ends, colour follows meaning
- `38567aa` 2026-11-10 — Testing lane: a course's first day — findings report (#359)
- `55ae381` 2026-11-10 — Homepage writing: true to what ships today (#357)
- `3c6464b` 2026-11-10 — Security lane: full sweep report 2026-11-10 (#354)
- `807abc1` 2026-11-10 — Front desk sees what each group owes; member sign-in link rate-limited; lanes (#356)
- `0704cbb` 2026-11-10 — company: Nov 30 outreach kit (drafts) (#355)
- `56d3f87` 2026-11-10 — IMPORT-2: pro shop import reads real POS files and says what it couldn't (#353)
- `cb7a92c` 2026-11-10 — Tee sheet + Home: fixes from the stress test (#352)
- `dea6f5b` 2026-11-09 — CART-5: the receipt says the cart is paid; no cart ticket, no cart number (#351)
- `ba4de30` 2026-11-09 — AUDIT-1109: close two register gaps; no silent failures in tonight's pages (#350)
- `de83521` 2026-11-09 — EVENTS-2 + SCHED-2: event walk-through and guided event page; Schedule in tabs (#349)

---

**Totals:** 345 done · 0 awaiting review · 1 in flight · 7 not started · 7 revise pages open · 17 ideas · 7 parked.
