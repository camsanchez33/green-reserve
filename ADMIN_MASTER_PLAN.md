# ADMIN MASTER PLAN — every admin surface, judged

Source: full admin deep dive, Aug 2026 — 19 pages, 42 API routes, the login doors,
the sidebar and the palette read to the last line, plus a live walkthrough.
Builds on the Round-1 defect audit (specced as ADMIN_V4) and Deep Dive 01
(Overview). Queued 2026-08-27; nothing from either plan had been run yet.

Pre-launch posture applies throughout — zero real customers, all test data, so
deleting pages and reshaping schemas is cheap. See the dev-stage-risk-posture
note. The four things that are still real: the Stripe platform account, email
that leaves the system, Cam's own admin account, and secrets.

## RECONCILIATION WITH ADMIN_V4 — read this first

This plan SUPERSEDES the ADMIN_V4 phase list, but does NOT cover all of it.
Five V4 items have no home here and would have been silently lost. They are
preserved as MP-9 through MP-11 below and in RUN_QUEUE. Mapping:

| ADMIN_V4 phase | Fate |
|---|---|
| V4-1 shell fixes (MainOffset 64px band, course-detail 165px overflow) | **NOT in this plan.** Survives as MP-0 — runs first, it is one line plus a tab strip |
| V4-2 token leaks (verify-operator `verificationToken`, inquiries `detailsToken`, change-password strength) | Partly in MP-2 (change-password, role gates). The two TOKEN LEAKS are **not** — folded into MP-2 explicitly below |
| V4-3 index migration | Absorbed into MP-3 (the one big migration) |
| V4-4 server-side pagination | **NOT in this plan.** Survives as MP-10. Lowest priority — measured 112–440ms today |
| V4-5 truth in status | Mostly absorbed: courses evidence → MP-5, health states → MP-5, revenue percentages → MP-6, vocabulary → MP-5/MP-6 |
| V4-6 design system adoption (codemod, ESLint guard, format.ts, Modal, a11y) | **NOT in this plan at all.** Survives as MP-9. This is the phase that stops the next audit finding the same class again — do not drop it |
| V4-7 layout auth guard + useResource | **NOT in this plan.** Survives as MP-11. It is also LAW rule 2 (see below) |
| V4-8 CronRunLog | Absorbed into MP-3 |
| V4-9 split courses/[id] | Referenced by MP-5 ("monolith break-up already ordered") — kept as its own run, after MP-9 |
| V4-10 broadcast safety | Absorbed into MP-7 (merge into Messages) + the parking decision |

**The LAW from ADMIN_V4_SPEC still governs and is not repealed by this plan:**
one page per surface never two; role resolved once in the layout and passed down;
shared components or it didn't happen; one formatter. MP-9 and MP-11 are how
rules 2–4 actually get built. ADMIN_V4_SPEC.md stays in the repo as the detailed
spec for those phases — this file does not restate them.

**Stale-citation warning carries over.** Both the Round-1 audit and this deep
dive state their source read at cb9bcb7, which is now behind (b07c6d0, 1a80fce
and anything since). RE-LOCATE EVERY FINDING BY SYMBOL, NEVER BY LINE NUMBER. A
cited line that doesn't contain the claim does not disprove the finding.

## §1 — THE SITEMAP DECISION

Main nav 9 → 6. Every survivor is touched daily. Nothing valuable is discarded:
parked pages keep their code and revive on a NAMED TRIGGER, not a feeling.

KEPT / RESHAPED: `/admin` (Overview, absorbs Activity strip + Money in Motion) ·
`/admin/inquiries` (→ queue-first Pipeline, absorbs manual build) ·
`/admin/courses` (detail 10 tabs → 6) · `/admin/messages` (absorbs the Broadcasts
composer) · `/admin/revenue` (Problems pinned on top, P&L on a collected basis) ·
`/admin/golfers` (record page; search moves to ⌘K).

