# GreenReserve — running status

> **GENERATED FILE — do not hand-edit.** Regenerate with `node scripts/status.mjs`.
> Every line below is derived from `RUN_QUEUE.md`, `REVISE_QUEUE.md`, `ADMIN_MASTER_PLAN.md`
> and `git log`. If something here is wrong, the source doc is wrong — fix it there.

Generated 2026-10-20 01:32 UTC · branch `claude/walkthrough-2-prioritization-ui5xyu` · HEAD `f9338d3` · working tree **5 dirty file(s)**

## ⚠ Drift — git and the queue disagree

`RUN_QUEUE.md` was last committed **2026-10-17**. 40 commit(s) since then are not mentioned anywhere in it:

| commit | date | subject |
|---|---|---|
| `f9338d3` | 2026-10-20 | W2-4/5: price periods inside one schedule; Prices & fees reorganised |
| `223121d` | 2026-10-19 | Walkthrough 2 quick wins: homepage free hero, Birdie in the corner, owner label, last tee time at the end time (#148) |
| `95da45f` | 2026-10-19 | Member portal: show a resident their own spot at the resident rate, as booking charges (#146) |
| `9910cf6` | 2026-10-19 | Member portal: show members exactly what booking charges (#145) |
| `dbd4737` | 2026-10-19 | Status board: regenerate (#144) |
| `428da80` | 2026-10-19 | Birdie: Ask Birdie in the top bar on desktop; the phone launcher says Ask (#143) |
| `0419675` | 2026-10-19 | Contact: three paths, phone and inbox; the course's phone on Manage my booking (#142) |
| `b14b998` | 2026-10-19 | Course groups: one golfer page and one resident list for courses run together (#141) |
| `662f294` | 2026-10-19 | Members: import a list, and each member's last round (#140) |
| `9aba8a1` | 2026-10-19 | Settings: Who pays what, one table of every kind of golfer and their price (#139) |
| `a8c71b9` | 2026-10-19 | Tee sheet: the time's card — beside the sheet on a laptop, a full sheet on a phone (#138) |
| `c17100d` | 2026-10-19 | Dashboard nav: every tab fits on every screen (#137) |
| `668b8ce` | 2026-10-19 | Residents: staff keep a resident list; residents book at the resident rate (#136) |
| `73245fc` | 2026-10-19 | Status board after Settings part 2 and the pro shop (#135) |
| `cb884f2` | 2026-10-19 | Pro shop: catalog with stock, walk-up sales (cash or a pay link), sell page (#134) |
| `cd9c3a1` | 2026-10-19 | Settings part 2: guided course layout, booking rules, facilities checklist, Birdie writes the description; golfers see all of it (#131) |
| `1cf8419` | 2026-10-19 | Homepage hero: Learn more instead of Book a demo (#133) |
| `a37365e` | 2026-10-19 | Email: log Resend's message id and accept time for every send (#132) |
| `e226ed7` | 2026-10-19 | Members: a self-joined member put on a tier gets a pay link, and dues emails reach them (#130) |
| `27e358a` | 2026-10-19 | Members: list first, one plain dues line per member, remind count matches who actually gets emailed (#128) |
| `49d373a` | 2026-10-19 | Settings part 1: sections in setup order, a "Finish setting up" list, Staff and Your account split (#129) |
| `fc1c99e` | 2026-10-19 | Schedule rework: your week at a glance, named price periods, closed-days calendar, every save shows what it changes (#127) |
| `45ac49a` | 2026-10-19 | Add time: warn and ask once when a new time is within 5 minutes of another (#120) |
| `33ae355` | 2026-10-19 | Birdie tucks into an edge tab and stays clear of buttons; Messages says when we reply (#126) |
| `92cdf08` | 2026-10-19 | Payments and payouts: overview, payments by day, Stripe payouts table, cancellations history; policy lives in Settings (#124) |
| `7af1de5` | 2026-10-19 | Golfers tick a box to agree to the Terms and Privacy Policy before booking or changing a booking (#123) |
| `31b018f` | 2026-10-19 | 2FA page: says where the code went, new code by email or text (#119) |
| `25f5082` | 2026-10-19 | Hotfix: regenerating a day no longer wipes its open tee times (#125) |
| `8ef438a` | 2026-10-19 | Analytics rework (AN-3): one date button, golf-standard four, plain explanations, Ask Birdie; no tab-switch colour flash (#122) |
| `9450ca4` | 2026-10-19 | Legal: Terms, Privacy, Operator Agreement v2026-11 and Brand License match the product (#121) |
| `636b0ca` | 2026-10-18 | Homepage batch 2: no section lines, four feature tiles, Send us a note, phone frame, /for-courses without terms (#118) |
| `556cf10` | 2026-10-18 | Tee sheet batch 2: no logo box, Weather and Message renamed and explained, course alert can email today's golfers (#117) |
| `bb8b1cc` | 2026-10-18 | Operator login: photo panel beside the form, "Need help signing in?" (#116) |
| `014eadb` | 2026-10-18 | Tee sheet batch 1: awaiting check-in, tidy bar, alerts + key up top, tinted squares (#115) |
| `458b063` | 2026-10-18 | Homepage about section + 'Your AI assistant' on marketing pages (#114) |
| `1203da1` | 2026-10-18 | Walk 1 fixes: no fee on cash, dues lock, link previews, plain confirmation email (#113) |
| `a77263a` | 2026-10-18 | Homepage hero: 'The tee sheet your course deserves.' + Walk 1 decisions (#112) |
| `8c863b9` | 2026-10-18 | Launch security: late-fee dodge, party-size fees, phone takeover, booking flood (#111) |
| `8bc5a27` | 2026-10-17 | Homepage hero: links green above the ocean at dusk (#110) |
| `293f1d7` | 2026-10-17 | Homepage hero: sun through the pines photo (#109) |

**Meaning:** work shipped that the queue does not know about. Either record the run, or check the box.

### Uncommitted working tree (5 file(s))

- `M OPERATOR_REWORK_SPEC.md`
- `M docs/CODEMAP.md`
- `M docs/codemap.json`
- `M src/app/api/operator/schedule/preview/route.ts`
- `M src/lib/schedule-service.ts`

**A build looks mid-run** — new migration and/or source files are untracked. Do **not** apply
the queue header's `git checkout -- .` cleanup until that run has committed, or the work is gone.

## In flight

- **ROADMAP-1 — Cam 2026-10-07: build beyond the tee sheet, AI/BI first. The plan, order and open decisions live in `PLATFORM_ROADMAP_SPEC.md`: BI-1 monthly AI review (BUILT) → ACT-1 move a group → ACT-2 ** — `RUN_QUEUE.md:47`
  - PARTIALLY BUILT — shipped: BI-1 #92, ACT-1 #93, ACT-2 #94, MSG-1 v1 #95, SHEET-2 #97–99, POS-1a #106. Now: POS-1b. After launch: OUT-1, FB-1, PWA-1.

## Built but not signed off

Open checkbox **because the review has not run**, not because the code is missing.
This is the distinction a raw checkbox count gets wrong.

Nothing awaiting review.

## Not started — the actual queue

1. WALKS — CAM: live walks before launch (code merged; each needs real Stripe/Resend/phone). — `RUN_QUEUE.md:49`
2. RV-LEDGER — Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checke — `RUN_QUEUE.md:56`
3. LEGAL-ENTITY — GreenReserve LLC exists (NY, DOS ID 8033928, filed — `RUN_QUEUE.md:235`
4. CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf — `RUN_QUEUE.md:338`
5. BUG: orphan banner loops forever — BUILT b88c8bf — CAM: open /admin/courses → acknowledged orphans → Force delete DaisyLinks (or fold into the PRELAUNCH purge) — `RUN_QUEUE.md:2357`
6. SETUP — CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars; verify on /admin/system. Blob and Birdie done. — `RUN_QUEUE.md:2993`

## Waiting on you (not on a build)

- CAM: live walks before launch (code merged — `RUN_QUEUE.md:49`
- Cam: decide the open review-ledger items from 2026-10-05 (REVIEW_LEDGER) that were never queued — verify each against the code before building (this list was not checked against th — `RUN_QUEUE.md:56`
- Cam: which business address to publish, and confirming the Terms' governing law moves from New Jersey to New York (LLC is NY) — `RUN_QUEUE.md:235`
- CAM: add the courseName booking question in Cal-com — add a booking question with identifier `courseName` ("Golf course name") to the demo event, so homepage demo inquiries arrive  — `RUN_QUEUE.md:338`
- CAM: open /admin/courses → acknowledged orphans → Force delete DaisyLinks (or fold into the PRELAUNCH purge) Loop fix is code-verified: sweepOrphanCourses skips archived [ORPHAN] c — `RUN_QUEUE.md:2357`
- CAM: Twilio A2P 10DLC registration (or verified toll-free) + TWILIO_* env vars — `RUN_QUEUE.md:2993`

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
- MP-4f — actorName strings onto real rows (parked 2026-10-17 — TRIGGER: after launch, with Cam present for the backfill)
- Golfer course directory /courses (parked — TRIGGER: Cam wants browse/search)
- PB — private-club billing (parked 2026-10-17 — TRIGGER: Cam sets prices AND first private club signs)
- EV-2 — operator analytics reports (parked — TRIGGER: a live operator names the questions)
- Operator 2FA backup codes + staff sessionVersion (parked 2026-10-17 — TRIGGER: after launch, attended migration)

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
- Employees → Team & access nav move (from MP-8b)
- calcomUid column / atomic Cal.com dedupe (from CAL-2)

## Spec inventory

`open refs` = how many open queue items still point at this spec. Zero + old = fully consumed.

| spec | open refs | last touched | age |
|---|---|---|---|
| `CLAUDE.md` | 1 | 2026-10-19 | 0d |
| `PLATFORM_ROADMAP_SPEC.md` | 1 | 2026-10-17 | 2d |
| `HOMEPAGE_SPEC.md` | 0 | 2026-10-19 | 0d |
| `OPERATOR_REWORK_SPEC.md` | 0 | 2026-10-19 | 0d |
| `AGREEMENT_SPEC.md` | 0 | 2026-10-11 | 7d |
| `ADMIN_MASTER_PLAN.md` | 0 | 2026-10-07 | 11d |
| `ADMIN_REBUILD_SPEC.md` | 0 | 2026-10-07 | 11d |
| `ADMIN_V2_SPEC.md` | 0 | 2026-10-07 | 11d |
| `ADMIN_V3_SPEC.md` | 0 | 2026-10-07 | 11d |
| `ADMIN_V4_SPEC.md` | 0 | 2026-10-07 | 11d |
| `ARCHITECTURE.md` | 0 | 2026-10-07 | 11d |
| `BACKUP_OPS_SPEC.md` | 0 | 2026-10-07 | 11d |
| `BIRDIE_AI_SPEC.md` | 0 | 2026-10-07 | 11d |
| `CALL_SCHEDULING_SPEC.md` | 0 | 2026-10-07 | 11d |
| `CODEMAP_SPEC.md` | 0 | 2026-10-07 | 11d |
| `COURSES_SHEET_SPEC.md` | 0 | 2026-10-07 | 11d |
| `COURSE_LAYOUT_SPEC.md` | 0 | 2026-10-07 | 11d |
| `DESIGN_SYSTEM_SPEC.md` | 0 | 2026-10-07 | 11d |
| `FB2_COPY_SPEC.md` | 0 | 2026-10-07 | 11d |
| `FB3_FEE_PLAN_SPEC.md` | 0 | 2026-10-07 | 11d |
| `GOLFER_EDGE_SPEC.md` | 0 | 2026-10-07 | 11d |
| `GOLFER_SPEC.md` | 0 | 2026-10-07 | 11d |
| `HARDENING_SPEC.md` | 0 | 2026-10-07 | 11d |
| `INQUIRY_CALL_SPEC.md` | 0 | 2026-10-07 | 11d |
| `INQUIRY_FORM_SPEC.md` | 0 | 2026-10-07 | 11d |
| `MANAGE_BOOKING_SPEC.md` | 0 | 2026-10-07 | 11d |
| `ONBOARDING_SPEC.md` | 0 | 2026-10-07 | 11d |
| `ONBOARDING_V2_SPEC.md` | 0 | 2026-10-07 | 11d |
| `PRIVATE_BILLING_SPEC.md` | 0 | 2026-10-07 | 11d |
| `PRODUCTION_READINESS_SPEC.md` | 0 | 2026-10-07 | 11d |
| `PUBLIC_SITE_SPEC.md` | 0 | 2026-10-07 | 11d |
| `RECEIPT_SPEC.md` | 0 | 2026-10-07 | 11d |
| `REVIEW_SPEC.md` | 0 | 2026-10-07 | 11d |
| `SITE_DASHBOARD_SPEC.md` | 0 | 2026-10-07 | 11d |
| `STAFF_POLICY_SPEC.md` | 0 | 2026-10-07 | 11d |
| `UI_REVISE_SPEC.md` | 0 | 2026-10-07 | 11d |

## Recent commits

- `f9338d3` 2026-10-20 — W2-4/5: price periods inside one schedule; Prices & fees reorganised
- `223121d` 2026-10-19 — Walkthrough 2 quick wins: homepage free hero, Birdie in the corner, owner label, last tee time at the end time (#148)
- `abb4518` 2026-10-19 — queue/spec update (#147)
- `95da45f` 2026-10-19 — Member portal: show a resident their own spot at the resident rate, as booking charges (#146)
- `9910cf6` 2026-10-19 — Member portal: show members exactly what booking charges (#145)
- `dbd4737` 2026-10-19 — Status board: regenerate (#144)
- `428da80` 2026-10-19 — Birdie: Ask Birdie in the top bar on desktop; the phone launcher says Ask (#143)
- `0419675` 2026-10-19 — Contact: three paths, phone and inbox; the course's phone on Manage my booking (#142)
- `b14b998` 2026-10-19 — Course groups: one golfer page and one resident list for courses run together (#141)
- `662f294` 2026-10-19 — Members: import a list, and each member's last round (#140)
- `9aba8a1` 2026-10-19 — Settings: Who pays what, one table of every kind of golfer and their price (#139)
- `a8c71b9` 2026-10-19 — Tee sheet: the time's card — beside the sheet on a laptop, a full sheet on a phone (#138)

---

**Totals:** 298 done · 0 awaiting review · 1 in flight · 6 not started · 8 revise pages open · 17 ideas · 7 parked.
