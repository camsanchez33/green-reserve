# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-10-17 16:37 UTC · branch `claude/hero-photo` · HEAD `806a8cd` · working tree clean

## ⚠ Drift — git and the queue disagree

None. Every commit since the last queue edit is recorded in `RUN_QUEUE.md`.

## In flight

- **ROADMAP-1 — Cam 2026-10-07: build beyond the tee sheet, AI/BI first. The plan, order and open decisions live in `PLATFORM_ROADMAP_SPEC.md`: BI-1 monthly AI review (BUILT) → ACT-1 move a group → ACT-2 ** — `RUN_QUEUE.md:47`
  - PARTIALLY BUILT — shipped: BI-1 #92, ACT-1 #93, ACT-2 #94, MSG-1 v1 #95, SHEET-2 #97–99, POS-1a #106. Now: POS-1b. After launch: OUT-1, FB-1, PWA-1.

## Built but not signed off

Open checkbox **because the review has not run**, not because the code is missing.
This is the distinction a raw checkbox count gets wrong.

| item | shipped | age | commit | source |
|---|---|---|---|---|
| BUG: orphan banner loops forever — BUILT b88c8bf — CAM: open /admin/courses → acknowledged orphans → Force del | 2026-07-22 | 86d | `b88c8bf` | `RUN_QUEUE.md:2357` |

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
| `PLATFORM_ROADMAP_SPEC.md` | 1 | 2026-10-17 | 0d |
| `CLAUDE.md` | 1 | 2026-10-11 | 5d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-17 | 0d |
| `AGREEMENT_SPEC.md` | 0 | 2026-10-11 | 5d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-10-05 | 11d |
| `REVIEW_SPEC.md` | 0 | 2026-10-05 | 11d |
| `STAFF_POLICY_SPEC.md` | 0 | 2026-10-04 | 12d |
| `UI_REVISE_SPEC.md` | 0 | 2026-10-01 | 16d |
| `ADMIN_MASTER_PLAN.md` | 0 | 2026-09-29 | 17d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-09-29 | 17d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-09-29 | 17d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-09-29 | 17d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-09-29 | 17d |
| `ARCHITECTURE.md` | 0 | 2026-09-29 | 17d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-09-29 | 17d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-09-29 | 17d |
| `CODEMAP_SPEC.md` | 0 | 2026-09-29 | 17d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-09-29 | 17d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-09-29 | 17d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-09-29 | 17d |
| `FB2_COPY_SPEC.md` | 0 | 2026-09-29 | 17d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-09-29 | 17d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-09-29 | 17d |
| `GOLFER_SPEC.md` | 0 | 2026-09-29 | 17d |
| `HARDENING_SPEC.md` | 0 | 2026-09-29 | 17d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-09-29 | 17d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-09-29 | 17d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-09-29 | 17d |
| `ONBOARDING_SPEC.md` | 0 | 2026-09-29 | 17d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-09-29 | 17d |
| `PRIVATE_BILLING_SPEC.md` | 0 | 2026-09-29 | 17d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-09-29 | 17d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-09-29 | 17d |
| `RECEIPT_SPEC.md` | 0 | 2026-09-29 | 17d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-09-29 | 17d |

## Recent commits

- `806a8cd` 2026-10-17 — queue/spec update
- `21193df` 2026-10-17 — queue/spec update
- `0f5d200` 2026-10-17 — Homepage hero: real sunset photo in place of the AI image
- `9e4bf52` 2026-10-11 — Fix: re-sign banner stays after signing the new Operator Agreement (#107)
- `c4800f7` 2026-10-11 — POS-1a: pro-shop catalog, items charged with the round (#106)
- `5ed62ea` 2026-10-11 — Admin → System: publish agreement versions (owner with 2FA) (#105)
- `47e7320` 2026-10-11 — Operator Agreement v2026-10 live (1% membership fee, re-accept), counsel waived (#104)
- `fa1e1df` 2026-10-08 — Operator Agreement v2026-10 draft (1% membership fee), held for counsel (#103)
- `4165bc8` 2026-10-08 — Membership fee: 1% of dues, paid by the member (#102)
- `2eae475` 2026-10-08 — Homepage demo shows the board (#101)
- `718522c` 2026-10-08 — AN-2: Analytics reworked so it reads plainly (#100)
- `b7079ea` 2026-10-07 — Tee sheet: one board that fits the page, cancel from the sheet (#99)

---

**Totals:** 298 done · 1 awaiting review · 1 in flight · 5 not started · 8 revise pages open · 17 ideas · 7 parked.
