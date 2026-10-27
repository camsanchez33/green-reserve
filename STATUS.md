# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-10-27 04:12 UTC · branch `claude/practical-lovelace-xiu4u5` · HEAD `a34dd7e` · working tree **4 dirty file(s)**

## ⚠ Drift — git and the queue disagree

`RUN_QUEUE.md` was last committed **2026-10-27**. 2 commit(s) since then are not mentioned anywhere in it:

| commit | date | subject |
|---|---|---|
| `a34dd7e` | 2026-10-27 | DENSE-1 review fixes |
| `fe585cd` | 2026-10-27 | DENSE-1: Analytics — lots of data, almost no sentences |

**Meaning:** work shipped that the queue does not know about. Either record the run, or check the box.

### Uncommitted working tree (4 file(s))

- `M docs/CODEMAP.md`
- `M docs/codemap.json`
- `M scripts/words-guard.baseline.json`
- `M src/app/dashboard/analytics/page.tsx`

**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply
the queue header's `git checkout -- .` cleanup until that run has committed, or the work is gone.

## In flight

- **ROADMAP-1 — Cam 2026-10-07: build beyond the tee sheet, AI/BI first. The plan, order and open decisions live in `PLATFORM_ROADMAP_SPEC.md`: BI-1 monthly AI review (BUILT) → ACT-1 move a group → ACT-2 ** — `RUN_QUEUE.md:48`
  - PARTIALLY BUILT — shipped: BI-1 #92, ACT-1 #93, ACT-2 #94, MSG-1 v1 #95, SHEET-2 #97–99, POS-1a #106. Now: POS-1b. After launch: OUT-1, FB-1, PWA-1.

## Built but not signed off

Open checkbox **because the review has not run**, not because the code is missing.
This is the distinction a raw checkbox count gets wrong.

Nothing awaiting review.

## Not started — the actual queue

1. DENSE — Cam 2026-10-27: "too much words on the pages … think OpenTable, Stripe, Lightspeed, Toast … apply across all tabs on both dashboard and admin". Lots of data, almost no sent — `RUN_QUEUE.md:47`
2. WALKS — CAM: live walks before launch (code merged; each needs real Stripe/Resend/phone). — `RUN_QUEUE.md:50`
3. RV-LEDGER — Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checke — `RUN_QUEUE.md:57`
4. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:236`
5. CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:339`
6. BUG: orphan banner loops forever — BUILT b88c8bf — CAM: open /admin/courses → acknowledged orphans → Force delete DaisyLinks (or fold into the PRELAUNCH purge) — `RUN_QUEUE.md:2358`
7. SETUP — CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars; verify on /admin/system. Blob and Birdie done. — `RUN_QUEUE.md:2994`

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
| `CLAUDE.md` | 1 | 2026-10-27 | 0d |
| `DENSE_UI_SPEC.md` | 1 | 2026-10-27 | 0d |
| `PLATFORM_ROADMAP_SPEC.md` | 1 | 2026-10-21 | 5d |
| `STAFF_POLICY_SPEC.md` | 0 | 2026-10-26 | 0d |
| `OPERATOR_REWORK_SPEC.md` | 0 | 2026-10-25 | 1d |
| `ADMIN_V5_SPEC.md` | 0 | 2026-10-23 | 3d |
| `AGREEMENT_SPEC.md` | 0 | 2026-10-22 | 4d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-10-22 | 4d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-23 | 4d |
| `ONBOARDING_SPEC.md` | 0 | 2026-10-22 | 4d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-10-22 | 4d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-10-22 | 4d |
| `RECEIPT_SPEC.md` | 0 | 2026-10-22 | 4d |
| `ADMIN_MASTER_PLAN.md` | 0 | 2026-10-21 | 5d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-10-21 | 5d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-10-21 | 5d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-10-21 | 5d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-10-21 | 5d |
| `ARCHITECTURE.md` | 0 | 2026-10-21 | 5d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-10-21 | 5d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-10-21 | 5d |
| `CODEMAP_SPEC.md` | 0 | 2026-10-21 | 5d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-10-21 | 5d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-10-21 | 5d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-10-21 | 5d |
| `FB2_COPY_SPEC.md` | 0 | 2026-10-21 | 5d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-10-21 | 5d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-10-21 | 5d |
| `GOLFER_SPEC.md` | 0 | 2026-10-21 | 5d |
| `HARDENING_SPEC.md` | 0 | 2026-10-21 | 5d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-10-21 | 5d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-10-21 | 5d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-10-21 | 5d |
| `PRIVATE_BILLING_SPEC.md` | 0 | 2026-10-21 | 5d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-10-21 | 5d |
| `REVIEW_SPEC.md` | 0 | 2026-10-21 | 5d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-10-21 | 5d |
| `UI_REVISE_SPEC.md` | 0 | 2026-10-21 | 5d |

## Recent commits

- `a34dd7e` 2026-10-27 — DENSE-1 review fixes
- `fe585cd` 2026-10-27 — DENSE-1: Analytics — lots of data, almost no sentences
- `79316a1` 2026-10-27 — queue/spec update
- `8dec328` 2026-10-27 — queue/spec update
- `cb1c8c2` 2026-10-27 — queue/spec update
- `13634fe` 2026-10-26 — An emailed sign-in code confirms the owner's email (no separate verify link) (#236)
- `23e81ff` 2026-10-26 — Owners get a 'Set your password' link, never a password; onboarding starts with Review your page (#235)
- `4960a76` 2026-10-26 — Setup sheet: recap screen + email, honest cancellation wording, clearer days, uniform cards, resume where you left off (#234)
- `4d8194b` 2026-10-26 — See a built course's page before sending the preview (#233)
- `356403f` 2026-10-26 — Onboarding walk: leaner sign-up screens, reply to a course from the admin, new questions are your move (#232)
- `ee9402b` 2026-10-26 — Staff switches do what they say (R-AUTH-007) (#231)
- `eb9b40b` 2026-10-26 — Admin Problems: failed refunds and declined cancellation holds (R-PAY-010) (#230)

---

**Totals:** 298 done · 0 awaiting review · 1 in flight · 7 not started · 7 revise pages open · 17 ideas · 7 parked.
