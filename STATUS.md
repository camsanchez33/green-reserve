# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-10-08 01:46 UTC · branch `claude/move-checked-in` · HEAD `1e44ba5` · working tree **2 dirty file(s)**

## ⚠ Drift — git and the queue disagree

`RUN_QUEUE.md` was last committed **2026-10-07**. 5 commit(s) since then are not mentioned anywhere in it:

| commit | date | subject |
|---|---|---|
| `1e44ba5` | 2026-10-08 | Refuse moving a checked-in round from an earlier day |
| `99c9f2c` | 2026-10-08 | Staff can move a group that has already checked in |
| `fef4012` | 2026-10-07 | MSG-1: courses message the golfers booked on a day (#95) |
| `f4b4a0b` | 2026-10-07 | ACT-2: Birdie drafts tee-sheet changes (move, block times, add booking, pay link) (#94) |
| `90e1375` | 2026-10-07 | ACT-1: move a group to another tee time (one shared move for staff, golfer swap, frost delay) (#93) |

**Meaning:** work shipped that the queue does not know about. Either record the run, or check the box.

### Uncommitted working tree (2 file(s))

- `M docs/CODEMAP.md`
- `M docs/codemap.json`

Queue header rule: dirty docs get **committed**, dirty source gets discarded — but check what
these actually are first.

## In flight

- **BUG: orphan banner loops forever — PARTIALLY BUILT (b88c8bf), NOT YET** — `RUN_QUEUE.md:2338`
  - FULLY VERIFIED — see below before checking this off. LOOP FIX (done, code-verified): sweepOrphanCourses now skips any course that's already archived + carries the [ORPHAN] flag — it used to keep reporting it forever because "no linked inquiry" never becomes false on its own. New listAcknowledgedOrphans() surfaces already-handled orphans passively (no banner) on /admin/courses instead of hiding the
  - Last session's raw Prisma script (a read-only check confirming Fake
  - Fairways existed) got blocked by this sandbox's auto-mode classifier as a potential production-database access outside the app's own authenticated API. That block is almost certainly the intended, correct behavior — a raw script has no place touching real course/booking/ operator data, authorized or not — so I did NOT retry it, and built the override into the sanctioned admin API instead, per the 
  - I have no admin login credentials to trigger the sanctioned API myself
  - either (no seed/bootstrap admin account exists in this repo).
  - So: the button exists and is ready, but DaisyLinks has NOT actually
  - been deleted. Cam (or Cowork with real admin access) needs to open /admin/courses, find DaisyLinks under "acknowledged orphans," type its name, and click Force delete permanently — or explicitly grant a Bash permission rule if script-based execution is preferred instead. STILL TO VERIFY once that click happens: DaisyLinks gone from courses, Revenue, Activity, and Overview; banner gone; reload ×3 →

## Built but not signed off

Open checkbox **because the review has not run**, not because the code is missing.
This is the distinction a raw checkbox count gets wrong.

| item | shipped | age | commit | source |
|---|---|---|---|---|
| MP-0 — shell fixes (was ADMIN_V4 V4-1): MainOffset one-liner for /admin | 2026-08-29 | 39d | `7246a62` | `RUN_QUEUE.md:984` |
| MP-1 | 2026-08-29 | 38d | `41f5ea8` | `RUN_QUEUE.md:1014` |
| MP-1b — HOTFIX after /gr-review MP-1, SHIPPED 4ef11dd. Box open until | 2026-08-29 | 38d | `4ef11dd` | `RUN_QUEUE.md:1049` |
| MP-2 | 2026-08-29 | 38d | `958f229` | `RUN_QUEUE.md:1090` |
| MP-2b | 2026-08-29 | 38d | `a134af5` | `RUN_QUEUE.md:1127` |
| MP-2c | 2026-08-29 | 38d | `e5b5413` | `RUN_QUEUE.md:1176` |
| MP-2d | 2026-08-29 | 38d | `22d0f68` | `RUN_QUEUE.md:1224` |
| MP-2e | 2026-08-30 | 38d | `bf3bcb2` | `RUN_QUEUE.md:1266` |
| SD-8d — browser Back still discards unsaved Settings edits (from the | — | — | — | `RUN_QUEUE.md:819` |
| SD-8e — status is rendered as bare coloured text where the design | — | — | — | `RUN_QUEUE.md:845` |
| SD-9c — auth: (1) staff password recovery — CourseStaff has no reset | — | — | — | `RUN_QUEUE.md:922` |
| BUG: 56 of 59 email senders report success when Resend rejects the send | — | — | — | `RUN_QUEUE.md:943` |
| MP-5e part 3 — the Overview relationship feed (notes + settings | — | — | — | `RUN_QUEUE.md:1586` |
| UI REVISE — see UI_REVISE_SPEC.md (decision record 2026-09-04/05: two looks by audience, Clubhouse structure,  | — | — | — | `RUN_QUEUE.md:2499` |
| BUG: inquiry submissions send no emails | — | — | — | `RUN_QUEUE.md:2857` |
| BUG: perf audit crashed on every page | — | — | — | `RUN_QUEUE.md:2882` |
| RV-1 — forgot-password abuse (from /gr-review 2026-09-29, security MEDIUM). | — | — | — | `RUN_QUEUE.md:2893` |
| RV-2 — review follow-ups, small (from /gr-review 2026-09-29): | — | — | — | `RUN_QUEUE.md:2903` |
| CAL-2 — Cal.com is the ONLY call scheduler | — | — | — | `RUN_QUEUE.md:3124` |
| BUG: hello@greenreserve.app takes no mail | — | — | — | `RUN_QUEUE.md:3156` |
| CAL-1 — Cal.com as the call scheduler | — | — | — | `RUN_QUEUE.md:3174` |

## Not started — the actual queue

1. ROADMAP-1 — Cam 2026-10-07: build beyond the tee sheet, AI/BI first. The plan, order and open decisions live in `PLATFORM_ROADMAP_SPEC.md`: BI-1 monthly AI review (BUILT) → ACT-1 m — `RUN_QUEUE.md:29`
2. CARD-1 (BUILT 2026-10-05) — Cam 2026-10-05: "there still isnt a way for the course to not require a card at checkout ... they dont get the pay link until whatever time they set bef — `RUN_QUEUE.md:30`
3. PERS-1 (MERGED #65) · BIRDIE-B4b (BUILT 2026-10-05 — proposals.ts + ConfirmCard, allow-listed routes, birdie.applied log, 14 more isolation checks) · BIRDIE-B4a (MERGED #66, BUILT  — `RUN_QUEUE.md:31`
4. TYPE-2 — strip the AI tells Cam listed 2026-10-05, zero behavior, one run per — `RUN_QUEUE.md:59`
5. TYPE-3 — icons only where they do a job (Cam approved 2026-10-05: "Ok — `RUN_QUEUE.md:107`
6. /dashboard — folded into the CLUB-3 shell rebuild (below). — `RUN_QUEUE.md:114`
7. /admin — `RUN_QUEUE.md:115`
8. CLUB — the "club direction" (Cam 2026-10-05, after clubup.com: "see now — `RUN_QUEUE.md:116`
9. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:206`
10. SP-A — staff permissions (STAFF_POLICY_SPEC.md Part A). Cam 2026-10-04: course owner decides, — `RUN_QUEUE.md:243`
11. SP-B — cancellation & card policy (STAFF_POLICY_SPEC.md Part B): fee basis per booking/player, — `RUN_QUEUE.md:252`
12. WX-1 — Weather button on the Tee Sheet (Cam 2026-10-01: "do the weather button with both — `RUN_QUEUE.md:262`
13. AN-1 — dashboard refactor + full Analytics tab — built 2026-10-01 (box reopened by — `RUN_QUEUE.md:267`
14. CAM — Cal.com: add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:308`
15. SD-7b — assets, BLOCKED ON CAM: three real dashboard screenshots into — `RUN_QUEUE.md:706`
16. MP-3 ORIGINAL SPEC (superseded by the above, kept for reference) — — `RUN_QUEUE.md:1384`
17. MP-4 — pipeline reshape (split into 4a/4b/4c) — `RUN_QUEUE.md:1391`
18. MP-4f — retire the JSON-in-actorName pattern. Three separate things — `RUN_QUEUE.md:1474`
19. MP-5 — courses reshape (split into 5a–5e, ordered by what is wrong — `RUN_QUEUE.md:1503`
20. Golfer course directory (`/courses`) — NOT scheduled. If Cam wants — `RUN_QUEUE.md:1582`
21. MP-6 — money reshape (split into 6a–6d, ordered by what is wrong today) — `RUN_QUEUE.md:1619`
22. MP-7 — comms merge (split into 7a–7b) — `RUN_QUEUE.md:1691`
23. MP-7b — announcement storage + thread lifecycle (SCHEMA CHANGE, — `RUN_QUEUE.md:1709`
24. MP-8 — chrome + System (split into 8a–8b) — `RUN_QUEUE.md:1731`
25. MP-8b — live cron dots (SCHEMA CHANGE, ATTENDED): CronRunLog table — `RUN_QUEUE.md:1748`
26. MP-11 — auth guard into the layout (was ADMIN_V4 V4-7; split 11a–11b) — `RUN_QUEUE.md:1829`
27. Tiny run: legal entity name fill-in (no migration) — Cam 2026-09-15: SKIP until counsel confirms the formation state. — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + / — `RUN_QUEUE.md:1935`
28. SECURITY follow-on (951433d; review fixes 30385cd) — BUILT + REVIEWED — `RUN_QUEUE.md:2541`
29. SD-11 (cfeb2e1; review fixes 2432aa8) — BUILT + REVIEWED 2026-09-17, box — `RUN_QUEUE.md:2654`
30. PB — private-club billing (PRIVATE_BILLING_SPEC.md). DECIDED Cam 2026-09-29: — `RUN_QUEUE.md:2998`
31. SETUP (Cam 2026-09-29: "we need to do blob storage, birdie ai … we also need — `RUN_QUEUE.md:3003`
32. EV-1 — BookingEvent append-only event log (SCHEMA CHANGE, ATTENDED) — `RUN_QUEUE.md:3198`
33. EV-2 — operator analytics reports — NOT SCHEDULED, DO NOT BUILD YET — `RUN_QUEUE.md:3372`

## Waiting on you (not on a build)

- Cam: which business address to publish, and confirming the Terms' governing law moves from New Jersey to New York (LLC is NY) — `RUN_QUEUE.md:206`
- CAM: three real dashboard screenshots into public/screenshots/ (empty, so the homepage shows three grey placeholder boxes) and a seeded demo course slug for DEMO_COURSE_SLUGS (empt — `RUN_QUEUE.md:706`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1049`
- Cam's approval for a prod backfill — `RUN_QUEUE.md:1090`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1127`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1176`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1224`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1266`
- Cam's approval) — `RUN_QUEUE.md:1474`
- Cam: "keep going with the queue") — `RUN_QUEUE.md:1709`
- CAM: confirm the state before this runs — e — `RUN_QUEUE.md:1935`
- pending Cam's walk below — `RUN_QUEUE.md:2654`
- Cam: "after submitting an inquiry they aren't getting sent an email — `RUN_QUEUE.md:2857`
- Cam: "there should be no google calendar thing" and, after setting both env vars and redeploying, "it is just the same as before" — `RUN_QUEUE.md:3124`
- Cam: "all emails need to go to thegreenreserve@outlook — `RUN_QUEUE.md:3156`
- Cam: invite link showed "I can't show my calendar right now" — `RUN_QUEUE.md:3174`
- Cam: "keep going with whatever is next") — `RUN_QUEUE.md:3198`

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

## Spec inventory

`open refs` = how many open queue items still point at this spec. Zero + old = fully consumed.

| spec | open refs | last touched | age |
|---|---|---|---|
| `CLAUDE.md` | 7 | 2026-10-08 | 0d |
| `ARCHITECTURE.md` | 4 | 2026-09-29 | 8d |
| `STAFF_POLICY_SPEC.md` | 2 | 2026-10-04 | 3d |
| `UI_REVISE_SPEC.md` | 2 | 2026-10-01 | 6d |
| `PLATFORM_ROADMAP_SPEC.md` | 1 | 2026-10-08 | 0d |
| `ADMIN_MASTER_PLAN.md` | 1 | 2026-09-29 | 8d |
| `PRIVATE_BILLING_SPEC.md` | 1 | 2026-09-29 | 8d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-06 | 0d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-10-05 | 2d |
| `REVIEW_SPEC.md` | 0 | 2026-10-05 | 2d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-09-29 | 8d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-09-29 | 8d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-09-29 | 8d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-09-29 | 8d |
| `AGREEMENT_SPEC.md` | 0 | 2026-09-29 | 8d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-09-29 | 8d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-09-29 | 8d |
| `CODEMAP_SPEC.md` | 0 | 2026-09-29 | 8d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-09-29 | 8d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-09-29 | 8d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-09-29 | 8d |
| `FB2_COPY_SPEC.md` | 0 | 2026-09-29 | 8d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-09-29 | 8d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-09-29 | 8d |
| `GOLFER_SPEC.md` | 0 | 2026-09-29 | 8d |
| `HARDENING_SPEC.md` | 0 | 2026-09-29 | 8d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-09-29 | 8d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-09-29 | 8d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-09-29 | 8d |
| `ONBOARDING_SPEC.md` | 0 | 2026-09-29 | 8d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-09-29 | 8d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-09-29 | 8d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-09-29 | 8d |
| `RECEIPT_SPEC.md` | 0 | 2026-09-29 | 8d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-09-29 | 8d |

## Recent commits

- `1e44ba5` 2026-10-08 — Refuse moving a checked-in round from an earlier day
- `99c9f2c` 2026-10-08 — Staff can move a group that has already checked in
- `fef4012` 2026-10-07 — MSG-1: courses message the golfers booked on a day (#95)
- `f4b4a0b` 2026-10-07 — ACT-2: Birdie drafts tee-sheet changes (move, block times, add booking, pay link) (#94)
- `90e1375` 2026-10-07 — ACT-1: move a group to another tee time (one shared move for staff, golfer swap, frost delay) (#93)
- `14b40dd` 2026-10-07 — BI-1: monthly AI review of each course's previous month (#92)
- `0a54482` 2026-10-06 — Homepage rebuilt to Cam's layout, accurate demo, new /teesheet page (#91)
- `2d1a02c` 2026-10-06 — No-show charges taken at the course's midnight, not when marked (#90)
- `41e61b3` 2026-10-06 — Manage page says what cancelling costs right now (#89)
- `f541b7c` 2026-10-06 — A hold not yet taken is charged when the golfer cancels late (#87)
- `bc65c9f` 2026-10-06 — Receipt shows what actually reached the golfer's card (#88)
- `d19d5cb` 2026-10-06 — Self check-in speaks to the golfer and handles cancelled and cash rounds (R-GOLF-011) (#86)

---

**Totals:** 238 done · 21 awaiting review · 1 in flight · 33 not started · 8 revise pages open · 15 ideas · 2 parked.
