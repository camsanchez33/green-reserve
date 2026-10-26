# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-10-26 23:20 UTC · branch `claude/walkthrough-2-prioritization-ui5xyu` · HEAD `199951b0` · working tree clean

## ⚠ Drift — git and the queue disagree

`RUN_QUEUE.md` was last committed **2026-10-22**. 74 commit(s) since then are not mentioned anywhere in it:

| commit | date | subject |
|---|---|---|
| `199951b0` | 2026-10-26 | Reply step: not after a talked or skipped call; a reply only counts in its own stage; Needs you says reply |
| `50991cf1` | 2026-10-26 | Reply to a course from the admin; a new question is your move until you reply; the new-question alert leads with the question |
| `3fac48ef` | 2026-10-26 | /for-courses: one column, no price line, no FAQ; thanks screens keep the header and say one thing |
| `d186b39b` | 2026-10-26 | Refunds switch: drop 'back to the card' (shop refunds can be cash); status board + code map |
| `dbfb8d87` | 2026-10-26 | Staff switches: refunds says what it gates, no Stripe connect button for staff, 'Charge a fee by hand' removed (R-AUTH-007) |
| `eb9b40b1` | 2026-10-26 | Admin Problems: failed refunds and declined cancellation holds (R-PAY-010) (#230) |
| `3ef0e1ea` | 2026-10-26 | status board + code map |
| `c2f1007c` | 2026-10-26 | Bump actions/checkout from 4 to 7 (#215) |
| `f0b52217` | 2026-10-26 | A no-show fee refunded by hand after a failed refund is recorded as a no-show fee refund |
| `28e1481e` | 2026-10-26 | status board + code map |
| `2e541f71` | 2026-10-26 | Failed refunds stay a Problem until refunded; a dashboard refund of a race-path charge is recorded |
| `0197ea86` | 2026-10-26 | Admin Problems: a failed refund and a declined cancellation hold (R-PAY-010) |
| `355f6ca0` | 2026-10-26 | Bump the minor-and-patch group across 1 directory with 5 updates (#217) |
| `68901693` | 2026-10-26 | Bump actions/upload-artifact from 4 to 7 (#216) |
| `03bd9dcb` | 2026-10-26 | Bump actions/setup-node from 4 to 7 (#214) |
| `e1ce6066` | 2026-10-26 | Check-in email retried after a failed send (R-CRON-007); schedule interval must be a whole number >= 1 (R-BOOK-011) (#229) |
| `0fd72cdd` | 2026-10-26 | status board + code map |
| `58e0c789` | 2026-10-26 | test: type the schedule id (scheduleToWire returns unknown fields) |
| `195f02a7` | 2026-10-26 | Schedule interval: refuse anything but a whole number of minutes >= 1 (create and update) |
| `8ae40453` | 2026-10-26 | Check-in email: a failed send is retried (R-CRON-007); schedule update stores the checked interval (R-BOOK-011) |
| `7de5d7a3` | 2026-10-26 | A declined cancellation hold is ledgered once (R-PAY-010) (#228) |
| `9e10ae2f` | 2026-10-26 | status board + code map |
| `5e59c031` | 2026-10-26 | Cutoff hold: a concurrent charge of the same key is not a decline |
| `31dad15d` | 2026-10-26 | A declined cancellation hold is ledgered once (R-PAY-010) |
| `35cdba79` | 2026-10-26 | Two cancels at once free a booking's seats once; settings PATCH never returns the raw Course row (#227) |
| `61de211b` | 2026-10-26 | status board + code map |
| `22bff0bb` | 2026-10-26 | Losing cancel refunds a late fee it charged, on the record; a waived hold refund is reflected on the booking |
| `3344fa17` | 2026-10-26 | Two cancels at once free a booking's seats once (R-BOOK-002); settings/course PATCH never return the raw Course row (R-AUTH-010) |
| `b06da63e` | 2026-10-26 | /book: Stripe loads on the golfer's first touch of the form; modified-booking email rate limited (#226) |
| `eb9b36f9` | 2026-10-26 | status board + code map |
| `4474a823` | 2026-10-26 | /book loads Stripe on the golfer's first touch of the form; modified-booking email rate limited (G13-a) |
| `09fd1b9d` | 2026-10-26 | Owner controls: course alert permission, owner-only time zone and type, member session 7 days, perf check on the PR build (#224) |
| `76bbb431` | 2026-10-26 | perf-audit header: LCP is report-only on a local build |
| `a75c138f` | 2026-10-26 | Perf check on the PR build: LCP reported, not enforced; one warm-up load per page |
| `9f74c0c1` | 2026-10-26 | Admin → Security: sign-in log, attack alerts, Sentry errors, protections checklist (SEC-3) (#225) |
| `a247189b` | 2026-10-26 | perf seed refuses a non-local database |
| `6f618338` | 2026-10-26 | status board + code map |
| `ef437d10` | 2026-10-26 | perf seed: a no-fee course, so /book is audited on the no-card path |
| `b5d26e20` | 2026-10-26 | Owner controls: course alert permission + cap, timezone/type owner-only, member session 7 days, perf check on the PR build |
| `04522eb0` | 2026-10-26 | Money fixes from the review ledger + the money walk script (#223) |
| `224b231c` | 2026-10-26 | status board + code map |
| `a8a925d4` | 2026-10-26 | Late cancel racing the cron's hold charge: wait and replay instead of failing |
| `a904586f` | 2026-10-26 | Sentry 8 → 11, nothing personal collected, zero package flaws (SEC-2) (#222) |
| `6c9f3077` | 2026-10-26 | Money fixes from the review ledger: no-show party change, still coming, paid rounds, hold race, late arrival |
| `2ff16fa2` | 2026-10-25 | Security: patch Next.js, security headers, package scan in CI (SEC-1) (#213) |
| `00d53d10` | 2026-10-26 | docs: money walk script for the register, cash and card reader |
| `47e5fb0f` | 2026-10-25 | CASH-1: no more "paid at the counter" — paid online, or rung up in store (#212) |
| `719895d0` | 2026-10-25 | POS-3 R4: end-of-day close-out — count the drawer (#211) |
| `02782990` | 2026-10-24 | POS-3 R3b: a group's round paid on the card reader (#210) |
| `068ac2b6` | 2026-10-24 | POS-3 R3a: Stripe card reader at the register (shop items) (#209) |
| `c8e0e662` | 2026-10-24 | FEE-AT-BOOKING-2: pre-flip checklist (flag still off) (#208) |
| `9985445e` | 2026-10-24 | FEE-AT-BOOKING: charge GreenReserve's $1.50/player when the golfer books (built off) (#207) |
| `2e01ec99` | 2026-10-24 | POS-3 R2: green fees at the register — today's groups and walk-ins paid in cash with shop items (#206) |
| `ed10fa0c` | 2026-10-23 | POS-3 R1: the register — scan, custom amounts, discounts, cash change, receipts, refunds (#205) |
| `6fd9158d` | 2026-10-23 | CART-1: walking and cart prices in the Schedule price table (weekday/weekend) (#204) |
| `6d7bf2a5` | 2026-10-23 | Events: guaranteed headcount for organizer events — due N days before, bill the higher of the guarantee or the list (#203) |
| `fbacc529` | 2026-10-23 | Events: who pays the course (organizer or each player); one sign-up link replaces texting every player (#202) |
| `592f05f4` | 2026-10-24 | schedule-plan-db-test: expect the weekend fee on a Saturday or Sunday |
| `4b6af6fe` | 2026-10-24 | contact-email-test: spacing |
| `e53daa8e` | 2026-10-24 | MAIL-1: agreements name admin@ instead of the Outlook inbox |
| `978a3da2` | 2026-10-23 | Retire the admin Activity page (AW-12) (#200) |
| `d2b41f27` | 2026-10-23 | Regenerate the status board |
| `d6efdc1b` | 2026-10-23 | Accepting the agreement succeeds for a course built by hand (the timeline line is history, not the record) |
| `85bb9160` | 2026-10-23 | The Operator Agreement prompt reads the signed rows, so a course built by hand that signed isn't asked again |
| `3148eed2` | 2026-10-22 | Money: Needs you — declined cards with a pay link (DASH-C) (#198) |
| `3c88148d` | 2026-10-22 | Course dashboard tabs: full width and one title style (DASH-C step 3) (#196) |
| `946d4a54` | 2026-10-23 | The tucked assistant tab says Assistant; a test that the widget never shows the word Birdie |
| `a5789298` | 2026-10-23 | Screenshots review: the assistant shot uses the real pay-link card and only what its tee-sheet tool sees; the assistant is renamed in the product (Cam: no "Birdie" anywhere a course sees); a test for the pay-page fee line |
| `966741b9` | 2026-10-22 | Course dashboard search: find a golfer, booking or member from the menu (#195) |
| `dd3cfd14` | 2026-10-23 | Product screenshots: three feature rows on the homepage, shots on /teesheet, seed + capture scripts; no $0.00 fee line on the pay page; sign-up card says when there's no player limit |
| `e0bc004d` | 2026-10-22 | Course dashboard Home (DASH-C step 2): today, Needs you, money, coming up (#194) |
| `4b621c06` | 2026-10-22 | Regenerate status board |
| `04301cec` | 2026-10-22 | W2-9d review: lapsing holds only through the session's course; void sign-up links say why; public page only for live courses |
| `2734cbdb` | 2026-10-22 | W2-9d: event sign-up page — groups up to 4, course questions, waiting list, pay now with a 30-minute hold or pay later |

**Meaning:** work shipped that the queue does not know about. Either record the run, or check the box.

## In flight

- **ROADMAP-1 — Cam 2026-10-07: build beyond the tee sheet, AI/BI first. The plan, order and open decisions live in `PLATFORM_ROADMAP_SPEC.md`: BI-1 monthly AI review (BUILT) → ACT-1 move a group → ACT-2 ** — `RUN_QUEUE.md:47`
  - PARTIALLY BUILT — shipped: BI-1 #92, ACT-1 #93, ACT-2 #94, MSG-1 v1 #95, SHEET-2 #97–99, POS-1a #106. Now: POS-1b. After launch: OUT-1, FB-1, PWA-1.

## Built but not signed off

Open checkbox **because the review has not run**, not because the code is missing.
This is the distinction a raw checkbox count gets wrong.

| item | shipped | age | commit | source |
|---|---|---|---|---|
| BUG: orphan banner loops forever — BUILT b88c8bf — CAM: open /admin/courses → acknowledged orphans → Force del | 2026-07-22 | 96d | `b88c8bf3` | `RUN_QUEUE.md:2357` |

## Not started — the actual queue

1. WALKS — CAM: live walks before launch (code merged; each needs real Stripe/Resend/phone). — `RUN_QUEUE.md:49`
2. RV-LEDGER — Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checke — `RUN_QUEUE.md:56`
3. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:235`
4. CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:338`
5. SETUP — CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars; verify on /admin/system. Blob and Birdie done. — `RUN_QUEUE.md:2993`

## Waiting on you (not on a build)

- CAM: live walks before launch (code merged — `RUN_QUEUE.md:49`
- Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checked against th — `RUN_QUEUE.md:56`
- Cam: which business address to publish, and confirming the Terms' governing law moves from New Jersey to New York (LLC is NY) — `RUN_QUEUE.md:235`
- CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf course name") to the demo event, so homepage demo inquiries arrive  — `RUN_QUEUE.md:338`
- CAM: open /admin/courses → acknowledged orphans → Force delete DaisyLinks (or fold into the PRELAUNCH purge) Loop fix is code-verified: sweepOrphanCourses skips archived [ORPHAN] c — `RUN_QUEUE.md:2357`
- CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars — `RUN_QUEUE.md:2993`

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
| `CLAUDE.md` | 1 | 2026-10-26 | 0d |
| `PLATFORM_ROADMAP_SPEC.md` | 1 | 2026-10-20 | 5d |
| `STAFF_POLICY_SPEC.md` | 0 | 2026-10-26 | 0d |
| `OPERATOR_REWORK_SPEC.md` | 0 | 2026-10-25 | 1d |
| `ADMIN_V5_SPEC.md` | 0 | 2026-10-23 | 3d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-23 | 3d |
| `AGREEMENT_SPEC.md` | 0 | 2026-10-22 | 4d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-10-22 | 4d |
| `ONBOARDING_SPEC.md` | 0 | 2026-10-22 | 4d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-10-22 | 4d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-10-22 | 4d |
| `RECEIPT_SPEC.md` | 0 | 2026-10-22 | 4d |
| `ADMIN_MASTER_PLAN.md` | 0 | 2026-10-20 | 5d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-10-20 | 5d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-10-20 | 5d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-10-20 | 5d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-10-20 | 5d |
| `ARCHITECTURE.md` | 0 | 2026-10-20 | 5d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-10-20 | 5d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-10-20 | 5d |
| `CODEMAP_SPEC.md` | 0 | 2026-10-20 | 5d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-10-20 | 5d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-10-20 | 5d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-10-20 | 5d |
| `FB2_COPY_SPEC.md` | 0 | 2026-10-20 | 5d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-10-20 | 5d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-10-20 | 5d |
| `GOLFER_SPEC.md` | 0 | 2026-10-20 | 5d |
| `HARDENING_SPEC.md` | 0 | 2026-10-20 | 5d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-10-20 | 5d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-10-20 | 5d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-10-20 | 5d |
| `PRIVATE_BILLING_SPEC.md` | 0 | 2026-10-20 | 5d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-10-20 | 5d |
| `REVIEW_SPEC.md` | 0 | 2026-10-20 | 5d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-10-20 | 5d |
| `UI_REVISE_SPEC.md` | 0 | 2026-10-20 | 5d |

## Recent commits

- `199951b0` 2026-10-26 — Reply step: not after a talked or skipped call; a reply only counts in its own stage; Needs you says reply
- `50991cf1` 2026-10-26 — Reply to a course from the admin; a new question is your move until you reply; the new-question alert leads with the question
- `3fac48ef` 2026-10-26 — /for-courses: one column, no price line, no FAQ; thanks screens keep the header and say one thing
- `d186b39b` 2026-10-26 — Refunds switch: drop 'back to the card' (shop refunds can be cash); status board + code map
- `dbfb8d87` 2026-10-26 — Staff switches: refunds says what it gates, no Stripe connect button for staff, 'Charge a fee by hand' removed (R-AUTH-007)
- `eb9b40b1` 2026-10-26 — Admin Problems: failed refunds and declined cancellation holds (R-PAY-010) (#230)
- `3ef0e1ea` 2026-10-26 — status board + code map
- `c2f1007c` 2026-10-26 — Bump actions/checkout from 4 to 7 (#215)
- `f0b52217` 2026-10-26 — A no-show fee refunded by hand after a failed refund is recorded as a no-show fee refund
- `28e1481e` 2026-10-26 — status board + code map
- `2e541f71` 2026-10-26 — Failed refunds stay a Problem until refunded; a dashboard refund of a race-path charge is recorded
- `0197ea86` 2026-10-26 — Admin Problems: a failed refund and a declined cancellation hold (R-PAY-010)

---

**Totals:** 298 done · 1 awaiting review · 1 in flight · 5 not started · 7 revise pages open · 17 ideas · 7 parked.
