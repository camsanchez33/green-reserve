# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-10-05 19:58 UTC · branch `claude/eager-maxwell-qf1pd0` · HEAD `1976c6e` · working tree **5 dirty file(s)**

## ⚠ Drift — git and the queue disagree

None. Every commit since the last queue edit is recorded in `RUN_QUEUE.md`.

### Uncommitted working tree (5 file(s))

- `M CLAUDE.md`
- `M RUN_QUEUE.md`
- `M docs/CODEMAP.md`
- `M docs/codemap.json`
- `M src/app/dashboard/settings/page.tsx`

**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply
the queue header's `git checkout -- .` cleanup until that run has committed, or the work is gone.

## In flight

- **BUG: orphan banner loops forever — PARTIALLY BUILT (b88c8bf), NOT YET** — `RUN_QUEUE.md:2337`
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
| MP-0 — shell fixes (was ADMIN_V4 V4-1): MainOffset one-liner for /admin | 2026-08-29 | 36d | `7246a62` | `RUN_QUEUE.md:983` |
| MP-1 | 2026-08-29 | 36d | `41f5ea8` | `RUN_QUEUE.md:1013` |
| MP-1b — HOTFIX after /gr-review MP-1, SHIPPED 4ef11dd. Box open until | 2026-08-29 | 36d | `4ef11dd` | `RUN_QUEUE.md:1048` |
| MP-2 | 2026-08-29 | 36d | `958f229` | `RUN_QUEUE.md:1089` |
| MP-2b | 2026-08-29 | 36d | `a134af5` | `RUN_QUEUE.md:1126` |
| MP-2c | 2026-08-29 | 36d | `e5b5413` | `RUN_QUEUE.md:1175` |
| MP-2d | 2026-08-29 | 36d | `22d0f68` | `RUN_QUEUE.md:1223` |
| MP-2e | 2026-08-30 | 36d | `bf3bcb2` | `RUN_QUEUE.md:1265` |
| SECURITY follow-on (951433d; review fixes 30385cd) — BUILT + REVIEWED | 2026-09-16 | 19d | `951433d` | `RUN_QUEUE.md:2540` |
| SD-11 (cfeb2e1; review fixes 2432aa8) — BUILT + REVIEWED 2026-09-17, box | 2026-09-17 | 18d | `cfeb2e1` | `RUN_QUEUE.md:2653` |
| SD-8d — browser Back still discards unsaved Settings edits (from the | 2026-09-28 | 7d | `70a424e` | `RUN_QUEUE.md:818` |
| SD-8e — status is rendered as bare coloured text where the design | 2026-09-29 | 6d | `9d6dc6a` | `RUN_QUEUE.md:844` |
| SD-9c — auth: (1) staff password recovery — CourseStaff has no reset | 2026-09-29 | 6d | `0d84aaf` | `RUN_QUEUE.md:921` |
| BUG: 56 of 59 email senders report success when Resend rejects the send | 2026-09-29 | 6d | `209e652` | `RUN_QUEUE.md:942` |
| MP-5e part 3 — the Overview relationship feed (notes + settings | 2026-09-29 | 6d | `c6a2142` | `RUN_QUEUE.md:1585` |
| BUG: inquiry submissions send no emails | 2026-09-28 | 6d | `8b9a046` | `RUN_QUEUE.md:2856` |
| BUG: perf audit crashed on every page | 2026-09-29 | 6d | `dd7056a` | `RUN_QUEUE.md:2881` |
| RV-1 — forgot-password abuse (from /gr-review 2026-09-29, security MEDIUM). | 2026-09-29 | 6d | `f57f269` | `RUN_QUEUE.md:2892` |
| RV-2 — review follow-ups, small (from /gr-review 2026-09-29): | 2026-09-29 | 6d | `0eab366` | `RUN_QUEUE.md:2902` |
| CAL-2 — Cal.com is the ONLY call scheduler | 2026-09-29 | 6d | `e082dd0` | `RUN_QUEUE.md:3123` |
| BUG: hello@greenreserve.app takes no mail | 2026-09-29 | 6d | `371ffff` | `RUN_QUEUE.md:3155` |
| CAL-1 — Cal.com as the call scheduler | 2026-09-29 | 6d | `a5ed9d7` | `RUN_QUEUE.md:3173` |
| UI REVISE — see UI_REVISE_SPEC.md (decision record 2026-09-04/05: two looks by audience, Clubhouse structure,  | — | — | — | `RUN_QUEUE.md:2498` |

## Not started — the actual queue

1. CARD-1 (BUILT 2026-10-05) — Cam 2026-10-05: "there still isnt a way for the course to not require a card at checkout ... they dont get the pay link until whatever time they set bef — `RUN_QUEUE.md:29`
2. PERS-1 (MERGED #65) · BIRDIE-B4b (BUILT 2026-10-05 — proposals.ts + ConfirmCard, allow-listed routes, birdie.applied log, 14 more isolation checks) · BIRDIE-B4a (MERGED #66, BUILT  — `RUN_QUEUE.md:30`
3. TYPE-2 — strip the AI tells Cam listed 2026-10-05, zero behavior, one run per — `RUN_QUEUE.md:58`
4. TYPE-3 — icons only where they do a job (Cam approved 2026-10-05: "Ok — `RUN_QUEUE.md:106`
5. /dashboard — folded into the CLUB-3 shell rebuild (below). — `RUN_QUEUE.md:113`
6. /admin — `RUN_QUEUE.md:114`
7. CLUB — the "club direction" (Cam 2026-10-05, after clubup.com: "see now — `RUN_QUEUE.md:115`
8. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:205`
9. SP-A — staff permissions (STAFF_POLICY_SPEC.md Part A). Cam 2026-10-04: course owner decides, — `RUN_QUEUE.md:242`
10. SP-B — cancellation & card policy (STAFF_POLICY_SPEC.md Part B): fee basis per booking/player, — `RUN_QUEUE.md:251`
11. WX-1 — Weather button on the Tee Sheet (Cam 2026-10-01: "do the weather button with both — `RUN_QUEUE.md:261`
12. AN-1 — dashboard refactor + full Analytics tab — built 2026-10-01 (box reopened by — `RUN_QUEUE.md:266`
13. CAM — Cal.com: add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:307`
14. SD-7b — assets, BLOCKED ON CAM: three real dashboard screenshots into — `RUN_QUEUE.md:705`
15. MP-3 ORIGINAL SPEC (superseded by the above, kept for reference) — — `RUN_QUEUE.md:1383`
16. MP-4 — pipeline reshape (split into 4a/4b/4c) — `RUN_QUEUE.md:1390`
17. MP-4f — retire the JSON-in-actorName pattern. Three separate things — `RUN_QUEUE.md:1473`
18. MP-5 — courses reshape (split into 5a–5e, ordered by what is wrong — `RUN_QUEUE.md:1502`
19. Golfer course directory (`/courses`) — NOT scheduled. If Cam wants — `RUN_QUEUE.md:1581`
20. MP-6 — money reshape (split into 6a–6d, ordered by what is wrong today) — `RUN_QUEUE.md:1618`
21. MP-7 — comms merge (split into 7a–7b) — `RUN_QUEUE.md:1690`
22. MP-7b — announcement storage + thread lifecycle (SCHEMA CHANGE, — `RUN_QUEUE.md:1708`
23. MP-8 — chrome + System (split into 8a–8b) — `RUN_QUEUE.md:1730`
24. MP-8b — live cron dots (SCHEMA CHANGE, ATTENDED): CronRunLog table — `RUN_QUEUE.md:1747`
25. MP-11 — auth guard into the layout (was ADMIN_V4 V4-7; split 11a–11b) — `RUN_QUEUE.md:1828`
26. Tiny run: legal entity name fill-in (no migration) — Cam 2026-09-15: SKIP until counsel confirms the formation state. — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + / — `RUN_QUEUE.md:1934`
27. PB — private-club billing (PRIVATE_BILLING_SPEC.md). DECIDED Cam 2026-09-29: — `RUN_QUEUE.md:2997`
28. SETUP (Cam 2026-09-29: "we need to do blob storage, birdie ai … we also need — `RUN_QUEUE.md:3002`
29. EV-1 — BookingEvent append-only event log (SCHEMA CHANGE, ATTENDED) — `RUN_QUEUE.md:3197`
30. EV-2 — operator analytics reports — NOT SCHEDULED, DO NOT BUILD YET — `RUN_QUEUE.md:3371`

## Waiting on you (not on a build)

- Cam: which business address to publish, and confirming the Terms' governing law moves from New Jersey to New York (LLC is NY) — `RUN_QUEUE.md:205`
- CAM: three real dashboard screenshots into public/screenshots/ (empty, so the homepage shows three grey placeholder boxes) and a seeded demo course slug for DEMO_COURSE_SLUGS (empt — `RUN_QUEUE.md:705`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1048`
- Cam's approval for a prod backfill — `RUN_QUEUE.md:1089`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1126`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1175`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1223`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1265`
- Cam's approval) — `RUN_QUEUE.md:1473`
- Cam: "keep going with the queue") — `RUN_QUEUE.md:1708`
- CAM: confirm the state before this runs — e — `RUN_QUEUE.md:1934`
- pending Cam's walk below — `RUN_QUEUE.md:2653`
- Cam: "after submitting an inquiry they aren't getting sent an email — `RUN_QUEUE.md:2856`
- Cam: "there should be no google calendar thing" and, after setting both env vars and redeploying, "it is just the same as before" — `RUN_QUEUE.md:3123`
- Cam: "all emails need to go to thegreenreserve@outlook — `RUN_QUEUE.md:3155`
- Cam: invite link showed "I can't show my calendar right now" — `RUN_QUEUE.md:3173`
- Cam: "keep going with whatever is next") — `RUN_QUEUE.md:3197`

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
| `CLAUDE.md` | 7 | 2026-10-05 | 0d |
| `ARCHITECTURE.md` | 4 | 2026-09-16 | 18d |
| `STAFF_POLICY_SPEC.md` | 2 | 2026-10-04 | 0d |
| `UI_REVISE_SPEC.md` | 2 | 2026-10-01 | 4d |
| `PRIVATE_BILLING_SPEC.md` | 1 | 2026-09-29 | 6d |
| `ADMIN_MASTER_PLAN.md` | 1 | 2026-09-15 | 19d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-10-05 | 0d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-05 | 0d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-09-29 | 6d |
| `FB2_COPY_SPEC.md` | 0 | 2026-09-29 | 6d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-09-29 | 6d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-09-15 | 19d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-09-15 | 19d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-09-15 | 19d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-09-15 | 19d |
| `AGREEMENT_SPEC.md` | 0 | 2026-09-15 | 19d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-09-15 | 19d |
| `CODEMAP_SPEC.md` | 0 | 2026-09-15 | 19d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-09-15 | 19d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-09-15 | 19d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-09-15 | 19d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-09-15 | 19d |
| `GOLFER_SPEC.md` | 0 | 2026-09-15 | 19d |
| `HARDENING_SPEC.md` | 0 | 2026-09-15 | 19d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-09-15 | 19d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-09-15 | 19d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-09-15 | 19d |
| `ONBOARDING_SPEC.md` | 0 | 2026-09-15 | 19d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-09-15 | 19d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-09-15 | 19d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-09-15 | 19d |
| `RECEIPT_SPEC.md` | 0 | 2026-09-15 | 19d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-09-15 | 19d |

## Recent commits

- `10d853c` 2026-10-05 — BIRDIE-B4b: Birdie drafts changes, the operator confirms
- `e65d5db` 2026-10-05 — BIRDIE-B4a: Birdie answers from live course data
- `17267d1` 2026-10-05 — PERS-1: course photo and logo on golfer pages, plus a note from the course
- `58260ec` 2026-10-05 — queue/spec update
- `e8b6902` 2026-10-05 — CLUB-5: booking flow in the club look
- `e99afbc` 2026-10-05 — CLUB-4b: admin labels in sentence case
- `dd0c049` 2026-10-05 — CLUB-4a: admin pages without decorative icons
- `56cdf9c` 2026-10-05 — CLUB-3c: the rest of the dashboard in the club look
- `b1ceb6a` 2026-10-05 — CLUB-3b: tee sheet reads like the club demo
- `f3f834e` 2026-10-05 — queue/spec update
- `d450d70` 2026-10-05 — CLUB-3 (shell, awaiting Cam): dashboard tabs across the top on desktop
- `4bc7fe0` 2026-10-05 — CLUB-2: golfer course page in the club look

---

**Totals:** 238 done · 23 awaiting review · 1 in flight · 30 not started · 8 revise pages open · 15 ideas · 2 parked.
