# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-10-05 04:22 UTC · branch `claude/eager-maxwell-qf1pd0` · HEAD `7eda503` · working tree **26 dirty file(s)**

## ⚠ Drift — git and the queue disagree

None. Every commit since the last queue edit is recorded in `RUN_QUEUE.md`.

### Uncommitted working tree (26 file(s))

- `M CLAUDE.md`
- `M RUN_QUEUE.md`
- `M docs/CODEMAP.md`
- `M docs/codemap.json`
- `M scripts/design-guard.baseline.json`
- `M src/app/dashboard/2fa/page.tsx`
- `M src/app/dashboard/analytics/page.tsx`
- `M src/app/dashboard/forgot-password/page.tsx`
- `M src/app/dashboard/login/page.tsx`
- `M src/app/dashboard/members/page.tsx`
- `M src/app/dashboard/onboarding/page.tsx`
- `M src/app/dashboard/outings/page.tsx`
- `M src/app/dashboard/page.tsx`
- `M src/app/dashboard/reset-password/page.tsx`
- `M src/app/dashboard/schedules/page.tsx`
- `M src/app/dashboard/settings/page.tsx`
- `M src/app/dashboard/tournaments/page.tsx`
- `M src/app/dashboard/verify/page.tsx`
- `M src/components/OperatorSidebar.tsx`
- `M src/components/dashboard/CourseLayoutTab.tsx`

**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply
the queue header's `git checkout -- .` cleanup until that run has committed, or the work is gone.

## In flight

