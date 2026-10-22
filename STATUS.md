# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-10-22 21:21 UTC · branch `claude/youthful-keller-rvz1hm` · HEAD `f4bc1a4` · working tree **32 dirty file(s)**

## ⚠ Drift — git and the queue disagree

`RUN_QUEUE.md` was last committed **2026-10-19**. 107 commit(s) since then are not mentioned anywhere in it:

| commit | date | subject |
|---|---|---|
| `f4bc1a4` | 2026-10-22 | Regenerate status board |
| `58642d3` | 2026-10-22 | Regenerate status board and code map |
| `d8306c5` | 2026-10-22 | MAIL-1: a cancellation that refunded money also comes from billing@ |
| `c39a10c` | 2026-10-22 | MAIL-1: a cancellation that kept a fee comes from billing@ |
| `4bd2042` | 2026-10-21 | BRAIN-1b: every email and text logged; course page leads with a Timeline; Sentry test button (#179) |
| `8c73613` | 2026-10-22 | W2-9a: releasing an event's hold checks the day being released, not the day it moved to |
| `e85978d` | 2026-10-22 | W2-9a review fixes: offer to hold any open time in the window; pairings email stays inside the time limit |
| `ce88bd1` | 2026-10-22 | Codemap and status board |
| `087c1a2` | 2026-10-22 | W2-8c analytics: rate paid vs posted, and booking pace for the next two weeks |
| `28a5f3a` | 2026-10-22 | W2-9a Events: set up an outing or tournament, hold its tee times, prep checklist, players and pairings |
| `164896a` | 2026-10-21 | BRAIN-1a: every admin change is recorded; money, access and deletes need a reason; Audit page (#175) |
| `0cb3627` | 2026-10-22 | W2-8b: a regular who has booked again is not 'gone quiet' |
| `21a19af` | 2026-10-22 | test-email.js: send from support@ (hello@ no longer exists) |
| `1301b0a` | 2026-10-22 | Regenerate status board |
| `8860edb` | 2026-10-22 | MAIL-1: Google Workspace addresses — support@, admin@, billing@, noreply@ |
| `ffcefc6` | 2026-10-22 | W2-8b analytics: beyond the green fee (carts, shop) and regulars who've gone quiet |
| `aad9ee0` | 2026-10-22 | W2-8a review fixes: residents table starts Oct 19, 'didn't play' counts no-show players |
| `f367f8d` | 2026-10-22 | W2-8a analytics: earned per spot, turned away, short-shows, weather kept out of cancellations, residents |
| `e8c4fe4` | 2026-10-22 | W2-6 review fixes: walking per round, reopened days keep prices, server-side checks, unsaved first plan |
| `1d2a5db` | 2026-10-21 | BRAIN-0: load Sentry on the server (instrumentation hook); admin foundation plan in the spec (#174) |
| `4cd3e1a` | 2026-10-22 | W2-6 Schedule simplification: open hours, what golfers can book, one price table |
| `e59ed92` | 2026-10-22 | Codemap and status board |
| `f8d9737` | 2026-10-22 | Messages: keep Open the course in the header below lg |
| `3020c49` | 2026-10-22 | AW-8a: Announcements page of its own; Messages inbox in three groups with a course panel (in review) |
| `f31213a` | 2026-10-21 | AW-7: course page — Bookings, Money, Setup, Contact & notes (#172) |
| `42adddb` | 2026-10-21 | Codemap and status board |
| `6b0ebeb` | 2026-10-21 | AW-7 review fixes: per-reminder sent state, plain-English decline reasons, tab=setup links |
| `821ddf9` | 2026-10-21 | AW-7: course page — Bookings, Money, Setup, Contact & notes (in review) |
| `4abfebb` | 2026-10-21 | AW-6c: Leads column, Add a lead, Move to Talking (#171) |
| `a526731` | 2026-10-21 | Codemap and status board |
| `fe16f64` | 2026-10-21 | AW-6c: Leads column, Add a lead, Move to Talking (WIP, in review) |
| `d58220f` | 2026-10-21 | AW-6b: inquiry page — the one next step first (#169) |
| `a85a078` | 2026-10-21 | AW-4b: Today shows each course with its own to-dos; Goals tab (#170) |
| `27af530` | 2026-10-21 | Status board |
| `cbcfb8c` | 2026-10-21 | AW-6b review: resend sheet and build stay in the menu when a call or snooze takes the step; guidance never claims a call that didn't happen |
| `ec245d5` | 2026-10-21 | AW-6b: inquiry page leads with the one next step; call card in a dialog; compact lead card |
| `adf590b` | 2026-10-21 | Status board |
| `914a1c5` | 2026-10-21 | AW-6a review: building steps from the ledger (send / updated / resend preview, go live); confirm before an in-place resend; stuck rule matches Today |
| `b84a2db` | 2026-10-21 | AW-6a: Inquiries board — Talking, Setting up, Live, one next step per card |
| `e941200` | 2026-10-21 | Code map and status board |
| `39d69df` | 2026-10-21 | AW-5 review: a killed digest run can't lose the day; bounded model call; no double send; upsert new alerts |
| `3bccfa0` | 2026-10-21 | AW-5: hourly admin checks — urgent alerts once each, and a morning digest |
| `2228db8` | 2026-10-21 | AW-4 review: 'Paid through courses'; a booked discovery call isn't stuck; Resend preview manager+ |
| `c78b7aa` | 2026-10-21 | AW-4: admin Today page — needs you now, platform health, money vs last month, onboarding |
| `224db02` | 2026-10-21 | Status board and code map |
| `4c61670` | 2026-10-21 | AW-3b: Ask in the admin search — read-only AI answers with links to admin pages |
| `905572d` | 2026-10-21 | Regenerate code map |
| `474f3f0` | 2026-10-21 | Status board |
| `e66b258` | 2026-10-21 | AW-3a: admin rail grouped by job, search on top; search finds bookings, groups, conversations |
| `fc9a048` | 2026-10-21 | Status board |
| `5982380` | 2026-10-21 | AW-1c review: step-up gate and passkey-marker tests; replay guard reads a carried step |
| `2807e2b` | 2026-10-21 | AW-1c: re-confirm risky owner actions; owner device list; passkey change emails |
| `5fc7ad8` | 2026-10-21 | Regenerate code map |
| `a6a13af` | 2026-10-21 | AW-1b: a passkey sign-in keeps the used-authenticator-step marker; AW-1c notes; status board |
| `00a9007` | 2026-10-21 | AW-1b: owner passkeys — Face ID / Touch ID / security key at /cam, the authenticator app as backup, no email codes once a passkey exists |
| `ccbfb06` | 2026-10-20 | AW-1a: owner signs in only at /cam (approved devices, revocable 4h sessions, sign-in alerts) (#161) |
| `0671dab` | 2026-10-21 | Regenerate code map after main merge |
| `4fda831` | 2026-10-21 | AW-1a: dummy hash at the real cost; status board |
| `fc3a0fc` | 2026-10-21 | AW-1a: review fixes — the verify step never says whose email it is, /cam without the marketing header, fixed approval-link origin, even timing for unknown emails |
| `eeea53c` | 2026-10-21 | AW-1a: owner signs in only at /cam — approved devices, revocable 4-hour sessions on their own cookie, an email on every sign-in; /admin never mentions the owner |
| `315e3e3` | 2026-10-20 | W2-7 B2: sales tax on pro-shop items added to a round (#159) |
| `2798d62` | 2026-10-21 | W2-7 B2: sweep keeps quotes with no expiry; a charge meeting another attempt's lock stops; status board |
| `557be09` | 2026-10-21 | W2-7 B2: review fixes — tax quoted under the charge's own lock, stale/expired quotes never recorded, open rounds refreshed when tax is switched |
| `063dc87` | 2026-10-21 | W2-7 B2: sales tax on pro-shop items added to a round, charged with the round and recorded once paid |
| `507507a` | 2026-10-20 | W2-6 slice 3: per-round booking rules (walking, group size, how far ahead) (#158) |
| `85be7e1` | 2026-10-21 | Regenerate code map and status board after main merge |
| `248dc36` | 2026-10-21 | W2-6 slice 3: window-cap test, spec status, status board |
| `d8a856f` | 2026-10-21 | W2-6 slice 3: review fixes — golfer pages read the time's own cart rule, shared input class, round window capped at the course's, preview uses the shared tee-time mapping |
| `290c10f` | 2026-10-21 | W2-6 slice 3: per-round booking rules (walking, group size, how far ahead), enforced at booking |
| `ddb40f0` | 2026-10-20 | W2-6 slice 2: schedule overlaps warn instead of block (#156) |
| `bc1db3d` | 2026-10-21 | W2-6 slice 2: reviewer notes — engine comment, note text in full ink; status board |
| `27ef910` | 2026-10-21 | W2-6 slice 2: schedule overlaps warn instead of block — only one tee time sold twice is refused |
| `e96323e` | 2026-10-20 | W2-6 slice 1: one-save course setup (shape, nines, par, rounds) (#155) |
| `77187a1` | 2026-10-20 | Status board |
| `42ff2e4` | 2026-10-20 | W2-6: review fixes — schedules keep their holes, round renames shown, retired rounds cleared on every day |
| `dea0574` | 2026-10-20 | W2-6: one-save course setup — shape, nines, par and rounds, retiring what the old shape had |
| `39e62f4` | 2026-10-20 | W2-7 part B1: pro-shop sales tax through Stripe Tax (walk-up sales) (#154) |
| `773326d` | 2026-10-20 | W2-7 part B1: pro-shop sales tax through Stripe Tax (walk-up sales) |
| `ad6524b` | 2026-10-19 | W2-7 part A: pro shop options, SKU, bulk/CSV/AI add, faster selling (#151) |
| `bd86947` | 2026-10-19 | Sign-in page: full-screen photo with the sign-in card under the logo (#153) |
| `fff11a1` | 2026-10-19 | Emails: one clean look for every email (EMAIL-2) (#152) |
| `8287f54` | 2026-10-19 | Brand: the golfer short mark in email footers and receipts; Powered by GreenReserve in the dashboard bar (#150) |
| `cb98de8` | 2026-10-19 | W2-4/5: price periods inside one schedule; Prices & fees reorganised (#149) |
| `223121d` | 2026-10-19 | Walkthrough 2 quick wins: homepage free hero, Birdie in the corner, owner label, last tee time at the end time (#148) |
| `95da45f` | 2026-10-19 | Member portal: show a resident their own spot at the resident rate, as booking charges (#146) |
| `9910cf6` | 2026-10-19 | Member portal: show members exactly what booking charges (#145) |
| `dbd4737` | 2026-10-19 | Status board: regenerate (#144) |
| `428da80` | 2026-10-19 | Birdie: Ask Birdie in the top bar on desktop; the phone launcher says Ask (#143) |
| `0419675` | 2026-10-19 | Contact: three paths, phone and inbox; the course's phone on Manage my booking (#142) |
| `b14b998` | 2026-10-19 | Course groups: one golfer page and one resident list for courses run together (#141) |
| `662f294` | 2026-10-19 | Members: import a list, and each member's last round (#140) |
| `9aba8a1` | 2026-10-19 | Settings: Who pays what, one table of every kind of golfer and their price (#139) |
| `a8c71b9` | 2026-10-19 | Tee sheet: the time's card — beside the sheet on a laptop, a full sheet on a phone (#138) |
| `c17100d` | 2026-10-19 | Dashboard nav: every tab fits on every screen (#137) |
| `668b8ce` | 2026-10-19 | Residents: staff keep a resident list; residents book at the resident rate (#136) |
| `73245fc` | 2026-10-19 | Status board after Settings part 2 and the pro shop (#135) |
| `cb884f2` | 2026-10-19 | Pro shop: catalog with stock, walk-up sales (cash or a pay link), sell page (#134) |
| `cd9c3a1` | 2026-10-19 | Settings part 2: guided course layout, booking rules, facilities checklist, Birdie writes the description; golfers see all of it (#131) |
| `1cf8419` | 2026-10-19 | Homepage hero: Learn more instead of Book a demo (#133) |
| `a37365e` | 2026-10-19 | Email: log Resend's message id and accept time for every send (#132) |
| `e226ed7` | 2026-10-19 | Members: a self-joined member put on a tier gets a pay link, and dues emails reach them (#130) |
| `27e358a` | 2026-10-19 | Members: list first, one plain dues line per member, remind count matches who actually gets emailed (#128) |
| `49d373a` | 2026-10-19 | Settings part 1: sections in setup order, a "Finish setting up" list, Staff and Your account split (#129) |
| `fc1c99e` | 2026-10-19 | Schedule rework: your week at a glance, named price periods, closed-days calendar, every save shows what it changes (#127) |
| `45ac49a` | 2026-10-19 | Add time: warn and ask once when a new time is within 5 minutes of another (#120) |
| `33ae355` | 2026-10-19 | Birdie tucks into an edge tab and stays clear of buttons; Messages says when we reply (#126) |
| `92cdf08` | 2026-10-19 | Payments and payouts: overview, payments by day, Stripe payouts table, cancellations history; policy lives in Settings (#124) |

**Meaning:** work shipped that the queue does not know about. Either record the run, or check the box.

### Uncommitted working tree (32 file(s))

- `M  OPERATOR_REWORK_SPEC.md`
- `UU STATUS.artifact.html`
- `UU STATUS.json`
- `UU STATUS.md`
- `UU docs/CODEMAP.md`
- `UU docs/codemap.json`
- `A  prisma/migrations/20261022020616_w2_9_share_course/migration.sql`
- `A  prisma/migrations/20261022021832_w2_9b_event_payments/migration.sql`
- `M  prisma/schema.prisma`
- `M scripts/contact-email-test.ts`
- `M  scripts/design-guard.baseline.json`
- `A  scripts/event-payments-db-test.ts`
- `M  scripts/events-db-test.ts`
- `M  scripts/events-test.ts`
- `A  src/app/api/event-payment/[id]/route.ts`
- `A  src/app/api/operator/events/[id]/payments/route.ts`
- `M  src/app/api/operator/events/[id]/route.ts`
- `M  src/app/api/operator/events/route.ts`
- `M  src/app/api/operator/tee-times/route.ts`
- `M  src/app/dashboard/events/page.tsx`

**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply
the queue header's `git checkout -- .` cleanup until that run has committed, or the work is gone.

## In flight

- **ROADMAP-1 — Cam 2026-10-07: build beyond the tee sheet, AI/BI first. The plan, order and open decisions live in `PLATFORM_ROADMAP_SPEC.md`: BI-1 monthly AI review (BUILT) → ACT-1 move a group → ACT-2 ** — `RUN_QUEUE.md:47`
  - PARTIALLY BUILT — shipped: BI-1 #92, ACT-1 #93, ACT-2 #94, MSG-1 v1 #95, SHEET-2 #97–99, POS-1a #106. Now: POS-1b. After launch: OUT-1, FB-1, PWA-1.

## Built but not signed off

Open checkbox **because the review has not run**, not because the code is missing.
This is the distinction a raw checkbox count gets wrong.

Nothing awaiting review.

## Not started — the actual queue

1. WALKS — CAM: live walks before launch (code merged; each needs real Stripe/Resend/phone). — `RUN_QUEUE.md:49`
2. RV-LEDGER — Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checke — `RUN_QUEUE.md:56`
3. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:235`
4. CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:338`
5. BUG: orphan banner loops forever — BUILT b88c8bf — CAM: open /admin/courses → acknowledged orphans → Force delete DaisyLinks (or fold into the PRELAUNCH purge) — `RUN_QUEUE.md:2357`
6. SETUP — CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars; verify on /admin/system. Blob and Birdie done. — `RUN_QUEUE.md:2993`

## Waiting on you (not on a build)

- CAM: live walks before launch (code merged — `RUN_QUEUE.md:49`
- Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checked against th — `RUN_QUEUE.md:56`
- Cam: which business address to publish, and confirming the Terms' governing law moves from New Jersey to New York (LLC is NY) — `RUN_QUEUE.md:235`
- CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf course name") to the demo event, so homepage demo inquiries arrive  — `RUN_QUEUE.md:338`
- CAM: open /admin/courses → acknowledged orphans → Force delete DaisyLinks (or fold into the PRELAUNCH purge) Loop fix is code-verified: sweepOrphanCourses skips archived [ORPHAN] c — `RUN_QUEUE.md:2357`
- CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars — `RUN_QUEUE.md:2993`

## Revise campaign (page-by-page pass)

14 pages closed · 8 open. One page in flight at a time.

- A-03 /admin/inquiries/[id] — DETAIL — items 1-7 BUILT (item 1 cbbf1e0, — `REVISE_QUEUE.md:292`
- A-07 /admin/golfers — support lookup — `REVISE_QUEUE.md:554`
- A-08 /admin/messages — threads (Cam 2026-07-23: functionally fine, "just needs to look a little better" — visual notes go to the AESTHETIC PASS; only structural — `REVISE_QUEUE.md:555`
- A-09 /admin/activity — ledger + filters — `REVISE_QUEUE.md:556`
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
| `CLAUDE.md` | 1 | 2026-10-22 | 0d |
| `PLATFORM_ROADMAP_SPEC.md` | 1 | 2026-10-19 | 3d |
| `ADMIN_V5_SPEC.md` | 0 | 2026-10-21 | 0d |
| `OPERATOR_REWORK_SPEC.md` | 0 | 2026-10-22 | 0d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-19 | 2d |
| `ADMIN_MASTER_PLAN.md` | 0 | 2026-10-19 | 3d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-10-19 | 3d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-10-19 | 3d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-10-19 | 3d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-10-19 | 3d |
| `AGREEMENT_SPEC.md` | 0 | 2026-10-19 | 3d |
| `ARCHITECTURE.md` | 0 | 2026-10-19 | 3d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-10-19 | 3d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-10-19 | 3d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-10-19 | 3d |
| `CODEMAP_SPEC.md` | 0 | 2026-10-19 | 3d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-10-19 | 3d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-10-19 | 3d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-10-19 | 3d |
| `FB2_COPY_SPEC.md` | 0 | 2026-10-19 | 3d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-10-19 | 3d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-10-19 | 3d |
| `GOLFER_SPEC.md` | 0 | 2026-10-19 | 3d |
| `HARDENING_SPEC.md` | 0 | 2026-10-19 | 3d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-10-19 | 3d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-10-19 | 3d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-10-19 | 3d |
| `ONBOARDING_SPEC.md` | 0 | 2026-10-19 | 3d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-10-19 | 3d |
| `PRIVATE_BILLING_SPEC.md` | 0 | 2026-10-19 | 3d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-10-19 | 3d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-10-19 | 3d |
| `RECEIPT_SPEC.md` | 0 | 2026-10-19 | 3d |
| `REVIEW_SPEC.md` | 0 | 2026-10-19 | 3d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-10-19 | 3d |
| `STAFF_POLICY_SPEC.md` | 0 | 2026-10-19 | 3d |
| `UI_REVISE_SPEC.md` | 0 | 2026-10-19 | 3d |

## Recent commits

- `f4bc1a4` 2026-10-22 — Regenerate status board
- `58642d3` 2026-10-22 — Regenerate status board and code map
- `d8306c5` 2026-10-22 — MAIL-1: a cancellation that refunded money also comes from billing@
- `c39a10c` 2026-10-22 — MAIL-1: a cancellation that kept a fee comes from billing@
- `4bd2042` 2026-10-21 — BRAIN-1b: every email and text logged; course page leads with a Timeline; Sentry test button (#179)
- `512e214` 2026-10-22 — queue/spec update
- `8c73613` 2026-10-22 — W2-9a: releasing an event's hold checks the day being released, not the day it moved to
- `e85978d` 2026-10-22 — W2-9a review fixes: offer to hold any open time in the window; pairings email stays inside the time limit
- `ce88bd1` 2026-10-22 — Codemap and status board
- `087c1a2` 2026-10-22 — W2-8c analytics: rate paid vs posted, and booking pace for the next two weeks
- `28a5f3a` 2026-10-22 — W2-9a Events: set up an outing or tournament, hold its tee times, prep checklist, players and pairings
- `164896a` 2026-10-21 — BRAIN-1a: every admin change is recorded; money, access and deletes need a reason; Audit page (#175)

---

**Totals:** 298 done · 0 awaiting review · 1 in flight · 6 not started · 8 revise pages open · 17 ideas · 7 parked.
