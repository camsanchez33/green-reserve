# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-09-16 01:33 UTC · branch `main` · HEAD `07a8952` · working tree **1 dirty file(s)**

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
| MP-0 — shell fixes (was ADMIN_V4 V4-1): MainOffset one-liner for /admin | 2026-08-29 | 17d | `7246a62` | `RUN_QUEUE.md:500` |
| MP-1 | 2026-08-29 | 16d | `41f5ea8` | `RUN_QUEUE.md:530` |
| MP-1b — HOTFIX after /gr-review MP-1, SHIPPED 4ef11dd. Box open until | 2026-08-29 | 16d | `4ef11dd` | `RUN_QUEUE.md:565` |
| MP-2 | 2026-08-29 | 16d | `958f229` | `RUN_QUEUE.md:606` |
| MP-2b | 2026-08-29 | 16d | `a134af5` | `RUN_QUEUE.md:643` |
| MP-2c | 2026-08-29 | 16d | `e5b5413` | `RUN_QUEUE.md:692` |
| MP-2d | 2026-08-29 | 16d | `22d0f68` | `RUN_QUEUE.md:740` |
| MP-2e | 2026-08-30 | 16d | `bf3bcb2` | `RUN_QUEUE.md:782` |
| UI REVISE — see UI_REVISE_SPEC.md (decision record 2026-09-04/05: two looks by audience, Clubhouse structure,  | 2026-09-11 | 4d | `a3c1bea` | `RUN_QUEUE.md:1957` |

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
19. Tiny run: legal entity name fill-in (no migration) — Cam 2026-09-15: SKIP until counsel confirms the formation state. — replace the {{COMPANY_LEGAL_NAME}} placeholder in /terms + / — `RUN_QUEUE.md:1393`
20. BIRDIE_AI_SPEC Phase B1 — Birdie assistant foundation + operator helper: /api/birdie/chat (Anthropic API, Haiku, streaming), persona/tools derived server-side from surface+session, — `RUN_QUEUE.md:1472`

## Waiting on you (not on a build)

- CAM: three real dashboard screenshots into public/screenshots/ (empty, so the homepage shows three grey placeholder boxes) and a seeded demo course slug for DEMO_COURSE_SLUGS (empt — `RUN_QUEUE.md:423`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:565`
- Cam's approval for a prod backfill — `RUN_QUEUE.md:606`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:643`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:692`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:740`
- pending Cam's approval for a prod write — `RUN_QUEUE.md:782`
- CAM: confirm the state before this runs — e — `RUN_QUEUE.md:1393`

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

- `07a8952` 2026-09-15 — SC-3: the admin side — 'Send a booking link' on the set-up-call card (send/resend via send_call_invite, 'Booking link sent <date> · not booked yet'); the sheet's Next-call cell shows 'Invite sent · Nd ago' and marks a course-picked call 'they picked it'; an invite unanswered 5+ days is a yourMove signal ('Invite sent 6 days ago, no time picked'); 'Talking tomorrow' reminder 24h before each scheduled call on the hourly cron, once per call; the System page shows CALL_WINDOWS and which Google calendar is the real filter; callInviteToken stripped from admin responses
- `722934f` 2026-09-15 — SC-2 review fixes: book and reschedule share one SERIALIZABLE guarded write that tests overlap against every scheduled call in the window (a serialization failure answers slot_taken); per-inquiry cap on the booking POST; phone sanitised; a lone CR is a line break in the .ics; closed inquiries read as an expired link; the lead form mints the token synchronously but delivers the invite in the background so Resend can never delay or fail a submission; the resubmit path's confirmation reuses a live invite link; the header carries the editable phone; a reschedule keeps the call's real length; the they-call toggle seeds from the booked call; ARCHITECTURE.md regenerated for the new route
- `88242e2` 2026-09-15 — queue/spec update
- `fffb2cc` 2026-09-15 — SC-2: the invite, the page, the emails — sendCallInvite issues a 21-day token and emails 'Set up your call' straight from the inquiry POST (a send failure never fails the submission; the confirmation's button uses the same link; the admin alert says when the invite did not go); /call/[token] shows Cam's open 30-minute slots (preference first, all times Eastern), confirms with an editable phone and a they-call toggle, then becomes the manage view with Reschedule and Cancel; the API re-verifies the slot and writes the Call inside a transaction (409 slot_taken), creates/moves/deletes the Google event, logs the timeline, and sends the course a confirmation with a .ics plus Cam a heads-up; Google unreachable → honest fallback + alert to hello@; noindex, rate-limited
- `5ea6455` 2026-09-15 — SC-1 review fixes: free/busy cache keyed on 5-minute buckets and evicted (it could never hit before); 8s timeouts on every Google fetch; error strings name the operation, not the path with the calendar id; scope narrowed to events + readonly; openSlots steps the Eastern calendar date so DST never skips or doubles a day (tests added, 26/26); the check script's run line loads .env.local and retries the delete
- `d66bc69` 2026-09-15 — queue/spec update
- `bab429b` 2026-09-15 — H-2d-R1 + H-2f (Cam 2026-09-15): the homepage device mockups keep their soft shadows and the cream hand-off dissolves are the only allowed gradients — CLAUDE.md BANNED line amended; the pricing slab now dissolves from and into cream at both edges (18vh, under the content, off on phones) like the story
- `32d985e` 2026-09-15 — SC-1: call invites + availability — migration call_invites (CourseInquiry.callInviteToken/SentAt/ExpiresAt, Call.bookedByCourse/gcalEventId, additive); lib/call-availability.ts (30-min slots in Cam's windows minus busy blocks and scheduled calls, preference orders never removes; 22/22 tests); lib/google-calendar.ts (service-account JWT via jose, freebusy cached 5 min and throwing, create/move/delete events never throwing into a booking); scripts/google-calendar-check.ts for the live round trip once GOOGLE_* env is set; env names recorded in SHIPPING + PASSWORD_CHECKLIST
- `236096e` 2026-09-15 — queue/spec update
- `21c8d25` 2026-09-15 — Security (IF-1 review): a re-submission of the lead form only carries new email/phone when it comes from the email on file; otherwise the admin's resubmit diff is labelled unverified and no contact change is recorded — a stranger who knows a course's name and town can no longer steer outreach to themselves
- `189f23b` 2026-09-15 — IC-5 review fixes: draft autosave is an atomic write on outcome=scheduled and stale responses are ignored client-side (a late autosave can no longer revert a logged call); recap email throws on a Resend rejection so 'emailed' is never false; MoneyInput shows an invalid state instead of silently saving nothing; draft/log writes only the fields sent; build flags fees and tee times that came from the call, not the sheet; recap subject bounded; season fields are months and walking uses the sheet's own options (spec table updated); recap notice covers 'nothing captured'
- `25baf6b` 2026-09-15 — IC-5: the call captures structured answers — lib/call-answers.ts (field catalog per agenda item, money in integer cents, v2 answersJson with the old prose shape still readable, one-line summaries, sheet prefill); Log-the-call card has real inputs per item, collapsed rows, autosave via save_call_draft with a visible status; log_call validates v2 and can email a recap; the setup sheet pre-fills empty keys from the call and says so; the build reads the call only for keys the sheet never touched; Still-need names missing fields; scripts/call-answers-test.ts 34/34

---

**Totals:** 185 done · 9 awaiting review · 1 in flight · 20 not started · 8 revise pages open · 15 ideas · 2 parked.
