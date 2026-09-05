# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-09-05 04:43 UTC · branch `main` · HEAD `f274690` · working tree **2 dirty file(s)**

## ⚠ Drift — git and the queue disagree

None. Every commit since the last queue edit is recorded in `RUN_QUEUE.md`.

### Uncommitted working tree (2 file(s))

- `M RUN_QUEUE.md`
- `?? legal/`

Queue header rule: dirty docs get **committed**, dirty source gets discarded — but check what
these actually are first.

## In flight

- **BUG: orphan banner loops forever — PARTIALLY BUILT (b88c8bf), NOT YET** — `RUN_QUEUE.md:1627`
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
| MP-0 — shell fixes (was ADMIN_V4 V4-1): MainOffset one-liner for /admin | 2026-08-29 | 6d | `7246a62` | `RUN_QUEUE.md:400` |
| MP-1 | 2026-08-29 | 6d | `41f5ea8` | `RUN_QUEUE.md:430` |
| MP-1b — HOTFIX after /gr-review MP-1, SHIPPED 4ef11dd. Box open until | 2026-08-29 | 6d | `4ef11dd` | `RUN_QUEUE.md:465` |
| MP-2 | 2026-08-29 | 6d | `958f229` | `RUN_QUEUE.md:506` |
| MP-2b | 2026-08-29 | 6d | `a134af5` | `RUN_QUEUE.md:543` |
| MP-2c | 2026-08-29 | 6d | `e5b5413` | `RUN_QUEUE.md:592` |
| MP-2d | 2026-08-29 | 6d | `22d0f68` | `RUN_QUEUE.md:640` |
| MP-2e | 2026-08-30 | 5d | `bf3bcb2` | `RUN_QUEUE.md:682` |

## Not started — the actual queue