UTILITY CLUSTER: `/admin/system` (+ platform card + live cron dots) ·
`/admin/employees` (demoted, renamed "Team & access") · `/admin/profile` (sole
home of change-password).

DELETED: `/admin/create` (its standalone path violates the sacred link by
construction — see MP-1 item 3) · `/admin/owner-login` (merged into one door).

PARKED WITH TRIGGERS: `/admin/broadcasts` (revive at ~10 active courses or the
first true platform-wide notice) · `/admin/activity` (revive when a normal day
produces >20 events, ~15–20 active courses) · a standalone `/admin/payments`
(revive when refund/dispute schema exists, or problems exceed one screen).

SIDEBAR ORDER follows the money's lifecycle — Overview · Inquiries · Courses ·
Messages · Revenue · Golfers — divider — System · Team & access · My profile ·
Sign out. BADGES ARE A PROMISE: only queues with a human action earn one —
Inquiries (pending, self-fetched so it survives navigation; today it renders only
when Overview passes the prop), Messages (unread), and a NEW red count on Revenue
for failed charges, which is uncollected money on a $1.50/head model and is
currently invisible until you click in. A dead cron gives System a dot, not a
number.

## §2 — FIX-NOW: ten bugs before any redesign

Three of these can cost a customer, a lead, or a course record today.

1. **Resent confirmation emails multiply every amount ×100.** VERIFIED
   2026-08-27, direction pinned: `src/lib/email.ts` divides by 100 throughout, so
   it expects CENTS; money is stored as cents in a `Float` column; the booking
   path passes the value raw while the support resend passes
   `Math.round(booking.greenFeeTotal * 100)` on every money field. A $50 green fee
   resends as $5,000.00. Support's ONLY golfer action is customer-visibly wrong.
   `api/admin/golfers/route.ts` (the resend payload) vs `api/bookings/route.ts`.
   Fix: pass the stored values through unchanged. Check every field in that
   payload, not just green fee.
2. **Reject/Archive is a one-way door for unbuilt leads.** Both restore paths call
   `set_status`, which refuses any inquiry not currently in a pipeline stage — so
   every restore 400s. The UI offers "Restore" and it never works, meaning a
   mis-clicked bulk archive permanently eats leads. `api/admin/inquiries/route.ts`
   vs `inquiries/page.tsx` and `inquiries/[id]`. Fix: allow the restore
   transition explicitly; add a test that archives then restores.
3. **A manually built course walks into the hard-delete trap.** The wizard builds
   without an inquiry → no sacred link → the orphan sweep (which dry-runs on every
   Courses visit) classifies it `would_delete`, and one click destroys the course,
   its schedules, its staff and the operator's login. No age guard.
   `api/admin/create-course/route.ts` · `lib/lifecycle.ts`. Fix per §1: the
   in-person path becomes "New inquiry (manual)" inside Inquiries — a synthetic
   inquiry first, then the existing build flow. Add an age guard to the sweep
   regardless.
4. **Admin tee-sheet cancel is a rogue second implementation.** It flips status
   and adjusts counts directly — no golfer email, no alert notifications, no
   already-cancelled guard, so two clicks corrupt slot capacity and overbook. The
   real `lib/cancel-booking.ts` service does all of it. `api/admin/tee-sheet`.
   Fix: delete the inline implementation, call `performCancellation`.
5. **"Retry charge" silently checks the golfer in.** The endpoint is
   `performCheckIn` verbatim, so clearing tomorrow's failed charge today marks the
   golfer checked in and fires the receipt email. No confirm dialog. (Idempotency
   is genuinely OK — the double-charge fear is mitigated.)
   `api/admin/retry-charge/[bookingId]` · `lib/checkin-booking.ts`. Fix: a
   collect-without-check-in variant, plus a confirm dialog naming what will happen.
