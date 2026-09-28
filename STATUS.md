# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-09-28 16:17 UTC · branch `claude/eager-maxwell-qf1pd0` · HEAD `3aff643` · working tree clean

## ⚠ Drift — git and the queue disagree

None. Every commit since the last queue edit is recorded in `RUN_QUEUE.md`.

## In flight

- **BUG: orphan banner loops forever — PARTIALLY BUILT (b88c8bf), NOT YET** — `RUN_QUEUE.md:1895`
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
| SECURITY follow-on (951433d; review fixes 30385cd) — BUILT + REVIEWED | 2026-09-16 | 12d | `951433d` | `RUN_QUEUE.md:2098` |
| SD-11 (cfeb2e1; review fixes 2432aa8) — BUILT + REVIEWED 2026-09-17, box | 2026-09-17 | 11d | `cfeb2e1` | `RUN_QUEUE.md:2211` |
| MP-0 — shell fixes (was ADMIN_V4 V4-1): MainOffset one-liner for /admin | — | — | — | `RUN_QUEUE.md:599` |
| MP-1 | — | — | — | `RUN_QUEUE.md:629` |
| MP-1b — HOTFIX after /gr-review MP-1, SHIPPED 4ef11dd. Box open until | — | — | — | `RUN_QUEUE.md:664` |
| MP-2 | — | — | — | `RUN_QUEUE.md:705` |
| MP-2b | — | — | — | `RUN_QUEUE.md:742` |
| MP-2c | — | — | — | `RUN_QUEUE.md:791` |
| MP-2d | — | — | — | `RUN_QUEUE.md:839` |
| MP-2e | — | — | — | `RUN_QUEUE.md:881` |
| UI REVISE — see UI_REVISE_SPEC.md (decision record 2026-09-04/05: two looks by audience, Clubhouse structure,  | — | — | — | `RUN_QUEUE.md:2056` |

## Not started — the actual queue

1. SD-7b — assets, BLOCKED ON CAM: three real dashboard screenshots into — `RUN_QUEUE.md:423`
2. SD-8d — browser Back still discards unsaved Settings edits (from the — `RUN_QUEUE.md:536`
3. SD-8e — status is rendered as bare coloured text where the design — `RUN_QUEUE.md:544`
4. SD-9 — funnel + auth polish: split the details sheet into a required core — `RUN_QUEUE.md:579`
5. MP-3 ORIGINAL SPEC (superseded by the above, kept for reference) — — `RUN_QUEUE.md:999`
6. MP-4 — pipeline reshape (split into 4a/4b/4c) — `RUN_QUEUE.md:1006`
7. MP-4f — retire the JSON-in-actorName pattern. Three separate things — `RUN_QUEUE.md:1089`
8. MP-5 — courses reshape (split into 5a–5e, ordered by what is wrong — `RUN_QUEUE.md:1111`
9. Golfer course directory (`/courses`) — NOT scheduled. If Cam wants — `RUN_QUEUE.md:1190`
10. MP-5e part 3 — the Overview relationship feed (notes + settings — `RUN_QUEUE.md:1194`
11. MP-6 — money reshape (split into 6a–6d, ordered by what is wrong today) — `RUN_QUEUE.md:1220`
12. MP-7 — comms merge (split into 7a–7b) — `RUN_QUEUE.md:1292`
13. MP-7b — announcement storage + thread lifecycle (SCHEMA CHANGE, — `RUN_QUEUE.md:1310`
14. MP-8 — chrome + System (split into 8a–8b) — `RUN_QUEUE.md:1317`
15. MP-8b — live cron dots (SCHEMA CHANGE, ATTENDED): CronRunLog table — `RUN_QUEUE.md:1334`
16. MP-9 — adopt the design system (was ADMIN_V4 V4-6, full spec in — `RUN_QUEUE.md:1341`
17. MP-11 — auth guard into the layout (was ADMIN_V4 V4-7; split 11a–11b) — `RUN_QUEUE.md:1388`
18. MP-12 — split courses/[id] (was ADMIN_V4 V4-9): 1,900 lines / 52 useState — `RUN_QUEUE.md:1437`
19. Tiny run: legal entity name fill-in (no migration) — Cam 2026-09-15: SKIP until counsel confirms the formation state. — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + / — `RUN_QUEUE.md:1492`
20. EV-1 — BookingEvent append-only event log (SCHEMA CHANGE, ATTENDED) — `RUN_QUEUE.md:2414`
21. EV-2 — operator analytics reports — NOT SCHEDULED, DO NOT BUILD YET — `RUN_QUEUE.md:2559`

## Waiting on you (not on a build)

- CAM: three real dashboard screenshots into public/screenshots/ (empty, so the homepage shows three grey placeholder boxes) and a seeded demo course slug for DEMO_COURSE_SLUGS (empt — `RUN_QUEUE.md:423`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:664`
- Cam's approval for a prod backfill — `RUN_QUEUE.md:705`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:742`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:791`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:839`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:881`
- CAM: confirm the state before this runs — e — `RUN_QUEUE.md:1492`
- pending Cam's walk below — `RUN_QUEUE.md:2211`

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
| `ARCHITECTURE.md` | 4 | 2026-09-16 | 11d |
| `CLAUDE.md` | 3 | 2026-09-16 | 11d |
| `ADMIN_MASTER_PLAN.md` | 1 | 2026-09-15 | 12d |
| `ADMIN_V4_SPEC.md` | 1 | 2026-09-15 | 12d |
| `UI_REVISE_SPEC.md` | 1 | 2026-09-16 | 12d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-09-15 | 12d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-09-15 | 12d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-09-15 | 12d |
| `AGREEMENT_SPEC.md` | 0 | 2026-09-15 | 12d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-09-15 | 12d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-09-15 | 12d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-09-15 | 12d |
| `CODEMAP_SPEC.md` | 0 | 2026-09-15 | 12d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-09-15 | 12d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-09-15 | 12d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-09-15 | 12d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-09-15 | 12d |
| `GOLFER_SPEC.md` | 0 | 2026-09-15 | 12d |
| `HARDENING_SPEC.md` | 0 | 2026-09-15 | 12d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-09-15 | 12d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-09-15 | 12d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-09-15 | 12d |
| `ONBOARDING_SPEC.md` | 0 | 2026-09-15 | 12d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-09-15 | 12d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-09-15 | 12d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-09-15 | 12d |
| `RECEIPT_SPEC.md` | 0 | 2026-09-15 | 12d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-09-15 | 12d |

## Recent commits

- `3aff643` 2026-09-28 — queue/spec update
- `f6ec6fb` 2026-09-28 — queue/spec update
- `ded9ed6` 2026-09-17 — queue/spec update
- `2432aa8` 2026-09-17 — SD-11 review fixes: a cap that exists, a verifier the client cannot crack, and a way out of the dead end
- `7970047` 2026-09-17 — queue/spec update
- `cfeb2e1` 2026-09-17 — SD-11: ask before offering sign-in, and make them prove the inbox
- `5bf7e4b` 2026-09-16 — Rate-limit setup-intent, and delete ARCHITECTURE.md's route tables
- `f5c5a5b` 2026-09-16 — queue/spec update
- `063507f` 2026-09-16 — CODEMAP review fixes: a guard is enforcement, not a mention
- `f924e07` 2026-09-16 — CODEMAP_SPEC CM-1: a generated map of the code, so agents stop reading files to find things
- `2e3e1fa` 2026-09-16 — queue/spec update
- `8e0b692` 2026-09-16 — H-2h: the shadows come back, the cream dissolves go

---

**Totals:** 194 done · 11 awaiting review · 1 in flight · 21 not started · 8 revise pages open · 15 ideas · 2 parked.