1. OWNER TOTP 2FA (SCHEMA CHANGE, ATTENDED — run second, right after ADMIN — `RUN_QUEUE.md:236`
2. BUG: `viewer` role is a promise the code never keeps (no migration, small) — `RUN_QUEUE.md:289`
3. SD-2 — the mobile shell: bottom nav below md, drop h-screen — `RUN_QUEUE.md:338`
4. SD-3 — course-local time: Course.timezone column, every dashboard and — `RUN_QUEUE.md:343`
5. SD-4 — money truth: analytics counts completed bookings by play date — `RUN_QUEUE.md:347`
6. SD-5 — lifecycle states: walk-in/phone booking POST (the biggest — `RUN_QUEUE.md:353`
7. SD-6 — marketing honesty: the walk-in FAQ (only AFTER SD-5 makes it — `RUN_QUEUE.md:360`
8. SD-7 — SEO + assets: sitemap.ts (robots.txt advertises one that 404s), — `RUN_QUEUE.md:366`
9. SD-8 — merge + split: Payments + Cancellations → one Money page with — `RUN_QUEUE.md:374`
10. SD-9 — funnel + auth polish: split the details sheet into a required core — `RUN_QUEUE.md:380`
11. MP-3 ORIGINAL SPEC (superseded by the above, kept for reference) — — `RUN_QUEUE.md:800`
12. MP-4 — pipeline reshape (split into 4a/4b/4c) — `RUN_QUEUE.md:807`
13. MP-4f — retire the JSON-in-actorName pattern. Three separate things — `RUN_QUEUE.md:890`
14. MP-5 — courses reshape (split into 5a–5e, ordered by what is wrong — `RUN_QUEUE.md:912`
15. Golfer course directory (`/courses`) — NOT scheduled. If Cam wants — `RUN_QUEUE.md:991`
16. MP-5e part 3 — the Overview relationship feed (notes + settings — `RUN_QUEUE.md:995`
17. MP-6 — money reshape (split into 6a–6d, ordered by what is wrong today) — `RUN_QUEUE.md:1021`
18. MP-6b — refund primitive + chargeback visibility (no migration): — `RUN_QUEUE.md:1042`
19. MP-6c — payout history + unit economics (no migration): "money — `RUN_QUEUE.md:1052`
20. MP-6d — Golfers record page (no migration): palette search extended — `RUN_QUEUE.md:1060`
21. MP-7 — comms merge (split into 7a–7b) — `RUN_QUEUE.md:1067`
22. MP-7b — announcement storage + thread lifecycle (SCHEMA CHANGE, — `RUN_QUEUE.md:1085`
23. MP-8 — chrome + System (split into 8a–8b) — `RUN_QUEUE.md:1092`
24. MP-8b — live cron dots (SCHEMA CHANGE, ATTENDED): CronRunLog table — `RUN_QUEUE.md:1109`
25. MP-9 — adopt the design system (was ADMIN_V4 V4-6, full spec in — `RUN_QUEUE.md:1116`
26. MP-10 — server-side pagination (was ADMIN_V4 V4-4): inquiries, activity, — `RUN_QUEUE.md:1122`
27. MP-11 — auth guard into the layout (was ADMIN_V4 V4-7; split 11a–11b) — `RUN_QUEUE.md:1126`
28. MP-12 — split courses/[id] (was ADMIN_V4 V4-9): 1,900 lines / 52 useState — `RUN_QUEUE.md:1175`
29. BOOKING WINDOWS (schema change, attended) — how far ahead each audience can see/book the tee sheet: — `RUN_QUEUE.md:1180`
30. COURSE_LAYOUT_SPEC Phase L2 — booking page sells products: product selector on tee sheet, per-product slots/pricing/labels everywhere (big; answer the spec's OPEN QUESTION first) — `RUN_QUEUE.md:1201`
31. COURSE_LAYOUT_SPEC Phase L3 — isolation tests + admin layout summary (small) — `RUN_QUEUE.md:1202`
32. Tiny run: legal entity name fill-in (no migration) — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + /privacy with "TheGreenReserve LLC" + formation state (CAM: confirm  — `RUN_QUEUE.md:1224`
33. BIRDIE_AI_SPEC Phase B1 — Birdie assistant foundation + operator helper: /api/birdie/chat (Anthropic API, Haiku, streaming), persona/tools derived server-side from surface+session, — `RUN_QUEUE.md:1303`

## Waiting on you (not on a build)

- pending Cam's approval for a prod write — `RUN_QUEUE.md:465`
- Cam's approval for a prod backfill — `RUN_QUEUE.md:506`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:543`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:592`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:640`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:682`
- CAM: confirm the state before this runs — e — `RUN_QUEUE.md:1224`

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

## Ideas bank — AUDIT_MASTER.md

Page-by-page findings and maybes. **Noticed, not scheduled** — nothing here is on the queue
until it becomes a RUN_QUEUE item. Counts are unfixed findings as written in that file.

Totals: **19 security/data-loss · 47 money-truth · 39 polish** findings across 43 page blocks; 15 of them carry ideas.

| page | verdict | sec | money | polish | ideas |
|---|---|---|---|---|---|
| /dashboard — Tee sheet (+ ?tab=analytics) | Reshape (strip onboarding chrome once live; this is the product). | 2 | 6 | 5 | yes |
| /admin/courses (+ /[id]) — Fleet | Reshape list (put the evidence on rows); detail 10 tabs → 6. | 2 | 4 | 1 | yes |
| /dashboard/settings — 9-tab settings | Reshape (split 9 tabs → 5; close the write-holes). | 2 | 3 | 3 | yes |
| /admin/inquiries (+ /[id]) — Pipeline | Reshape list queue-first; keep detail (best-built admin page). | 2 | 3 | 1 | yes |
| /courses/[slug] — The course page (storefront) | Keep + reshape — the strongest page in the product. | 2 | 2 | 1 | yes |
| /admin/employees — Team &amp; access | Keep, demote to utility, slim to one card. | 2 |  | 1 |  |
| /dashboard/verify · /dashboard/2fa · /dashboard/login · /dashboard/forgot-password · /dashboard/reset-password — Auth | Keep (mostly well-built), fix the recovery dead-ends. | 1 | 2 | 1 |  |
| /admin/messages — Operator comms | Keep + absorb Broadcasts. | 1 | 2 |  | yes |
| /admin/broadcasts — Mass operator email | Merge into Messages, then park the page (trigger: ~10 courses). | 1 | 2 |  | yes |
| /for-courses — Lead form | Keep (good on a phone), fix the plumbing. | 1 | 1 | 1 |  |
| /admin/golfers — Support lookup | Reshape into a record page; search → ⌘K palette. | 1 | 1 |  | yes |
| /api/inquiries — Lead intake API | Fix now (ship-blocker). | 1 |  |  |  |
| /admin/create — "Manual build" wizard | Delete as a destination. | 1 |  |  | yes |
| /admin — Overview | Reshape (5 zones — see Deep Dive 01). |  | 5 | 3 | yes |
| /admin/revenue — Money | Reshape (problems pinned on top, P&L on a collected basis). |  | 4 | 1 | yes |
| /for-courses/details — Concierge details sheet | Reshape (split it). |  | 2 | 2 | yes |
| /admin/activity — Cross-course feed | Merge a 15-event strip into Overview, park the page (trigger: >20 events/day). |  | 2 |  |  |
| /admin/system — Health check | Keep — make the dots able to turn red. |  | 2 |  | yes |
| / — Homepage | Reshape (honesty + assets, not structure). |  | 1 | 6 | yes |
| /dashboard/payments + /dashboard/cancellations — Money | Merge into one "Money" page (same endpoint already). |  | 1 | 1 | yes |
| /book — Checkout (card capture) | Keep — the model the other pages should match. |  | 1 |  |  |
| /manage/[bookingId] — Manage a booking | Keep. Most feature-complete terminal — cancel, change time (slot picker + price deltas), change party size (repriced), all timezone-correct. |  | 1 |  |  |
| /dashboard/schedules — Tee-time generator | Keep (best-explained page in the app). |  | 1 |  |  |
| /dashboard/onboarding — Guided first-run | Keep (self-destructs once live), fix the state bug. |  | 1 |  |  |
| Admin chrome — AdminSidebar · CommandPalette |  |  |  | 3 |  |
| /dashboard/members — Membership tiers | Keep — freeze (over-built for pre-launch). |  |  | 3 |  |
| SEO plumbing (robots / sitemap / metadata) | Fix now (build it). |  |  | 2 |  |
| /terms · /privacy · /operator-agreement — Legal | Keep, fix the template. |  |  | 1 |  |
| /admin/profile — Account | Keep — make it the sole home of change-password. |  |  | 1 |  |
| /admin/login · /admin/owner-login · /admin/set-password · /admin/forgot-password — Doors | Merge to one door; keep set/forgot. |  |  | 1 |  |
| Stubs — /dashboard/tournaments · /dashboard/outings · (empty dashboard/tee-times/) | Keep the honest stubs; delete the empty dir. |  |  | 1 |  |

## Spec inventory

`open refs` = how many open queue items still point at this spec. Zero + old = fully consumed.

| spec | open refs | last touched | age |
|---|---|---|---|

## Recent commits

- `f274690` 2026-09-05 — SD-1: plug the leaks on the two surfaces a customer touches
- `41f3e5a` 2026-09-05 — queue/spec update
- `99ed266` 2026-09-05 — MP-11b: no admin action fails silently -- useResource, zero alert()s
- `2dd6466` 2026-09-05 — queue/spec update
- `341161a` 2026-09-05 — MP-11a: the admin session is resolved once, in the layout
- `849861f` 2026-09-04 — queue/spec update
- `892af22` 2026-09-04 — MP-8a fix: stale [H] dependency after the orphan-sweep move (tsc was red on main)
- `0b51cc5` 2026-09-04 — queue/spec update
- `4eb1c9d` 2026-09-04 — MP-8a: sidebar links are links, badges survive leaving the Overview, System says what is deployed
- `9dc1f2c` 2026-09-04 — queue/spec update
- `6c94836` 2026-09-04 — MP-7a: Messages says who is waiting; Broadcasts stops lying about delivery
- `819d68c` 2026-09-04 — queue/spec update

---

**Totals:** 140 done · 8 awaiting review · 1 in flight · 33 not started · 8 revise pages open · 15 ideas · 2 parked.
