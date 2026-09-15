# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-09-15 23:45 UTC · branch `main` · HEAD `21c8d25` · working tree **1 dirty file(s)**

## ⚠ Drift — git and the queue disagree

None. Every commit since the last queue edit is recorded in `RUN_QUEUE.md`.

### Uncommitted working tree (1 file(s))

- `M RUN_QUEUE.md`

Queue header rule: dirty docs get **committed**, dirty source gets discarded — but check what
these actually are first.

## In flight

- **BUG: orphan banner loops forever — PARTIALLY BUILT (b88c8bf), NOT YET** — `RUN_QUEUE.md:1796`
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
| MP-0 — shell fixes (was ADMIN_V4 V4-1): MainOffset one-liner for /admin | 2026-08-29 | 16d | `7246a62` | `RUN_QUEUE.md:500` |
| MP-1 | 2026-08-29 | 16d | `41f5ea8` | `RUN_QUEUE.md:530` |
| MP-1b — HOTFIX after /gr-review MP-1, SHIPPED 4ef11dd. Box open until | 2026-08-29 | 16d | `4ef11dd` | `RUN_QUEUE.md:565` |
| MP-2 | 2026-08-29 | 16d | `958f229` | `RUN_QUEUE.md:606` |
| MP-2b | 2026-08-29 | 16d | `a134af5` | `RUN_QUEUE.md:643` |
| MP-2c | 2026-08-29 | 16d | `e5b5413` | `RUN_QUEUE.md:692` |
| MP-2d | 2026-08-29 | 16d | `22d0f68` | `RUN_QUEUE.md:740` |
| MP-2e | 2026-08-30 | 16d | `bf3bcb2` | `RUN_QUEUE.md:782` |
| UI REVISE — see UI_REVISE_SPEC.md (decision record 2026-09-04/05: two looks by audience, Clubhouse structure,  | 2026-09-11 | 3d | `a3c1bea` | `RUN_QUEUE.md:1957` |

## Not started — the actual queue

1. SD-7b — assets, BLOCKED ON CAM: three real dashboard screenshots into — `RUN_QUEUE.md:423`
2. SD-8 — merge + split: Payments + Cancellations → one Money page with — `RUN_QUEUE.md:474`
3. SD-9 — funnel + auth polish: split the details sheet into a required core — `RUN_QUEUE.md:480`
4. MP-3 ORIGINAL SPEC (superseded by the above, kept for reference) — — `RUN_QUEUE.md:900`
5. MP-4 — pipeline reshape (split into 4a/4b/4c) — `RUN_QUEUE.md:907`
6. MP-4f — retire the JSON-in-actorName pattern. Three separate things — `RUN_QUEUE.md:990`
7. MP-5 — courses reshape (split into 5a–5e, ordered by what is wrong — `RUN_QUEUE.md:1012`
8. Golfer course directory (`/courses`) — NOT scheduled. If Cam wants — `RUN_QUEUE.md:1091`
9. MP-5e part 3 — the Overview relationship feed (notes + settings — `RUN_QUEUE.md:1095`
10. MP-6 — money reshape (split into 6a–6d, ordered by what is wrong today) — `RUN_QUEUE.md:1121`
11. MP-7 — comms merge (split into 7a–7b) — `RUN_QUEUE.md:1193`
12. MP-7b — announcement storage + thread lifecycle (SCHEMA CHANGE, — `RUN_QUEUE.md:1211`
13. MP-8 — chrome + System (split into 8a–8b) — `RUN_QUEUE.md:1218`
14. MP-8b — live cron dots (SCHEMA CHANGE, ATTENDED): CronRunLog table — `RUN_QUEUE.md:1235`
15. MP-9 — adopt the design system (was ADMIN_V4 V4-6, full spec in — `RUN_QUEUE.md:1242`
16. MP-11 — auth guard into the layout (was ADMIN_V4 V4-7; split 11a–11b) — `RUN_QUEUE.md:1289`
17. MP-12 — split courses/[id] (was ADMIN_V4 V4-9): 1,900 lines / 52 useState — `RUN_QUEUE.md:1338`
18. COURSE_LAYOUT_SPEC Phase L2 — booking page sells products: product selector on tee sheet, per-product slots/pricing/labels everywhere (big; answer the spec's OPEN QUESTION first) — `RUN_QUEUE.md:1364`
19. Tiny run: legal entity name fill-in (no migration) — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + /privacy with "TheGreenReserve LLC" + formation state (CAM: confirm  — `RUN_QUEUE.md:1393`
20. BIRDIE_AI_SPEC Phase B1 — Birdie assistant foundation + operator helper: /api/birdie/chat (Anthropic API, Haiku, streaming), persona/tools derived server-side from surface+session, — `RUN_QUEUE.md:1472`
21. UI_REVISE_SPEC H-2d-R1 — DESIGN DECISION, Cam: device-mockup shadows vs the CLAUDE.md ceiling. src/app/home.module.css:46 (.heroDevice .device), :48 (.heroSheet), :108 (.device), : — `RUN_QUEUE.md:1982`
22. CALL_SCHEDULING_SPEC Phase SC-1 — availability engine + Google (SCHEMA CHANGE, attended): CourseInquiry.callInviteToken/SentAt/ExpiresAt + Call.bookedByCourse/gcalEventId (migratio — `RUN_QUEUE.md:1989`
23. CALL_SCHEDULING_SPEC Phase SC-2 — the invite + the public booking page (no migration): sendCallInviteEmail auto-sent on inquiry submit (AUTO_SEND_CALL_INVITE flag); /call/[token] p — `RUN_QUEUE.md:1990`
24. CALL_SCHEDULING_SPEC Phase SC-3 — admin side (no migration): 'Send a booking link' beside Set up call / Skip, with sent-not-booked state + resend; sheet's Next-call cell learns 'In — `RUN_QUEUE.md:1991`
25. UI_REVISE_SPEC H-2f — CAM TO CONFIRM before running (2026-09-15, 'i like having the fade from slide to slide'): after H-2e the only hard section edges left on / are the two around  — `RUN_QUEUE.md:1995`

## Waiting on you (not on a build)

- CAM: three real dashboard screenshots into public/screenshots/ (empty, so the homepage shows three grey placeholder boxes) and a seeded demo course slug for DEMO_COURSE_SLUGS (empt — `RUN_QUEUE.md:423`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:565`
- Cam's approval for a prod backfill — `RUN_QUEUE.md:606`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:643`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:692`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:740`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:782`
- CAM: confirm the state before this runs — e — `RUN_QUEUE.md:1393`
- Cam: device-mockup shadows vs the CLAUDE — `RUN_QUEUE.md:1982`

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

- `21c8d25` 2026-09-15 — Security (IF-1 review): a re-submission of the lead form only carries new email/phone when it comes from the email on file; otherwise the admin's resubmit diff is labelled unverified and no contact change is recorded — a stranger who knows a course's name and town can no longer steer outreach to themselves
- `189f23b` 2026-09-15 — IC-5 review fixes: draft autosave is an atomic write on outcome=scheduled and stale responses are ignored client-side (a late autosave can no longer revert a logged call); recap email throws on a Resend rejection so 'emailed' is never false; MoneyInput shows an invalid state instead of silently saving nothing; draft/log writes only the fields sent; build flags fees and tee times that came from the call, not the sheet; recap subject bounded; season fields are months and walking uses the sheet's own options (spec table updated); recap notice covers 'nothing captured'
- `25baf6b` 2026-09-15 — IC-5: the call captures structured answers — lib/call-answers.ts (field catalog per agenda item, money in integer cents, v2 answersJson with the old prose shape still readable, one-line summaries, sheet prefill); Log-the-call card has real inputs per item, collapsed rows, autosave via save_call_draft with a visible status; log_call validates v2 and can email a recap; the setup sheet pre-fills empty keys from the call and says so; the build reads the call only for keys the sheet never touched; Still-need names missing fields; scripts/call-answers-test.ts 34/34
- `598d2f7` 2026-09-15 — queue/spec update (IC-5 phase block written from the queue entry + the code; §1 field catalog is the thing to review)
- `6f45772` 2026-09-15 — queue/spec update
- `206969b` 2026-09-15 — IF-1 review fixes: confirmation email now says pick a call time (same Calendly page as the success screen, until SC-2's invite link exists); the lead form's fields are HTML-escaped in both emails; call-preference arrays de-duped and capped; limiter keyed on the platform IP; JSON body and field types guarded; resubmit diff carries the booking method; semi-private gets a sheet path (passes + member booking + member rate); call answers outrank stale form answers for the sheet's branch defaults; the sheet's branch question reuses YesNo; dead needs block dropped from the confirmation email
- `52f7bc3` 2026-09-15 — IF-1: the inquiry form asks only what the call can't — ten inputs, the eight branch questions gone; booking method lands in currentBookingMethod, call-time chips in needsJson.callPreference; success screen points at picking a call; booking_today always on the agenda with the form's answer as context; the setup sheet asks its branching questions inline (saved → old form answers → call answers → ask) and never hides a section; admin Answers tab renders the new shape
- `47d9bb6` 2026-09-15 — H-2e review fixes: the nav blur fades with the white (transition covers backdrop-filter); the mobile menu closes when the bar hides; the H-1 shrink waits for the bar; the story's bottom wash moves to the story's end (outside the pin) and is off on phones; .device's near-cream fill recorded as deliberate
- `1a4d726` 2026-09-15 — queue/spec update (restore: a stale Cowork save reverted the H-2d-R2/R3/H-2e check-offs and dropped the H-2f draft; nothing new was in it)
- `c31b956` 2026-09-15 — queue/spec update
- `b0d3a14` 2026-09-15 — queue/spec update
- `01481f9` 2026-09-15 — H-2e: one ground, one logo — cream root (the white/cream banding was a bug), white step cards, cream footer, the story fades into cream at both ends; over the hero the nav is just the lockup, past it the bar fades in with Operator login + List your course; How it works/Pricing/FAQ links gone; Operator login in the footer

---

**Totals:** 180 done · 9 awaiting review · 1 in flight · 25 not started · 8 revise pages open · 15 ideas · 2 parked.
