# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-09-01 21:08 UTC · branch `main` · HEAD `703a7d0` · working tree **6 dirty file(s)**

## ⚠ Drift — git and the queue disagree

`RUN_QUEUE.md` was last committed **2026-09-01**. 2 commit(s) since then are not mentioned anywhere in it:

| commit | date | subject |
|---|---|---|
| `703a7d0` | 2026-09-01 | Status board: fix the Windows git calls, regenerate, and make it a per-run step |
| `ae37ae1` | 2026-09-01 | Add the status board (STATUS.md/json/html + generators); gitignore AUDIT_MASTER.md |

**Meaning:** work shipped that the queue does not know about. Either record the run, or check the box.

### Uncommitted working tree (6 file(s))

- `M src/app/api/cron/cancellation-cutoff/route.ts`
- `M src/app/api/cron/chase-onboarding/route.ts`
- `M src/app/api/cron/generate-tee-times/route.ts`
- `M src/app/api/cron/hourly/route.ts`
- `M src/app/api/cron/send-reminders/route.ts`
- `?? src/lib/cron-auth.ts`

**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply
the queue header's `git checkout -- .` cleanup until that run has committed, or the work is gone.

## In flight

- **BUG: orphan banner loops forever — PARTIALLY BUILT (b88c8bf), NOT YET** — `RUN_QUEUE.md:1296`
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
| MP-0 — shell fixes (was ADMIN_V4 V4-1): MainOffset one-liner for /admin | 2026-08-29 | 2d | `7246a62` | `RUN_QUEUE.md:390` |
| MP-1 | 2026-08-29 | 2d | `41f5ea8` | `RUN_QUEUE.md:420` |
| MP-1b — HOTFIX after /gr-review MP-1, SHIPPED 4ef11dd. Box open until | 2026-08-29 | 2d | `4ef11dd` | `RUN_QUEUE.md:455` |
| MP-2 | 2026-08-29 | 2d | `958f229` | `RUN_QUEUE.md:496` |
| MP-2b | 2026-08-29 | 2d | `a134af5` | `RUN_QUEUE.md:533` |
| MP-2c | 2026-08-29 | 2d | `e5b5413` | `RUN_QUEUE.md:582` |
| MP-2d | 2026-08-29 | 2d | `22d0f68` | `RUN_QUEUE.md:630` |
| MP-2e | 2026-08-30 | 2d | `bf3bcb2` | `RUN_QUEUE.md:672` |

## Not started — the actual queue