- **BUG: orphan banner loops forever — PARTIALLY BUILT (b88c8bf), NOT YET** — `RUN_QUEUE.md:2229`
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
| MP-0 — shell fixes (was ADMIN_V4 V4-1): MainOffset one-liner for /admin | 2026-08-29 | 36d | `7246a62` | `RUN_QUEUE.md:875` |
| MP-1 | 2026-08-29 | 36d | `41f5ea8` | `RUN_QUEUE.md:905` |
| MP-1b — HOTFIX after /gr-review MP-1, SHIPPED 4ef11dd. Box open until | 2026-08-29 | 36d | `4ef11dd` | `RUN_QUEUE.md:940` |
| MP-2 | 2026-08-29 | 36d | `958f229` | `RUN_QUEUE.md:981` |
| MP-2b | 2026-08-29 | 36d | `a134af5` | `RUN_QUEUE.md:1018` |
| MP-2c | 2026-08-29 | 36d | `e5b5413` | `RUN_QUEUE.md:1067` |
| MP-2d | 2026-08-29 | 36d | `22d0f68` | `RUN_QUEUE.md:1115` |
| MP-2e | 2026-08-30 | 35d | `bf3bcb2` | `RUN_QUEUE.md:1157` |
| SECURITY follow-on (951433d; review fixes 30385cd) — BUILT + REVIEWED | 2026-09-16 | 18d | `951433d` | `RUN_QUEUE.md:2432` |
| SD-11 (cfeb2e1; review fixes 2432aa8) — BUILT + REVIEWED 2026-09-17, box | 2026-09-17 | 17d | `cfeb2e1` | `RUN_QUEUE.md:2545` |
| SD-8d — browser Back still discards unsaved Settings edits (from the | 2026-09-28 | 6d | `70a424e` | `RUN_QUEUE.md:710` |
| SD-8e — status is rendered as bare coloured text where the design | 2026-09-29 | 6d | `9d6dc6a` | `RUN_QUEUE.md:736` |
| SD-9c — auth: (1) staff password recovery — CourseStaff has no reset | 2026-09-29 | 6d | `0d84aaf` | `RUN_QUEUE.md:813` |
| BUG: 56 of 59 email senders report success when Resend rejects the send | 2026-09-29 | 6d | `209e652` | `RUN_QUEUE.md:834` |
| MP-5e part 3 — the Overview relationship feed (notes + settings | 2026-09-29 | 6d | `c6a2142` | `RUN_QUEUE.md:1477` |
| BUG: inquiry submissions send no emails | 2026-09-28 | 6d | `8b9a046` | `RUN_QUEUE.md:2748` |
| BUG: perf audit crashed on every page | 2026-09-29 | 6d | `dd7056a` | `RUN_QUEUE.md:2773` |
| RV-1 — forgot-password abuse (from /gr-review 2026-09-29, security MEDIUM). | 2026-09-29 | 6d | `f57f269` | `RUN_QUEUE.md:2784` |
| RV-2 — review follow-ups, small (from /gr-review 2026-09-29): | 2026-09-29 | 6d | `0eab366` | `RUN_QUEUE.md:2794` |
| CAL-2 — Cal.com is the ONLY call scheduler | 2026-09-29 | 6d | `e082dd0` | `RUN_QUEUE.md:3015` |
| BUG: hello@greenreserve.app takes no mail | 2026-09-29 | 6d | `371ffff` | `RUN_QUEUE.md:3047` |
| CAL-1 — Cal.com as the call scheduler | 2026-09-29 | 6d | `a5ed9d7` | `RUN_QUEUE.md:3065` |
| UI REVISE — see UI_REVISE_SPEC.md (decision record 2026-09-04/05: two looks by audience, Clubhouse structure,  | — | — | — | `RUN_QUEUE.md:2390` |

## Not started — the actual queue

1. TYPE-2 — strip the AI tells Cam listed 2026-10-05, zero behavior, one run per — `RUN_QUEUE.md:36`
2. /admin - [ ] public leftovers (for-courses, call, contact, legal, — `RUN_QUEUE.md:72`
3. TYPE-3 — icons only where they do a job (back arrow, close, search): remove — `RUN_QUEUE.md:74`
4. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:97`
5. SP-A — staff permissions (STAFF_POLICY_SPEC.md Part A). Cam 2026-10-04: course owner decides, — `RUN_QUEUE.md:134`
6. SP-B — cancellation & card policy (STAFF_POLICY_SPEC.md Part B): fee basis per booking/player, — `RUN_QUEUE.md:143`
7. WX-1 — Weather button on the Tee Sheet (Cam 2026-10-01: "do the weather button with both — `RUN_QUEUE.md:153`
8. AN-1 — dashboard refactor + full Analytics tab — built 2026-10-01 (box reopened by — `RUN_QUEUE.md:158`
9. CAM — Cal.com: add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:199`
10. SD-7b — assets, BLOCKED ON CAM: three real dashboard screenshots into — `RUN_QUEUE.md:597`
11. MP-3 ORIGINAL SPEC (superseded by the above, kept for reference) — — `RUN_QUEUE.md:1275`
12. MP-4 — pipeline reshape (split into 4a/4b/4c) — `RUN_QUEUE.md:1282`
13. MP-4f — retire the JSON-in-actorName pattern. Three separate things — `RUN_QUEUE.md:1365`
14. MP-5 — courses reshape (split into 5a–5e, ordered by what is wrong — `RUN_QUEUE.md:1394`
15. Golfer course directory (`/courses`) — NOT scheduled. If Cam wants — `RUN_QUEUE.md:1473`
16. MP-6 — money reshape (split into 6a–6d, ordered by what is wrong today) — `RUN_QUEUE.md:1510`
17. MP-7 — comms merge (split into 7a–7b) — `RUN_QUEUE.md:1582`
18. MP-7b — announcement storage + thread lifecycle (SCHEMA CHANGE, — `RUN_QUEUE.md:1600`
19. MP-8 — chrome + System (split into 8a–8b) — `RUN_QUEUE.md:1622`
20. MP-8b — live cron dots (SCHEMA CHANGE, ATTENDED): CronRunLog table — `RUN_QUEUE.md:1639`
21. MP-11 — auth guard into the layout (was ADMIN_V4 V4-7; split 11a–11b) — `RUN_QUEUE.md:1720`
22. Tiny run: legal entity name fill-in (no migration) — Cam 2026-09-15: SKIP until counsel confirms the formation state. — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + / — `RUN_QUEUE.md:1826`
23. PB — private-club billing (PRIVATE_BILLING_SPEC.md). DECIDED Cam 2026-09-29: — `RUN_QUEUE.md:2889`
24. SETUP (Cam 2026-09-29: "we need to do blob storage, birdie ai … we also need — `RUN_QUEUE.md:2894`
25. EV-1 — BookingEvent append-only event log (SCHEMA CHANGE, ATTENDED) — `RUN_QUEUE.md:3089`
26. EV-2 — operator analytics reports — NOT SCHEDULED, DO NOT BUILD YET — `RUN_QUEUE.md:3263`

## Waiting on you (not on a build)

- CAM: approve — `RUN_QUEUE.md:74`
- Cam: which business address to publish, and confirming the Terms' governing law moves from New Jersey to New York (LLC is NY) — `RUN_QUEUE.md:97`
- CAM: three real dashboard screenshots into public/screenshots/ (empty, so the homepage shows three grey placeholder boxes) and a seeded demo course slug for DEMO_COURSE_SLUGS (empt — `RUN_QUEUE.md:597`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:940`
- Cam's approval for a prod backfill — `RUN_QUEUE.md:981`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1018`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1067`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1115`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1157`
- Cam's approval) — `RUN_QUEUE.md:1365`
- Cam: "keep going with the queue") — `RUN_QUEUE.md:1600`
- CAM: confirm the state before this runs — e — `RUN_QUEUE.md:1826`
- pending Cam's walk below — `RUN_QUEUE.md:2545`
- Cam: "after submitting an inquiry they aren't getting sent an email — `RUN_QUEUE.md:2748`
- Cam: "there should be no google calendar thing" and, after setting both env vars and redeploying, "it is just the same as before" — `RUN_QUEUE.md:3015`
- Cam: "all emails need to go to thegreenreserve@outlook — `RUN_QUEUE.md:3047`
- Cam: invite link showed "I can't show my calendar right now" — `RUN_QUEUE.md:3065`
- Cam: "keep going with whatever is next") — `RUN_QUEUE.md:3089`

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
| `UI_REVISE_SPEC.md` | 2 | 2026-10-01 | 3d |
| `PRIVATE_BILLING_SPEC.md` | 1 | 2026-09-29 | 5d |
| `ADMIN_MASTER_PLAN.md` | 1 | 2026-09-15 | 19d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-05 | 0d |
| `FB2_COPY_SPEC.md` | 0 | 2026-09-29 | 5d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-09-29 | 5d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-09-29 | 6d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-09-15 | 19d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-09-15 | 19d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-09-15 | 19d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-09-15 | 19d |
| `AGREEMENT_SPEC.md` | 0 | 2026-09-15 | 19d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-09-15 | 19d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-09-15 | 19d |
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

- `53104dd` 2026-10-05 — TYPE-2 guards + shared label: no uppercase eyebrows anywhere
- `7db1f2c` 2026-10-05 — TYPE-2 golfer pages + homepage steps without numbers
- `4f893bb` 2026-10-05 — TYPE-2 homepage: no labels above headings, sentences in full ink
- `8188a25` 2026-10-05 — TYPE-1: EB Garamond for headlines, Libre Franklin for everything else
- `0013f53` 2026-10-05 — queue/spec update
- `992350c` 2026-10-05 — Announcements: live courses only, and once X'd they stay gone (banner shows only the newest; X marks older ones seen)
- `9559b30` 2026-10-04 — Review fixes from the 2026-10-04 /gr-review (#47)
- `d0bbb4f` 2026-10-04 — Push no-card golfers to the pay link (#46)
- `b913739` 2026-10-04 — SP-B: course cancellation & card policy (#45)
- `747476a` 2026-10-04 — SP-A: per-person staff permissions, set by the course owner (#44)
- `037dcf0` 2026-10-01 — MP-7b: announcements stored once, thread close/reopen, reply context, send test to me (#43)
- `b0a1139` 2026-10-01 — MP-8b: cron run log + Stripe webhook receipts on Admin → System (#42)

---

**Totals:** 226 done · 23 awaiting review · 1 in flight · 26 not started · 8 revise pages open · 15 ideas · 2 parked.
