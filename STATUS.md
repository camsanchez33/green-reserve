# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-11-02 03:58 UTC · branch `claude/walkthrough-2-prioritization-ui5xyu` · HEAD `53e31df1` · working tree **10 dirty file(s)**

## ⚠ Drift — git and the queue disagree

`RUN_QUEUE.md` was last committed **2026-10-31**. 30 commit(s) since then are not mentioned anywhere in it:

| commit | date | subject |
|---|---|---|
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

### Uncommitted working tree (10 file(s))

- `M docs/CODEMAP.md`
- `M docs/codemap.json`
- `M src/app/api/operator/events/[id]/payments/route.ts`
- `M src/app/api/operator/members/route.ts`
- `M src/components/dashboard/events/EventDay.tsx`
- `M src/components/dashboard/events/EventDetail.tsx`
- `M src/components/dashboard/events/EventMoney.tsx`
- `M src/lib/staff-permissions.ts`
- `?? scripts/events-pay-perm-test.ts`
- `?? scripts/member-remove-test.ts`

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
| BUG: orphan banner loops forever — BUILT b88c8bf — CAM: open /admin/courses → acknowledged orphans → Force del | 2026-07-22 | 102d | `b88c8bf3` | `RUN_QUEUE.md:2412` |

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
| `CLAUDE.md` | 1 | 2026-11-02 | 0d |
| `DENSE_UI_SPEC.md` | 1 | 2026-11-01 | 0d |
| `PLATFORM_ROADMAP_SPEC.md` | 1 | 2026-10-20 | 12d |
| `STAFF_POLICY_SPEC.md` | 0 | 2026-10-26 | 6d |
| `OPERATOR_REWORK_SPEC.md` | 0 | 2026-10-25 | 7d |
| `ADMIN_V5_SPEC.md` | 0 | 2026-10-23 | 9d |
| `AGREEMENT_SPEC.md` | 0 | 2026-10-22 | 10d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-10-22 | 10d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-23 | 10d |
| `ONBOARDING_SPEC.md` | 0 | 2026-10-22 | 10d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-10-22 | 10d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-10-22 | 10d |
| `RECEIPT_SPEC.md` | 0 | 2026-10-22 | 10d |
| `ADMIN_MASTER_PLAN.md` | 0 | 2026-10-20 | 12d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-10-20 | 12d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-10-20 | 12d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-10-20 | 12d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-10-20 | 12d |
| `ARCHITECTURE.md` | 0 | 2026-10-20 | 12d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-10-20 | 12d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-10-20 | 12d |
| `CODEMAP_SPEC.md` | 0 | 2026-10-20 | 12d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-10-20 | 12d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-10-20 | 12d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-10-20 | 12d |
| `FB2_COPY_SPEC.md` | 0 | 2026-10-20 | 12d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-10-20 | 12d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-10-20 | 12d |
| `GOLFER_SPEC.md` | 0 | 2026-10-20 | 12d |
| `HARDENING_SPEC.md` | 0 | 2026-10-20 | 12d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-10-20 | 12d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-10-20 | 12d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-10-20 | 12d |
| `PRIVATE_BILLING_SPEC.md` | 0 | 2026-10-20 | 12d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-10-20 | 12d |
| `REVIEW_SPEC.md` | 0 | 2026-10-20 | 12d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-10-20 | 12d |
| `UI_REVISE_SPEC.md` | 0 | 2026-10-20 | 12d |

## Recent commits

- `53e31df1` 2026-11-02 — Counter friction B: card beside the sheet, Home opens a time's card, member opens golfer record, cash through a failed tax quote
- `b80496f3` 2026-11-02 — SMS-1: texts only to numbers that agreed (Twilio A2P 10DLC opt-in)
- `db252e4b` 2026-11-02 — Status board refresh
- `b199995d` 2026-11-02 — Counter friction: one-tap check-in, no-show waits 10 min, cart off by default, search on phones
- `45ca1d0e` 2026-11-02 — Speed with volume: one time-zone formatter per zone (Analytics 90 days 10.7s → 1.2s)
- `4054bff4` 2026-11-02 — Test course: busy-season sample data, with every money table filled
- `91745c5a` 2026-11-01 — member-portal-price test: its course has member prices, so the switches are on
- `96cd687f` 2026-11-01 — Pricing switches: Members / Residents off means the public price (backfill + auto-on)
- `1db52953` 2026-11-01 — Audit wording: what the sheet, members, settings and golfer page say, made true (#288)
- `93f3ff63` 2026-11-01 — Audit wording: what the sheet, members, settings and golfer page say, made true
- `b5d27f01` 2026-11-01 — Audit numbers: partial refunds, event money, event player swap, shop today, payout tile (#287)
- `c6efa694` 2026-11-01 — Audit numbers: partial refunds, event money, event player swap, shop today, payout tile

---

**Totals:** 345 done · 1 awaiting review · 1 in flight · 6 not started · 7 revise pages open · 17 ideas · 7 parked.
