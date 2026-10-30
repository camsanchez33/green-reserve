# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-10-30 14:15 UTC · branch `claude/walkthrough-2-prioritization-ui5xyu` · HEAD `5fff5110` · working tree **17 dirty file(s)**

## ⚠ Drift — git and the queue disagree

`RUN_QUEUE.md` was last committed **2026-10-27**. 46 commit(s) since then are not mentioned anywhere in it:

| commit | date | subject |
|---|---|---|
| `7dda7589` | 2026-10-30 | Money ledger: one row for every dollar that moves; membership dues charged safely (#254) |
| `48be83aa` | 2026-10-30 | Renewal reminder waits for the window its link can be paid in (one rule, lib/membership-renewal) |
| `85c78bb8` | 2026-10-30 | Test: dues paid at the shop read through paidUntilRenewal |
| `136a1ea6` | 2026-10-30 | Ledger review fixes: a monthly member can't pay twice in a row; our refund keeps GreenReserve's share after the webhook's copy; the webhook asks Stripe for a charge's refunds |
| `5917aabf` | 2026-10-30 | Money ledger: one MoneyMove row for every dollar that moves; dues charged outside a transaction |
| `89f0e830` | 2026-10-29 | Golfer record: one course's view of a golfer, staff notes, online-booking block (#253) |
| `388244d7` | 2026-10-30 | Golfer record review fixes: waived removals aren't late cancels; blocks hold across email/phone/account; no double decode |
| `ffa0ec2a` | 2026-10-30 | Golfer record: one course's view of a golfer, staff notes, online-booking block |
| `370f7fa4` | 2026-10-29 | Daily dead ends, part B: staff refunds, party size, counter rates, shop history, returns and void (#252) |
| `bf2fdf53` | 2026-10-29 | Member rates at the counter: the member shows their membership, or the course allows any membership |
| `65df5988` | 2026-10-29 | Part B review fixes: Refund rounds in no preset, no party or resident change while on the card reader, two refunds at once can't pass the course's share |
| `cfe7cb40` | 2026-10-29 | WIP part B: counter rates — resident, senior, junior and membership prices for walk-ins and phone bookings |
| `3d18ecd9` | 2026-10-29 | Daily dead ends, part A: declined cards, live tee sheet, search, dues, close-out, phone menu (#251) |
| `69bcbab8` | 2026-10-29 | WIP part B: shop sale history and lookup, returns by item, same-day void of a cash sale |
| `7dcf8122` | 2026-10-29 | Course page: no layout shift when the day's tee times load |
| `f226c81b` | 2026-10-29 | WIP part B: staff change a group's party size; a card check-in from the card form takes a partial party |
| `9de927a8` | 2026-10-29 | WIP part B: staff refunds (course share) and giving back a kept late fee |
| `4e1d9c2c` | 2026-10-29 | The dues link says why it didn't send; a search result opens Cancellations filtered |
| `06b64277` | 2026-10-29 | Daily dead ends, part A: declined cards, a live tee sheet, search, dues, close-out, phone menu, cancellations |
| `0dfd8bdf` | 2026-10-29 | Revamp 3: the 12 audit fixes (#250) |
| `92b9bfa6` | 2026-10-29 | Messaging: a mobile number counts only when texting is on, and a send that reaches nobody is refused |
| `9e689d2b` | 2026-10-29 | Closing a day says who is booked; reopening asks first and unblocks only what the closure blocked |
| `1f56429b` | 2026-10-29 | Tests: the Members Expired rule and a booked time's repricing follow fixes 2 and 5 |
| `28e44ab2` | 2026-10-29 | Events: shotgun starts split 1A/1B, a group is never given another's tee time, a captain pays for the team |
| `447cb1bd` | 2026-10-29 | Status board |
| `e02ea5d4` | 2026-10-29 | One code, one shop item; an oversold count says so |
| `fa151d17` | 2026-10-29 | The booking window turns over at the course's midnight, not UTC's |
| `57e64d2d` | 2026-10-29 | "Not paid yet" is what is owed: marked no-shows and refunded rounds aside, and the list behind it is played rounds |
| `9bcc13b3` | 2026-10-29 | A cash sale records the total the register showed, or nothing |
| `6ed720e1` | 2026-10-29 | A schedule save updates open tee times in place instead of re-creating the horizon; tests pin partial cash pricing |
| `af4b9fc3` | 2026-10-29 | Cash at the register is never blocked by sales tax |
| `bee3bc29` | 2026-10-29 | A member's group keeps its split when its size changes or part of it checks in; rates lapse at the course's own midnight |
| `ec1f63b8` | 2026-10-29 | A price change reaches every bookable day and the open spots of booked times |
| `64c39edb` | 2026-10-29 | An unsigned Operator Agreement no longer locks staff out of the tee sheet |
| `59b616cd` | 2026-10-29 | Member pricing: the member alone gets the member rate unless the tier includes guests; rates end after the membership does (course grace days); a first dues payment is one term |
| `d0b0c181` | 2026-10-28 | Fill a test course with sample data; never email a placeholder address or text a fictional number (#249) |
| `09422b74` | 2026-10-28 | Sample data: export lists only Stripe-traceable late fees; test mark stays while sample data is on; batched, retry-safe fill |
| `161d3d7f` | 2026-10-28 | Fill a test course with sample data; never email a placeholder address or text a fictional number |
| `fa0add63` | 2026-10-27 | DENSE-5 Members: number strip and a sortable table with renewal, rounds and spend (#247) |
| `187a1ba4` | 2026-10-27 | DENSE-3 Home: trend lines, next 14 days, checked-in state, Next payout only (#246) |
| `b8440aa6` | 2026-10-27 | Fix main's red Tests: noshow-eod-test used a tee time that hadn't gone off yet (#245) |
| `8061878d` | 2026-10-27 | No cancelling after the tee time: check in or no-show (charged at midnight) (#244) |
| `e8e2a2e6` | 2026-10-27 | DENSE-2 Money sales view, past tee times out of the way, honest day strip and cancellation reasons (#243) |
| `531516a0` | 2026-10-27 | DENSE-4b: the tee sheet's day strip — players, checked in, paid, not paid yet (#242) |
| `92087fca` | 2026-10-27 | DENSE-4: the tee sheet is seat rows (#241) |
| `6eced458` | 2026-10-27 | Courses built by hand are never Orphaned or swept; resend sign-in code is rate-limited (#240) |

**Meaning:** work shipped that the queue does not know about. Either record the run, or check the box.

### Uncommitted working tree (17 file(s))

- `M STATUS.artifact.html`
- `M STATUS.json`
- `M STATUS.md`
- `M docs/CODEMAP.md`
- `M docs/codemap.json`
- `M prisma/schema.prisma`
- `M scripts/money-ledger-test.ts`
- `M src/app/api/operator/members/route.ts`
- `M src/app/dashboard/members/page.tsx`
- `M src/app/dashboard/money/page.tsx`
- `M src/components/dashboard/RegisterClose.tsx`
- `M src/lib/register-close.ts`
- `?? prisma/migrations/20261030030000_register_other_cash/`
- `?? scripts/ledger-view-db-test.ts`
- `?? src/app/api/operator/money/ledger/`
- `?? src/components/dashboard/money/LedgerPanel.tsx`
- `?? src/lib/ledger-view.ts`

**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply
the queue header's `git checkout -- .` cleanup until that run has committed, or the work is gone.

## In flight

- **ROADMAP-1 — Cam 2026-10-07: build beyond the tee sheet, AI/BI first. The plan, order and open decisions live in `PLATFORM_ROADMAP_SPEC.md`: BI-1 monthly AI review (BUILT) → ACT-1 move a group → ACT-2 ** — `RUN_QUEUE.md:48`
  - PARTIALLY BUILT — shipped: BI-1 #92, ACT-1 #93, ACT-2 #94, MSG-1 v1 #95, SHEET-2 #97–99, POS-1a #106. Now: POS-1b. After launch: OUT-1, FB-1, PWA-1.

## Built but not signed off

Open checkbox **because the review has not run**, not because the code is missing.
This is the distinction a raw checkbox count gets wrong.

| item | shipped | age | commit | source |
|---|---|---|---|---|
| BUG: orphan banner loops forever — BUILT b88c8bf — CAM: open /admin/courses → acknowledged orphans → Force del | 2026-07-22 | 99d | `b88c8bf3` | `RUN_QUEUE.md:2358` |

## Not started — the actual queue

1. DENSE — Cam 2026-10-27: "too much words on the pages … think OpenTable, Stripe, Lightspeed, Toast … apply across all tabs on both dashboard and admin". Lots of data, almost no sent — `RUN_QUEUE.md:47`
2. WALKS — CAM: live walks before launch (code merged; each needs real Stripe/Resend/phone). — `RUN_QUEUE.md:50`
3. RV-LEDGER — Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checke — `RUN_QUEUE.md:57`
4. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:236`
5. CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:339`
6. SETUP — CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars; verify on /admin/system. Blob and Birdie done. — `RUN_QUEUE.md:2994`

## Waiting on you (not on a build)

- CAM: live walks before launch (code merged — `RUN_QUEUE.md:50`
- Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checked against th — `RUN_QUEUE.md:57`
- Cam: which business address to publish, and confirming the Terms' governing law moves from New Jersey to New York (LLC is NY) — `RUN_QUEUE.md:236`
- CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf course name") to the demo event, so homepage demo inquiries arrive  — `RUN_QUEUE.md:339`
- CAM: open /admin/courses → acknowledged orphans → Force delete DaisyLinks (or fold into the PRELAUNCH purge) Loop fix is code-verified: sweepOrphanCourses skips archived [ORPHAN] c — `RUN_QUEUE.md:2358`
- CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars — `RUN_QUEUE.md:2994`

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
| `CLAUDE.md` | 1 | 2026-10-30 | 0d |
| `DENSE_UI_SPEC.md` | 1 | 2026-10-27 | 2d |
| `PLATFORM_ROADMAP_SPEC.md` | 1 | 2026-10-20 | 9d |
| `STAFF_POLICY_SPEC.md` | 0 | 2026-10-26 | 3d |
| `OPERATOR_REWORK_SPEC.md` | 0 | 2026-10-25 | 4d |
| `ADMIN_V5_SPEC.md` | 0 | 2026-10-23 | 6d |
| `AGREEMENT_SPEC.md` | 0 | 2026-10-22 | 7d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-10-22 | 7d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-23 | 7d |
| `ONBOARDING_SPEC.md` | 0 | 2026-10-22 | 7d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-10-22 | 7d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-10-22 | 7d |
| `RECEIPT_SPEC.md` | 0 | 2026-10-22 | 7d |
| `ADMIN_MASTER_PLAN.md` | 0 | 2026-10-20 | 9d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-10-20 | 9d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-10-20 | 9d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-10-20 | 9d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-10-20 | 9d |
| `ARCHITECTURE.md` | 0 | 2026-10-20 | 9d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-10-20 | 9d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-10-20 | 9d |
| `CODEMAP_SPEC.md` | 0 | 2026-10-20 | 9d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-10-20 | 9d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-10-20 | 9d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-10-20 | 9d |
| `FB2_COPY_SPEC.md` | 0 | 2026-10-20 | 9d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-10-20 | 9d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-10-20 | 9d |
| `GOLFER_SPEC.md` | 0 | 2026-10-20 | 9d |
| `HARDENING_SPEC.md` | 0 | 2026-10-20 | 9d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-10-20 | 9d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-10-20 | 9d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-10-20 | 9d |
| `PRIVATE_BILLING_SPEC.md` | 0 | 2026-10-20 | 9d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-10-20 | 9d |
| `REVIEW_SPEC.md` | 0 | 2026-10-20 | 9d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-10-20 | 9d |
| `UI_REVISE_SPEC.md` | 0 | 2026-10-20 | 9d |

## Recent commits

- `7dda7589` 2026-10-30 — Money ledger: one row for every dollar that moves; membership dues charged safely (#254)
- `48be83aa` 2026-10-30 — Renewal reminder waits for the window its link can be paid in (one rule, lib/membership-renewal)
- `85c78bb8` 2026-10-30 — Test: dues paid at the shop read through paidUntilRenewal
- `136a1ea6` 2026-10-30 — Ledger review fixes: a monthly member can't pay twice in a row; our refund keeps GreenReserve's share after the webhook's copy; the webhook asks Stripe for a charge's refunds
- `5917aabf` 2026-10-30 — Money ledger: one MoneyMove row for every dollar that moves; dues charged outside a transaction
- `89f0e830` 2026-10-29 — Golfer record: one course's view of a golfer, staff notes, online-booking block (#253)
- `388244d7` 2026-10-30 — Golfer record review fixes: waived removals aren't late cancels; blocks hold across email/phone/account; no double decode
- `ffa0ec2a` 2026-10-30 — Golfer record: one course's view of a golfer, staff notes, online-booking block
- `370f7fa4` 2026-10-29 — Daily dead ends, part B: staff refunds, party size, counter rates, shop history, returns and void (#252)
- `bf2fdf53` 2026-10-29 — Member rates at the counter: the member shows their membership, or the course allows any membership
- `65df5988` 2026-10-29 — Part B review fixes: Refund rounds in no preset, no party or resident change while on the card reader, two refunds at once can't pass the course's share
- `cfe7cb40` 2026-10-29 — WIP part B: counter rates — resident, senior, junior and membership prices for walk-ins and phone bookings

---

**Totals:** 298 done · 1 awaiting review · 1 in flight · 6 not started · 7 revise pages open · 17 ideas · 7 parked.