1. OWNER TOTP 2FA (SCHEMA CHANGE, ATTENDED — run second, right after ADMIN — `RUN_QUEUE.md:236`
2. BUG: `viewer` role is a promise the code never keeps (no migration, small) — `RUN_QUEUE.md:289`
3. SD-1 — plug the leaks: auth the inquiries GET + explicit select with no — `RUN_QUEUE.md:319`
4. SD-2 — the mobile shell: bottom nav below md, drop h-screen — `RUN_QUEUE.md:328`
5. SD-3 — course-local time: Course.timezone column, every dashboard and — `RUN_QUEUE.md:333`
6. SD-4 — money truth: analytics counts completed bookings by play date — `RUN_QUEUE.md:337`
7. SD-5 — lifecycle states: walk-in/phone booking POST (the biggest — `RUN_QUEUE.md:343`
8. SD-6 — marketing honesty: the walk-in FAQ (only AFTER SD-5 makes it — `RUN_QUEUE.md:350`
9. SD-7 — SEO + assets: sitemap.ts (robots.txt advertises one that 404s), — `RUN_QUEUE.md:356`
10. SD-8 — merge + split: Payments + Cancellations → one Money page with — `RUN_QUEUE.md:364`
11. SD-9 — funnel + auth polish: split the details sheet into a required core — `RUN_QUEUE.md:370`
12. MP-3 ORIGINAL SPEC (superseded by the above, kept for reference) — — `RUN_QUEUE.md:790`
13. MP-4 — pipeline reshape: queue-first inquiries list (dedup, true — `RUN_QUEUE.md:797`
14. MP-5 — courses reshape: evidence on list rows (already computed, never — `RUN_QUEUE.md:801`
15. MP-6 — money reshape: Revenue problems pinned all-time + collected-basis — `RUN_QUEUE.md:805`
16. MP-7 — comms merge: Broadcasts composer into Messages (owner-only), — `RUN_QUEUE.md:809`
17. MP-8 — chrome + System: sidebar real links + self-fetched badges + — `RUN_QUEUE.md:813`
18. MP-9 — adopt the design system (was ADMIN_V4 V4-6, full spec in — `RUN_QUEUE.md:817`
19. MP-10 — server-side pagination (was ADMIN_V4 V4-4): inquiries, activity, — `RUN_QUEUE.md:823`
20. MP-11 — auth guard into the layout (was ADMIN_V4 V4-7): session resolved — `RUN_QUEUE.md:827`
21. MP-12 — split courses/[id] (was ADMIN_V4 V4-9): 1,900 lines / 52 useState — `RUN_QUEUE.md:844`
22. BOOKING WINDOWS (schema change, attended) — how far ahead each audience can see/book the tee sheet: — `RUN_QUEUE.md:849`
23. COURSE_LAYOUT_SPEC Phase L2 — booking page sells products: product selector on tee sheet, per-product slots/pricing/labels everywhere (big; answer the spec's OPEN QUESTION first) — `RUN_QUEUE.md:870`
24. COURSE_LAYOUT_SPEC Phase L3 — isolation tests + admin layout summary (small) — `RUN_QUEUE.md:871`
25. Tiny run: legal entity name fill-in (no migration) — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + /privacy with "TheGreenReserve LLC" + formation state (CAM: confirm  — `RUN_QUEUE.md:893`
26. ONBOARDING_V2_SPEC Phase V13 — guided operator onboarding: Getting Started checklist derived from real state (verify/password/look around/review page/connect Stripe/check schedule) — `RUN_QUEUE.md:913`
27. ONBOARDING_V2_SPEC Phase V13b — request-changes v2: structured category form on the preview page, requests live ON the inquiry (checkpoint area + addressable item list → "Send upda — `RUN_QUEUE.md:915`
28. BIRDIE_AI_SPEC Phase B1 — Birdie assistant foundation + operator helper: /api/birdie/chat (Anthropic API, Haiku, streaming), persona/tools derived server-side from surface+session, — `RUN_QUEUE.md:972`

## Waiting on you (not on a build)

- pending Cam's approval for a prod write — `RUN_QUEUE.md:455`
- Cam's approval for a prod backfill — `RUN_QUEUE.md:496`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:533`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:582`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:630`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:672`
- CAM: confirm the state before this runs — e — `RUN_QUEUE.md:893`

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

- `703a7d0` 2026-09-01 — Status board: fix the Windows git calls, regenerate, and make it a per-run step
- `ae37ae1` 2026-09-01 — Add the status board (STATUS.md/json/html + generators); gitignore AUDIT_MASTER.md
- `0001c5f` 2026-09-01 — queue/spec update — MP-3 shipped across five migrations
- `a2a9788` 2026-09-01 — MP-3 runs B2c+B2d: TeeTime and TeeTimeSchedule to integer cents — the money path is now float-free
- `f42e86c` 2026-09-01 — MP-3 run B2b: Course money to integer cents — and the two places the rename did NOT protect
- `244cf1a` 2026-09-01 — MP-3 run B2a: MembershipTier money to integer cents — renamed so the compiler enforces it
- `0ac78f4` 2026-09-01 — Remove _tmp_snap.ts — scratch script accidentally committed in the B1 merge
- `83798d3` 2026-09-01 — MP-3 run B1: Booking money Float -> Int (no data change, no code change)
- `d38d2b2` 2026-08-30 — MP-3 run A: the eight additive schema changes (no data rewrite)
- `6c929be` 2026-08-30 — queue/spec update
- `bf3bcb2` 2026-08-30 — MP-2e: close the MP-2 series — fix the viewer crash MP-2d shipped, convert the last consumers
- `3d3f4d8` 2026-08-29 — queue/spec update

---

**Totals:** 119 done · 8 awaiting review · 1 in flight · 28 not started · 8 revise pages open · 15 ideas · 2 parked.
