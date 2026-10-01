# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-10-01 05:15 UTC · branch `claude/eager-maxwell-qf1pd0` · HEAD `67704e9` · working tree **4 dirty file(s)**

## ⚠ Drift — git and the queue disagree

None. Every commit since the last queue edit is recorded in `RUN_QUEUE.md`.

### Uncommitted working tree (4 file(s))

- `M RUN_QUEUE.md`
- `M docs/CODEMAP.md`
- `M docs/codemap.json`
- `M src/app/dashboard/page.tsx`

**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply
the queue header's `git checkout -- .` cleanup until that run has committed, or the work is gone.

## In flight

- **BUG: orphan banner loops forever — PARTIALLY BUILT (b88c8bf), NOT YET** — `RUN_QUEUE.md:2086`
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
| MP-0 — shell fixes (was ADMIN_V4 V4-1): MainOffset one-liner for /admin | 2026-08-29 | 32d | `7246a62` | `RUN_QUEUE.md:760` |
| MP-1 | 2026-08-29 | 32d | `41f5ea8` | `RUN_QUEUE.md:790` |
| MP-1b — HOTFIX after /gr-review MP-1, SHIPPED 4ef11dd. Box open until | 2026-08-29 | 32d | `4ef11dd` | `RUN_QUEUE.md:825` |
| MP-2 | 2026-08-29 | 32d | `958f229` | `RUN_QUEUE.md:866` |
| MP-2b | 2026-08-29 | 32d | `a134af5` | `RUN_QUEUE.md:903` |
| MP-2c | 2026-08-29 | 32d | `e5b5413` | `RUN_QUEUE.md:952` |
| MP-2d | 2026-08-29 | 32d | `22d0f68` | `RUN_QUEUE.md:1000` |
| MP-2e | 2026-08-30 | 31d | `bf3bcb2` | `RUN_QUEUE.md:1042` |
| SECURITY follow-on (951433d; review fixes 30385cd) — BUILT + REVIEWED | 2026-09-16 | 14d | `951433d` | `RUN_QUEUE.md:2289` |
| SD-11 (cfeb2e1; review fixes 2432aa8) — BUILT + REVIEWED 2026-09-17, box | 2026-09-17 | 13d | `cfeb2e1` | `RUN_QUEUE.md:2402` |
| SD-8d — browser Back still discards unsaved Settings edits (from the | 2026-09-28 | 2d | `70a424e` | `RUN_QUEUE.md:595` |
| SD-8e — status is rendered as bare coloured text where the design | 2026-09-29 | 2d | `9d6dc6a` | `RUN_QUEUE.md:621` |
| SD-9c — auth: (1) staff password recovery — CourseStaff has no reset | 2026-09-29 | 2d | `0d84aaf` | `RUN_QUEUE.md:698` |
| BUG: 56 of 59 email senders report success when Resend rejects the send | 2026-09-29 | 2d | `209e652` | `RUN_QUEUE.md:719` |
| MP-5e part 3 — the Overview relationship feed (notes + settings | 2026-09-29 | 2d | `c6a2142` | `RUN_QUEUE.md:1362` |
| BUG: inquiry submissions send no emails | 2026-09-28 | 2d | `8b9a046` | `RUN_QUEUE.md:2605` |
| BUG: perf audit crashed on every page | 2026-09-29 | 2d | `dd7056a` | `RUN_QUEUE.md:2630` |
| RV-1 — forgot-password abuse (from /gr-review 2026-09-29, security MEDIUM). | 2026-09-29 | 2d | `f57f269` | `RUN_QUEUE.md:2641` |
| RV-2 — review follow-ups, small (from /gr-review 2026-09-29): | 2026-09-29 | 2d | `0eab366` | `RUN_QUEUE.md:2651` |
| CAL-2 — Cal.com is the ONLY call scheduler | 2026-09-29 | 2d | `e082dd0` | `RUN_QUEUE.md:2872` |
| BUG: hello@greenreserve.app takes no mail | 2026-09-29 | 2d | `371ffff` | `RUN_QUEUE.md:2904` |
| CAL-1 — Cal.com as the call scheduler | 2026-09-29 | 2d | `a5ed9d7` | `RUN_QUEUE.md:2922` |
| UI REVISE — see UI_REVISE_SPEC.md (decision record 2026-09-04/05: two looks by audience, Clubhouse structure,  | — | — | — | `RUN_QUEUE.md:2247` |

## Not started — the actual queue

1. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:48`
2. CAM — Cal.com: add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:84`
3. SD-7b — assets, BLOCKED ON CAM: three real dashboard screenshots into — `RUN_QUEUE.md:482`
4. MP-3 ORIGINAL SPEC (superseded by the above, kept for reference) — — `RUN_QUEUE.md:1160`
5. MP-4 — pipeline reshape (split into 4a/4b/4c) — `RUN_QUEUE.md:1167`
6. MP-4f — retire the JSON-in-actorName pattern. Three separate things — `RUN_QUEUE.md:1250`
7. MP-5 — courses reshape (split into 5a–5e, ordered by what is wrong — `RUN_QUEUE.md:1279`
8. Golfer course directory (`/courses`) — NOT scheduled. If Cam wants — `RUN_QUEUE.md:1358`
9. MP-6 — money reshape (split into 6a–6d, ordered by what is wrong today) — `RUN_QUEUE.md:1395`
10. MP-7 — comms merge (split into 7a–7b) — `RUN_QUEUE.md:1467`
11. MP-7b — announcement storage + thread lifecycle (SCHEMA CHANGE, — `RUN_QUEUE.md:1485`
12. MP-8 — chrome + System (split into 8a–8b) — `RUN_QUEUE.md:1492`
13. MP-8b — live cron dots (SCHEMA CHANGE, ATTENDED): CronRunLog table — `RUN_QUEUE.md:1509`
14. MP-11 — auth guard into the layout (was ADMIN_V4 V4-7; split 11a–11b) — `RUN_QUEUE.md:1577`
15. Tiny run: legal entity name fill-in (no migration) — Cam 2026-09-15: SKIP until counsel confirms the formation state. — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + / — `RUN_QUEUE.md:1683`
16. PB — private-club billing (PRIVATE_BILLING_SPEC.md). DECIDED Cam 2026-09-29: — `RUN_QUEUE.md:2746`
17. SETUP (Cam 2026-09-29: "we need to do blob storage, birdie ai … we also need — `RUN_QUEUE.md:2751`
18. EV-1 — BookingEvent append-only event log (SCHEMA CHANGE, ATTENDED) — `RUN_QUEUE.md:2946`
19. EV-2 — operator analytics reports — NOT SCHEDULED, DO NOT BUILD YET — `RUN_QUEUE.md:3100`

## Waiting on you (not on a build)

- Cam: which business address to publish, and confirming the Terms' governing law moves from New Jersey to New York (LLC is NY) — `RUN_QUEUE.md:48`
- CAM: three real dashboard screenshots into public/screenshots/ (empty, so the homepage shows three grey placeholder boxes) and a seeded demo course slug for DEMO_COURSE_SLUGS (empt — `RUN_QUEUE.md:482`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:825`
- Cam's approval for a prod backfill — `RUN_QUEUE.md:866`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:903`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:952`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1000`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:1042`
- Cam's approval) — `RUN_QUEUE.md:1250`
- CAM: confirm the state before this runs — e — `RUN_QUEUE.md:1683`
- pending Cam's walk below — `RUN_QUEUE.md:2402`
- Cam: "after submitting an inquiry they aren't getting sent an email — `RUN_QUEUE.md:2605`
- Cam: "there should be no google calendar thing" and, after setting both env vars and redeploying, "it is just the same as before" — `RUN_QUEUE.md:2872`
- Cam: "all emails need to go to thegreenreserve@outlook — `RUN_QUEUE.md:2904`
- Cam: invite link showed "I can't show my calendar right now" — `RUN_QUEUE.md:2922`

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
| `CLAUDE.md` | 5 | 2026-10-01 | 0d |
| `ARCHITECTURE.md` | 4 | 2026-09-16 | 14d |
| `UI_REVISE_SPEC.md` | 1 | 2026-10-01 | 0d |
| `PRIVATE_BILLING_SPEC.md` | 1 | 2026-09-29 | 1d |
| `ADMIN_MASTER_PLAN.md` | 1 | 2026-09-15 | 15d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-09-30 | 0d |
| `FB2_COPY_SPEC.md` | 0 | 2026-09-29 | 1d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-09-29 | 1d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-09-29 | 2d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-09-15 | 15d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-09-15 | 15d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-09-15 | 15d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-09-15 | 15d |
| `AGREEMENT_SPEC.md` | 0 | 2026-09-15 | 15d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-09-15 | 15d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-09-15 | 15d |
| `CODEMAP_SPEC.md` | 0 | 2026-09-15 | 15d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-09-15 | 15d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-09-15 | 15d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-09-15 | 15d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-09-15 | 15d |
| `GOLFER_SPEC.md` | 0 | 2026-09-15 | 15d |
| `HARDENING_SPEC.md` | 0 | 2026-09-15 | 15d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-09-15 | 15d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-09-15 | 15d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-09-15 | 15d |
| `ONBOARDING_SPEC.md` | 0 | 2026-09-15 | 15d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-09-15 | 15d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-09-15 | 15d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-09-15 | 15d |
| `RECEIPT_SPEC.md` | 0 | 2026-09-15 | 15d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-09-15 | 15d |

## Recent commits

- `67704e9` 2026-10-01 — FLOW-3: golfer course page in the homepage phone's style; calendar pop-up on the tee sheet
- `ffde8a4` 2026-10-01 — FLOW-2: tee sheet matches the homepage demo; soft cards, light admin rail; fix bare $ prices
- `06376c0` 2026-10-01 — FLOW-1: one look across the site; /for-courses, setup sheet and /call on the homepage header
- `4a69ffe` 2026-10-01 — FLOW-1 (wip): one palette and typeface for every page, staff surfaces included
- `edd24e7` 2026-10-01 — SEC-blob-host: only send the private-store token to Vercel Blob's host
- `cd43efe` 2026-10-01 — Homepage: centre hero text against the demo; See it work before the FAQ
- `775d18b` 2026-09-30 — CO-DOCS: owner-only Company documents in the private Blob store (#32)
- `adba629` 2026-10-01 — CO-DOCS: regenerate the code map
- `209eb2a` 2026-10-01 — CO-DOCS: use the shared INPUT_COMPACT class (design-guard)
- `ebd77aa` 2026-10-01 — queue/spec update
- `da9aabf` 2026-10-01 — CO-DOCS: owner-only Company documents in the private Blob store
- `62e5d55` 2026-09-30 — UI-H-1: new homepage from the approved mockup (#31)

---

**Totals:** 218 done · 23 awaiting review · 1 in flight · 19 not started · 8 revise pages open · 15 ideas · 2 parked.