6. **Phantom "pending" late-cancel fees, forever.** Money-in-Motion shows every
   fee-policy booking's stamped fee as pending unless charged — but free,
   before-cutoff cancels never clear the fields and the cron can never charge a
   cancelled booking. The six identical $10.00 rows Cam saw are this bug.
   `api/admin/revenue/route.ts` · `lib/cancel-booking.ts` ·
   `api/cron/cancellation-cutoff`. Proper fix is the `cancellationFeeApplies` flag
   in MP-3; clear the fields on free cancel now.
7. **A stale sheet link resurrects a closed inquiry.** The details routes block
   building/live/rejected but NOT archived, so an archived course's operator can
   reopen their old link, submit, and flip the inquiry back into the active funnel.
   Tokens never expire. `api/inquiries/details/route.ts`. Fix: block archived; give
   `detailsToken` an expiry.
8. **Broadcasts and Employees skip the 2FA invariant.** VERIFIED 2026-08-27:
   `broadcasts/route.ts:38`, `employees/route.ts:35` and `:64` all use
   `session.role !== 'owner'` — a raw role check that bypasses `requireOwner()`
   and therefore does NOT assert the `mfa` claim. Mass email and admin-account
   creation are the two most dangerous owner powers, and they are the only two
   that skip the invariant b07c6d0 built for exactly this. Fix: `requireRole(session,
   OWNER_ONLY)` (which routes through `requireOwner`) in all three places, and
   grep for any other `role !== 'owner'` / `role === 'owner'` session check.
9. **Deactivating an admin doesn't end their session.** `active` is checked at
   login only, so a deactivated admin keeps full access for up to 12h. The control
   does not do what its label promises. Fix: per-request `active` check in
   `resolveAdminSession`, or a `sessionVersion` column bumped on deactivate (the
   column is MP-3; the per-request check needs no migration and ships now).
10. **Password reset doesn't clear lockout.** A locked-out admin who completes
    forgot-password still gets "Too many attempts" with their brand-new password.
    Expired set-password tokens dead-end with no "request a new link".
    `api/admin/set-password` · `admin/set-password/page.tsx`. Fix both; also move
    reset tokens out of URL query strings — 24h session-granting tokens currently
    land in browser history.

## §3 — PAGE VERDICTS

### /admin — Overview · RESHAPE
Per Deep Dive 01: five zones — a one-row Today band (ET, booked + collected), the
deduplicated "Your Move" rail with a named next milestone, the revenue ticker
as-is, a Growth band (30d stats + demand-side counts + pipeline stock), and Fleet
Watch with a new `no_traction` health state. This plan adds two absorptions: a
Recent-activity strip (last 15 events, no filters — the Activity page's entire
useful surface at this scale) and Money in Motion (upcoming check-ins are a
"today" concept and were period-less on Revenue anyway). FIX FIRST: the UTC day
boundary — every "today" number currently resets at 8pm ET.

