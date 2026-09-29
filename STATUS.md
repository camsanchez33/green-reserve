# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-09-29 01:19 UTC · branch `claude/eager-maxwell-qf1pd0` · HEAD `9d6dc6a` · working tree **1 dirty file(s)**

## ⚠ Drift — git and the queue disagree

None. Every commit since the last queue edit is recorded in `RUN_QUEUE.md`.

### Uncommitted working tree (1 file(s))

- `M RUN_QUEUE.md`

Queue header rule: dirty docs get **committed**, dirty source gets discarded — but check what
these actually are first.

## In flight

- **BUG: orphan banner loops forever — PARTIALLY BUILT (b88c8bf), NOT YET** — `RUN_QUEUE.md:1928`
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
| SECURITY follow-on (951433d; review fixes 30385cd) — BUILT + REVIEWED | 2026-09-16 | 12d | `951433d` | `RUN_QUEUE.md:2131` |
| SD-11 (cfeb2e1; review fixes 2432aa8) — BUILT + REVIEWED 2026-09-17, box | 2026-09-17 | 11d | `cfeb2e1` | `RUN_QUEUE.md:2244` |
| SD-8d — browser Back still discards unsaved Settings edits (from the | 2026-09-28 | 0d | `70a424e` | `RUN_QUEUE.md:536` |
| SD-8e — status is rendered as bare coloured text where the design | 2026-09-29 | 0d | `9d6dc6a` | `RUN_QUEUE.md:562` |
| BUG: inquiry submissions send no emails | 2026-09-28 | 0d | `8b9a046` | `RUN_QUEUE.md:2447` |
| BUG: perf audit crashed on every page | 2026-09-29 | 0d | `dd7056a` | `RUN_QUEUE.md:2468` |
| CAL-1 — Cal.com as the call scheduler | 2026-09-29 | 0d | `a5ed9d7` | `RUN_QUEUE.md:2476` |
| MP-0 — shell fixes (was ADMIN_V4 V4-1): MainOffset one-liner for /admin | — | — | — | `RUN_QUEUE.md:632` |
| MP-1 | — | — | — | `RUN_QUEUE.md:662` |
| MP-1b — HOTFIX after /gr-review MP-1, SHIPPED 4ef11dd. Box open until | — | — | — | `RUN_QUEUE.md:697` |
| MP-2 | — | — | — | `RUN_QUEUE.md:738` |
| MP-2b | — | — | — | `RUN_QUEUE.md:775` |
| MP-2c | — | — | — | `RUN_QUEUE.md:824` |
| MP-2d | — | — | — | `RUN_QUEUE.md:872` |
| MP-2e | — | — | — | `RUN_QUEUE.md:914` |
| UI REVISE — see UI_REVISE_SPEC.md (decision record 2026-09-04/05: two looks by audience, Clubhouse structure,  | — | — | — | `RUN_QUEUE.md:2089` |

## Not started — the actual queue

1. SD-7b — assets, BLOCKED ON CAM: three real dashboard screenshots into — `RUN_QUEUE.md:423`
2. SD-9 — funnel + auth polish: split the details sheet into a required core — `RUN_QUEUE.md:612`
3. MP-3 ORIGINAL SPEC (superseded by the above, kept for reference) — — `RUN_QUEUE.md:1032`
4. MP-4 — pipeline reshape (split into 4a/4b/4c) — `RUN_QUEUE.md:1039`
5. MP-4f — retire the JSON-in-actorName pattern. Three separate things — `RUN_QUEUE.md:1122`
6. MP-5 — courses reshape (split into 5a–5e, ordered by what is wrong — `RUN_QUEUE.md:1144`
7. Golfer course directory (`/courses`) — NOT scheduled. If Cam wants — `RUN_QUEUE.md:1223`
8. MP-5e part 3 — the Overview relationship feed (notes + settings — `RUN_QUEUE.md:1227`
9. MP-6 — money reshape (split into 6a–6d, ordered by what is wrong today) — `RUN_QUEUE.md:1253`
10. MP-7 — comms merge (split into 7a–7b) — `RUN_QUEUE.md:1325`
11. MP-7b — announcement storage + thread lifecycle (SCHEMA CHANGE, — `RUN_QUEUE.md:1343`
12. MP-8 — chrome + System (split into 8a–8b) — `RUN_QUEUE.md:1350`
13. MP-8b — live cron dots (SCHEMA CHANGE, ATTENDED): CronRunLog table — `RUN_QUEUE.md:1367`
14. MP-9 — adopt the design system (was ADMIN_V4 V4-6, full spec in — `RUN_QUEUE.md:1374`
15. MP-11 — auth guard into the layout (was ADMIN_V4 V4-7; split 11a–11b) — `RUN_QUEUE.md:1421`
16. MP-12 — split courses/[id] (was ADMIN_V4 V4-9): 1,900 lines / 52 useState — `RUN_QUEUE.md:1470`
17. Tiny run: legal entity name fill-in (no migration) — Cam 2026-09-15: SKIP until counsel confirms the formation state. — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + / — `RUN_QUEUE.md:1525`
18. EV-1 — BookingEvent append-only event log (SCHEMA CHANGE, ATTENDED) — `RUN_QUEUE.md:2500`
19. EV-2 — operator analytics reports — NOT SCHEDULED, DO NOT BUILD YET — `RUN_QUEUE.md:2649`

## Waiting on you (not on a build)

- CAM: three real dashboard screenshots into public/screenshots/ (empty, so the homepage shows three grey placeholder boxes) and a seeded demo course slug for DEMO_COURSE_SLUGS (empt — `RUN_QUEUE.md:423`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:697`
- Cam's approval for a prod backfill — `RUN_QUEUE.md:738`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:775`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:824`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:872`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:914`
- CAM: confirm the state before this runs — e — `RUN_QUEUE.md:1525`
- pending Cam's walk below — `RUN_QUEUE.md:2244`
- Cam: "after submitting an inquiry they aren't getting sent an email — `RUN_QUEUE.md:2447`
- Cam: invite link showed "I can't show my calendar right now" — `RUN_QUEUE.md:2476`

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
| `ARCHITECTURE.md` | 4 | 2026-09-16 | 12d |
| `CLAUDE.md` | 3 | 2026-09-16 | 12d |
| `UI_REVISE_SPEC.md` | 1 | 2026-09-16 | 12d |
| `ADMIN_MASTER_PLAN.md` | 1 | 2026-09-15 | 13d |
| `ADMIN_V4_SPEC.md` | 1 | 2026-09-15 | 13d |
| `CODEMAP_SPEC.md` | 0 | 2026-09-15 | 12d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-09-15 | 13d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-09-15 | 13d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-09-15 | 13d |
| `AGREEMENT_SPEC.md` | 0 | 2026-09-15 | 13d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-09-15 | 13d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-09-15 | 13d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-09-15 | 13d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-09-15 | 13d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-09-15 | 13d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-09-15 | 13d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-09-15 | 13d |
| `GOLFER_SPEC.md` | 0 | 2026-09-15 | 13d |
| `HARDENING_SPEC.md` | 0 | 2026-09-15 | 13d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-09-15 | 13d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-09-15 | 13d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-09-15 | 13d |
| `ONBOARDING_SPEC.md` | 0 | 2026-09-15 | 13d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-09-15 | 13d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-09-15 | 13d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-09-15 | 13d |
| `RECEIPT_SPEC.md` | 0 | 2026-09-15 | 13d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-09-15 | 13d |

## Recent commits

- `9d6dc6a` 2026-09-29 — SD-8e: booking status is a StatusDot, and 'card on file' reads differently from 'paid'
- `22a3d7d` 2026-09-29 — queue/spec update
- `141582d` 2026-09-29 — queue/spec update
- `a5ed9d7` 2026-09-29 — CAL-1: Cal.com as the call scheduler (Outlook-backed), in place of the Google grid
- `dd7056a` 2026-09-29 — Fix: perf audit crashed with '__name is not defined' on every page
- `1ceeff5` 2026-09-28 — queue/spec update
- `e4f3b3b` 2026-09-28 — queue/spec update
- `fdd9c0c` 2026-09-28 — Fix: 20 more email sends died when the response returned
- `f76c618` 2026-09-28 — queue/spec update
- `8b9a046` 2026-09-28 — Fix: inquiry submissions send no emails
- `2a7989f` 2026-09-28 — queue/spec update
- `70a424e` 2026-09-28 — SD-8d: ask before browser Back discards unsaved Settings edits

---

**Totals:** 194 done · 16 awaiting review · 1 in flight · 19 not started · 8 revise pages open · 15 ideas · 2 parked.