### /admin/inquiries + [id] — Pipeline · RESHAPE HARD
The growth engine: the only pages that turn a lead into a paying course.
LIST is three UIs stapled together — a work queue ("Your move", the default tab),
a CRM browser (funnel tabs + search + 4 filters + 4 sorts with per-tab sort
memory), and a records console (the Closed tab silently fires two data-repair
jobs on first visit). Five control layers over one row of data. Rebuild
queue-first: funnel strip on top (click to filter), the ranked queue as the body,
"All" and "Closed" demoted to footer links. Kill the filter panel and colour
legend at this volume.
DETAIL is the best-designed surface in the admin — keep it. The stepper,
Next-step card, go-live preflight and change-request loop all survive. Trim:
merge Contact + Answers into one "Lead" tab; give Notes its own tab (it is the
founder's working memory, currently buried under Activity); make the default tab
stage-aware; move Manual build into the header ⋮ menu.
FINDINGS: every email is fire-and-forget and the "Email failed" UI is dead code —
no action ever returns `emailSent`, so the failure branch cannot render, and a
bounced sheet email leaves an inquiry rotting in "sheet sent" with nothing
delivered. "Days in stage" is really "days since last write" (`updatedAt` resets
on any note or contact edit, so the diligent founder sees worse staleness data
than a lazy one — true stage-entry time already ships in `events`, unused).
"Your move" over-counts: all `building` inquiries are unconditionally your-move
even when a preview is out and it is THEIR move — the detail page knows the
difference, the list does not. Three divergent course builders
(build-without-sheet, `create_draft_course`, wizard) with different capabilities;
the wizard writes no status event, so the ledger has a hole — consolidate on
`create_draft_course`. No duplicate detection at intake. Reject captures no
reason, so "why do we lose leads" is unanswerable. Single and bulk transitions
disagree (bulk can Send Sheet from pending; single cannot).
OWNER GAPS → four cheap columns while migrations are free: `source` (the core
pre-launch growth question, currently unanswerable), `closedReason`,
`snoozeUntil` ("GM says call after Labor Day" currently nags forever or gets
archived), `nextFollowUpAt`. Plus estimated pipeline value from data already
captured (teeTimesPerDay × 4 × $1.50 × utilization) to rank a 200-slot muni over
a 40-slot par-3. The change-request brain currently rides on JSON-in-`actorName`
magic strings and should become a real table before volume.

### /admin/courses + [id] — RESHAPE · 10 tabs → 6
LIST: right bones, stripped evidence. The API ALREADY computes last-booking, 30d
bookings, trend and revenue for every row, and the row renders none of it — which
is why two courses both show a green "Healthy" pill with nothing behind it. Put
the evidence on the row (the data is already paid for). Rename "Offline" (it
lumps never-live drafts with deliberately-paused courses). Move the orphan sweep
off list-mount.
DETAIL: split the identity. The Business tabs (Overview / Transactions /
Documents / Messages) are genuinely admin. The Operations tabs are 80% a worse
copy of the operator's own /dashboard — the admin Schedule tab cannot even edit
(the PATCH endpoint has no UI caller, so fixing a fee typo means delete +
recreate, which regenerates tee times). NEW ROSTER: Overview · Money · Records ·
Messages · Operate (merged Tee Sheet + Schedule, ALL mutations through the shared
services) · Setup. Staff tab dies (its one real action moves to Overview's
contact rail); Members becomes a read-only card. Long term "Operate" wants to be
audited impersonation of the operator dashboard — the only approach that stays
drift-free at N=100.
FINDINGS: Take offline / Archive ignore existing future bookings — no cancel, no
refund, no notification, not even a count in the confirm, so golfers hold
confirmed tee times at a course whose page now 404s and the operator is never
told. "Feature" is a golfer-facing no-op: the flag drives an admin filter and an
ordering in `/api/courses`, which has ZERO callers — there is no golfer course
directory, so the header's most prominent button does nothing a golfer can see
(build the directory or remove the button). Health can lie two ways — no
`no_traction` state, and `welcomeEmailSentAt` doubles as "was ever live", so a
course whose welcome email failed reports "setup incomplete" forever after being
taken offline (needs a real `firstWentLiveAt`). The admin tee sheet filters to
`confirmed` only, so the day-of view EMPTIES as the day succeeds and slot chips
undercount. "Last activity" counts cancelled bookings — the one aggregate missing
a status filter, quietly defeating going-quiet detection. Schedule delete has no
confirm and never regenerates tee times, so the sheet keeps selling a deleted
schedule's slots for up to 8 days. Members' empty state references a "Load"
button that does not exist (it is a swallowed fetch error). Contract PDFs upload
as `access: 'public'` blobs.
OWNER GAPS: one chronological relationship feed on Overview (notes + settings
changes + messages + status events all exist, none rendered as a timeline); a
sheet-vs-live config diff (the "Mahwah, AL" vs "MAHWAH, NJ" typo is undetectable
today, both sides sit in the DB); operator engagement (last dashboard login); an
all-time "this course has earned GR $X" line — the number that ranks where the
week goes.

### /admin/create — DELETE as a destination
Its standalone path violates the sacred link by construction: no inquiry → no
timeline → no notes, no reminders, the agreement cannot be recorded so the course
can never legally go live, and the orphan sweep offers to hard-delete it
(fix-now #3). The in-person path becomes "New inquiry (manual)" inside Inquiries.
The wizard's form steps SURVIVE as the build UI — this deletes a route, not work.

### /admin/revenue — RESHAPE · problems on top, truth in the P&L
Two jobs fighting one URL: the owner's P&L truth (period-driven) and an ops
problems queue (now-driven). The source already admits it — sections render in
the order 1, 4, 3, 5, 6. Keep one page, separate the tempos: Problems (failed
charges, failed refunds, reconciliation) pinned to the top, ALL-TIME, with the
red sidebar badge — the one home for money-broken execution, and Overview's rail
links here instead of duplicating the queue. Below it, the P&L on a COLLECTED
basis. Money in Motion moves to Overview.
FINDINGS: the P&L mixes three accounting bases, so "net" is not a truth — fees
are accrual-at-booking (a no-show that stays confirmed counts as earned forever),
Stripe costs are cash-at-collection, expenses are prorated. Consequence: the
reconciliation banner fires STRUCTURALLY whenever bookings are created in one
window and checked in another — a false-alarm generator that trains you to ignore
the real one. Late-cancel fees are 100% course revenue displayed as GR money (the
cron charges them with `applicationFeeCents: 0`, yet they render under "Expected
revenue" beside "Our take", and the green "charged" chip is not final because the
fee refunds in full at check-in). There is NO refund UI anywhere in the product —
the only refund is automatic, and when it fails it is a `console.error` with a
comment saying support can do it in Stripe; the webhook handles exactly one event
type, so the first chargeback is invisible until the bank letter. Reconciliation
reports "true" when Stripe is unreachable. The failed-count column is
period-filtered while the queue is all-time, so they disagree. Net's percentage
across a sign flip is not information — show absolute dollars. CSV exports the
filtered subset without saying so, and no transaction-level export exists for an
accountant.
OWNER GAPS: unit economics (effective take per booking after Stripe's fixed
component — the margin story differs wildly between 1-player and 4-player
bookings, and the data is already fetched); payout history ("money that reached
the bank" — fetched, discarded); a refund log; no-show visibility (a no-show
stays `confirmed` forever, so no surface counts them at all).

### /admin/messages — KEEP + absorb Broadcasts
Broadcasts already live here — a broadcast literally inserts a message into every
course's thread, so the separate compose page is a second door to the same room.
Merge: an owner-only "Broadcast" composer mode inside Messages, history as a tab,
standalone page parks. Store the announcement ONCE with per-course read state
instead of N copied messages — which also stops one announcement from reordering
the entire inbox and overwriting every thread preview with "[Announcement]…".
FINDINGS: the staleness signal exists on the wrong page (Overview computes
"unanswered · 38d"; the Messages list shows two visually identical threads) —
unanswered-first sort + age badge, from the SAME logic, imported not
reimplemented. No thread lifecycle: nothing closes a thread, and archived
courses' threads stay listed, unlabelled and messageable, so you can email a
departed operator. GET has no role gate — a viewer reads every operator
conversation. Broadcast delivery is a lie waiting to happen: emails fire AFTER
the response returns (serverless can freeze them), "N emails delivered" is
computed from the recipient count rather than results, and preview, email and
thread-insert each use a DIFFERENT recipient filter.
OWNER GAPS: an inline context card per thread (course status, last booking) so
replying does not require tab-hopping; a response-time view; send-test-to-self.

### /admin/golfers — RESHAPE into a record page
The search half is redundant — the ⌘K palette already searches golfers; extend it
with phone + guest-booking matching and let it deep-link to
`/admin/golfers?id=…`. The record half deserves the investment, because today it
can look but barely touch. A real support call vs what exists: resend
confirmation — yes, but ×100 (fix-now #1) and it reports "Sent ✓" before the
email actually sends; resend receipt — no; cancel on the golfer's behalf — no
(the service exists, no admin route); refund — no; change email — no; card-update
link — no (hard declines dead-end at "needs a new card"); guest bookings render
with zero actions. `paymentStatus` — the one field that distinguishes card-on-file
from charged — is fetched and never rendered.
REDESIGN: three zones — identity + trust strip (rounds, no-shows, late cancels,
failed charges, lifetime collected: the difference between waiving a fee gladly
and spotting a serial no-show); a merged bookings + money timeline; an action row
(resend fixed, resend receipt, cancel via `performCancellation`, card-update
link, refund once the primitive exists). An admin audit log becomes necessary the
day a second person gets support access — the current resend log goes to
`console` only.

### /admin/employees · /admin/profile — KEEP, demoted / slimmed
Employees cannot be deleted — it is the only way to mint an admin account, and
the day the first hire signs it needs to work, not be rebuilt. But it does not
deserve main-nav placement next to Revenue for a team of one: demote to the
utility cluster as "Team & access", collapse to one card (roster + inline
role/deactivate + expandable add form), delete its duplicate change-password
card. GATE THE GET — currently any role reads the full roster including
`mustChangePassword` flags, i.e. a phishing target list. Profile becomes the sole
home of change-password; its API is the weak link (8-char minimum while
set-password enforces the real policy — fix-now #10 adjacent) and it sends no
"your password was changed" email on exactly the path an account thief would use.

### /admin/broadcasts · /admin/activity — PARKED with named triggers
BROADCASTS: with two operators you already talk to individually, "message every
operator" is Messages' job — and the profane test email sitting permanently in
history is the monument to a loaded weapon with no safety. Composer merges into
Messages (owner-only); the page leaves nav. REVIVAL TRIGGER: ~10 active courses,
or the first true platform-wide notice. Before first real use it needs:
send-test-to-self, awaited sends with real delivery counts, a reconciled
recipient query, and history hide/archive.
ACTIVITY: its steady state at this volume is "No events found" (the UTC +
30-day-default bug guarantees it even when events exist), and Overview already
deep-links into it from four places — it is an extension of Overview, not a
destination. Merge the last-15-events strip into Overview; park the page.
REVIVAL TRIGGER: a normal day producing >20 events (~15–20 active courses). FIX
REGARDLESS, since the strip reuses the API: the UTC boundary, and filter-change
resetting to page 1 (today a narrowed filter on page 3 shows an empty result with
the pagination controls hidden — a dead end).

### /admin/system — KEEP, make it able to turn red
Five cards of honest signposting ("not tracked in-app — go look there"), which
for a solo technical founder is genuinely better than a fake dashboard. Three
changes make it real: (1) every status dot is hardcoded neutral and two of five
links do not reach their target (Sentry links to the marketing homepage, Vercel
to the generic dashboard) — make links project-deep; (2) when `CronRunLog` lands,
the Crons card becomes the first card that can actually turn red; (3) absorb a
read-only Platform card (current fee amount, deployed commit/env, platform-Stripe
status — the API exists), which kills most of the argument for ever building a
Settings page. The orphan-sweep dry-run moves here from the Courses list, as the
data-integrity check it actually is.

### The doors — MERGE to one
The 2FA machinery is good — hashed codes, attempt caps, and the `mfa` claim
minted only after a verified second factor and asserted by `requireOwner`. KEEP
THAT INVARIANT UNTOUCHED (and fix-now #8 extends it to the two endpoints that
skip it). What goes is the two-door design: one `/admin/login` — email +
password, and when the account is an owner the SAME page steps to code entry.
That deletes a page, the owner-redirect interstitial, the cryptic dead end for a
non-owner at the owner door, and set-password's role-based URL fork — and finally
adds "Resend code" (today the only option is starting over with your password).
NOTE: this partially reverses ADMIN AUTH BOUNDARY items 1, 2 and 6 (shipped
b07c6d0) — the owner rejection and the `Owner sign-in →` link become an inline
step instead of a redirect. The SECURITY of that item (password checked before
role is revealed, `mfa` claim, `requireOwner`) is preserved exactly; only the
navigation changes. Do not let a run "simplify" the enumeration ordering while
merging the pages. Set/forgot-password keep their anti-enumeration behaviour.

### AdminSidebar · CommandPalette — KEEP; the palette is the search story
The palette (debounced, abortable, role-aware, recents) is good enough that a
global Search page is rejected outright. FIXES: nav items become real links
(middle-click, cmd-click — today they are `<button onClick={router.push}>`); the
inquiries badge self-fetches so it exists off-Overview (today it renders only
when Overview passes the prop, so navigating away makes pending inquiries vanish
from nav); the Golfers icon stops being a second magnifier in a 56px column that
already has one; palette rows gate by actual capability (Broadcasts is offered to
every role, and inquiry search has NO role gate while golfers requires
SUPPORT_PLUS — so a viewer can pull lead contacts).

## §4 — CONSIDERED AND REJECTED

- **`/admin/payments` standalone** — the problems queue gets one home at the top
  of Revenue with a sidebar badge. A separate page today is a clone with zero
  refund/dispute entities to fill it. TRIGGER: refund/dispute schema exists, or
  problems exceed one screen.
- **Global Search page** — the palette already is the search story; fix its
  gating and deep links instead. No plausible trigger.
- **Settings page** — platform config in env vars is correct for a solo deployer
  (git-audited, zero new attack surface on the most dangerous values in the
  system). The real gap — "what's live right now?" — is System's new read-only
  Platform card. TRIGGER: the first non-deployer who legitimately needs to change
  platform config.
- **Onboarding calendar** — Inquiries is the onboarding surface; two concurrent
  builds do not need a calendar. TRIGGER: >10 concurrent onboardings with
  date-bound commitments — and even then it is a view on Inquiries.
- **Reports/exports page** — the pattern is "CSV on every table", not a page.
  TRIGGER: an accountant asking for a recurring packet (starts as an emailed
  export).
- **Audit-log page** — a solo admin auditing himself is theatre, BUT audit data
  cannot be backfilled. Start the WRITE path now (actor, action, target on every
  admin mutation — 5-line additions, folded into MP-3). The page revives with the
  first employee, when it becomes the security control the role system implies.

## §5 — SCHEMA DEBTS, payable while cheap

Every one is a trivial migration at N=2 and a nightmare at N=100. ONE attended
run (MP-3) covers the lot. Additive-first; the money conversion is the only
non-additive piece and needs a data migration plus a full-codebase sweep.

| Change | Why now | Unlocks |
|---|---|---|
| Money `Float` → integer cents everywhere | The ×100 email bug IS this class; cents-in-a-Float is the worst of both | Kills the unit-confusion bug class |
| `PaymentEvent` ledger (fee_collected · cancel_fee_charged · cancel_fee_refunded · refund · dispute) | Refunds already happen and fail invisibly; the P&L is booking-field archaeology | Collected-basis P&L, refund log, golfer trust strip, honest reconciliation |
| Booking composite indexes (courseId+createdAt, status+createdAt, teeTimeId, golferAccountId) + Message.threadId, InquiryStatusEvent.inquiryId, CourseInquiry.builtCourseId, TeeTime.date | Zero indexes today; every admin query is a sequential scan (was ADMIN_V4 V4-3) | Every money surface at scale |
| CourseInquiry: `source` · `closedReason` · `snoozeUntil` · `nextFollowUpAt` | Growth questions (which channel converts, why we lose leads) are unanswerable | The pipeline that actually works leads |
| Real `ChangeRequest` table (retire JSON-in-`actorName`) | Approval state rides on magic strings; one reworded log line breaks it | Durable approval / change-request loop |
| `Course.firstWentLiveAt` (+ optional `offlineAt`) | `welcomeEmailSentAt` doing double duty corrupts health states | Honest offline-vs-never-live; drafts split from paused |
| `CronRunLog` + admin audit-log writes + `CourseOperator.lastLoginAt` | Crons charge cards with no heartbeat; audit cannot be backfilled; operator churn invisible | System page that can turn red · Overview heartbeat · engagement signal |
| `cancellationFeeApplies` flag, set at cutoff-crossing | Phantom pending fees pollute Revenue today (fix-now #6) | Money in Motion that tells the truth |
| `AdminUser.sessionVersion` | Deactivation doesn't end sessions (fix-now #9) | "Deactivate" that means it |

## §6 — RUN ORDER

Correctness before redesign; each run is one commit-shaped unit. OV-1…OV-3 come
from Deep Dive 01. MP-9/10/11 are the ADMIN_V4 survivors (see RECONCILIATION).

- **MP-0** — ADMIN_V4 V4-1 shell fixes. MainOffset one-liner for /admin +
  /dashboard, course-detail 165px overflow + scrollable tab strip, two
  overflow-hidden table wrappers, CLAUDE.md dark-theme correction. Runs first
  because it is one line and it is on every screen. *small · no migration*
- **MP-1** — Stop the bleeding. Fix-now #1–#7. *medium · no migration*
- **MP-2** — Auth & access. Fix-now #8–#10, plus the two ADMIN_V4 V4-2 token
  leaks (`verify-operator` returning live `verificationToken` + `setupLink` to
  any session; `inquiries` GET returning `detailsToken`), one-door login with
  inline 2FA step, tokens out of URLs, role gates on messages GET / employees
  GET / palette search. *medium · no migration*
- **OV-1** — Overview truth layer (ET boundaries, booked/collected, viewer money
  gate, error states). *medium · no migration*
- **MP-3** — THE BIG MIGRATION. All of §5 in one attended run. *attended*
- **MP-4** — Pipeline reshape. *big · after MP-3*
- **MP-5** — Courses reshape. *big*
- **OV-2** — Overview rail + bands; absorbs Activity strip + Money in Motion.
  *medium-big*
- **MP-6** — Money reshape (Revenue problems/collected-basis/payouts/unit
  economics; Golfers record page + support actions; failed-charge badge).
  *big · after MP-3*
- **MP-7** — Comms merge (Broadcasts into Messages, single-announcement storage,
  delivery truth, unanswered-first sort, thread close). *medium*
- **MP-8** — Chrome + System (sidebar links + self-fetched badges + demotions,
  palette gating, System project-deep links + Platform card + live cron dots,
  orphan sweep relocated). *small-medium · needs MP-3*
- **MP-9** — ADMIN_V4 V4-6: adopt the design system. Codemod to
  Card/Eyebrow/PageHeader/Btn, ESLint guard, `lib/format.ts`, promote Modal,
  baseline a11y. NOT in the deep dive; it is what stops the next audit finding
  the same class again. *big · no migration*
- **MP-10** — ADMIN_V4 V4-4: server-side pagination. LOWEST PRIORITY — every
  endpoint measured 112–440ms. Insurance, not firefighting. *medium*
- **MP-11** — ADMIN_V4 V4-7: auth guard into the layout + `useResource`. This is
  LAW rule 2 and it deletes the six redirect-on-catch bugs. *medium*
- **MP-12** — ADMIN_V4 V4-9: split `courses/[id]` (1,900 lines, 52 useState) into
  nine tab files + `useCourseDetail`. AFTER MP-9 so tabs inherit shared
  components. Overlaps MP-5's tab reshape — do MP-5 first and let this finish it.
  *big*
