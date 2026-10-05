# Full-site review — find every problem, in an order that matters

Cam 2026-10-05: "make a very detailed plan ... go through everything and review to
find every little problem and need a organized way to find it."

Read CLAUDE.md first. This spec is REVIEW ONLY until Phase 4. Nothing gets fixed
while a lane is being reviewed: a fix mixed into a review diff has no record, no
test and no reviewer, and it hides what the lane actually found.

---

## 0. What "every problem" means here (read before starting)

"Every little problem" has no end on 382 files / 204 routes / 108 libraries /
35 models. Treated literally, it produces 400 nits about spacing and buries the
one double charge. So this plan makes "every" **measurable** and **ranked**:

- **Measurable:** every route, every model writer, every cron, every email and
  every booking state transition is a row in a coverage checklist (§2). The review
  is done when every row has a verdict — not when someone feels finished.
- **Ranked:** every finding gets a severity (§1). Fix order follows severity, never
  discovery order.

Ground truth for "correct" is **CLAUDE.md + PRODUCT_DECISIONS.md**, not the older
`*_SPEC.md` files. The specs are history and contradict each other (FB-3 "every
booking saves a card" vs SP-B "card only when a fee can charge it"). A finding that
only says "code disagrees with an old spec" is **not** a finding until it is checked
against the latest decision.

---

## 1. The findings ledger — one place, one format

`REVIEW_LEDGER.md` at the repo root (a doc file, committed "queue/spec update").
One row per finding:

| id | lane | sev | where | what's wrong | evidence | status |
|---|---|---|---|---|---|---|
| R-PAY-003 | Money | S1 | `src/lib/checkin-booking.ts:142` | refund of hold fee skipped when … | repro steps / test output | open |

**Severity**

| sev | meaning | examples | fix rule |
|---|---|---|---|
| **S1** | money, data, security or tenant leak | double charge, missed refund, course A sees course B, unguarded write route, booking over capacity | fixed before anything else, one per run, with a regression test |
| **S2** | a real user flow is broken or dead-ends | golfer can't finish booking on mobile, staff action fails silently, email never sends | queued in RUN_QUEUE.md, regression test where a script can prove it |
| **S3** | wrong or confusing, but the flow completes | misleading copy, wrong policy wording, missing pending state, stale number | batched by surface |
| **S4** | polish | spacing, a stray icon, a design-guard ratchet item | batched; reskin rules apply (zero behavior) |

**Rules**
- **Evidence or it isn't a finding.** A file:line PLUS either a reproduction, a
  failing script, or a quoted code path. "Looks risky" goes on a separate
  *needs confirmation* list at the bottom of the ledger.
- **Dedupe on the root cause, not the symptom.** Five pages missing an error state
  because they share one fetch helper is ONE finding against the helper.
- IDs are `R-<LANE>-<nnn>` and never reused.

---

## 2. Coverage checklist — the "every" made countable

Generated, not hand-written (same principle as CODEMAP): add
`scripts/review-coverage.mjs` that reads `docs/codemap.json` and writes
`REVIEW_COVERAGE.md` with one unchecked row per:

- route (204), with its auth/guard column copied from the code map
- model and each file that writes to it (35 models)
- cron job in `vercel.json` (5) and the Stripe webhook
- email sender (every call through `getResend()` in `src/lib/email.ts`)
- booking state transition in CLAUDE.md's "Booking status flow" (11 arrows)
- staff permission key in `src/lib/staff-permissions.ts`
- Birdie tool and proposal route

Each row ends as `✓ ok`, `✗ R-xxx-nnn` (links the ledger) or `– n/a (reason)`.
Progress = checked rows ÷ total rows. That's the progress number Cam can track.

---

## Phase 0 — Baseline before reading a line of code (1 run)

Why first: the repo has ~15 test scripts (`scripts/*-test.ts`: concurrency,
isolation, booking-window, course-time, staff/settings validation, Birdie
isolation, schedule-conflict …) and **CI runs none of them**. CI only runs tsc,
design-guard, code-map drift, schema-check and Lighthouse. Nobody knows whether
those tests pass today. Reviewing by eye what a script can already prove is
wasted effort.

1. Local Postgres up, `migrate deploy` from scratch, seed a test course with:
   fee policy (hold at cutoff), late-cancel policy, no-card policy, a member
   tier, two staff logins (Legacy preset + a narrow preset).
2. Run every `scripts/*-test.ts`. Record pass/fail per script in the ledger header.
   Every failure becomes a finding immediately.
3. `npx tsc --noEmit`, `node scripts/parse-check.js src`,
   `node scripts/design-guard.mjs`, `node scripts/codemap.mjs`. Record counts
   (design-guard baseline size = the S4 backlog already known).
4. Generate `REVIEW_COVERAGE.md` (§2).
5. **Proposal for Cam (decide, don't build in this run):** a `tests.yml`
   workflow that runs the DB-backed scripts against a Postgres service container
   on every PR. Without it, this review is a one-time snapshot that decays.

Exit: ledger exists, every script has a recorded result, coverage file generated.

---

## Phase 1 — Lanes, highest risk first

Each lane = **static read** (an auditor agent over an explicit file list, not a
diff) + **live walk** (Playwright against the local seeded app — real clicks, not
reading JSX). Lanes are independent, so they can run in parallel sessions; order
below is the order to fix in if time runs short.

### Lane 1 — Money (S1 territory)
Files: `src/lib/stripe.ts`, `access-fee.ts`, `cancel-policy.ts`, `checkin-booking.ts`,
`src/app/api/stripe/webhook`, `api/cron/hourly`, `api/cron/cancellation-cutoff`,
`api/operator/bookings`, `api/manage/*`, membership payment routes.
Check every arrow of the booking status flow against code, for each policy type
(no card · hold_at_cutoff · late_cancel · late_cancel_or_no_show):
- [ ] book → cancel before cutoff: nothing charged, SetupIntent card not left orphaned
- [ ] cutoff passes: hourly charges exactly once; daily safety net does NOT re-charge (paymentStatus dedup)
- [ ] hold refunded at check-in — staff path AND golfer self check-in AND `paid_offline` (the CLAUDE.md exception)
- [ ] late cancel: fee + $1.50 charged, non-refundable, correct connected account
- [ ] no-show (staff + auto N min after): fee charged; "still coming" refunds BOTH charges
- [ ] no-card course: pay link sent `checkInWindowHours` before; no path tries to charge a null PaymentMethod
- [ ] card declined at each charge point: what the golfer, staff and admin each see
- [ ] Stripe webhook replayed twice: idempotent; logged as `webhook:stripe`
- [ ] amounts: cents vs dollars at every boundary; per-booking vs per-player fee math
- [ ] policy copied onto Booking at creation — changing course policy later does not alter existing bookings
Walk it: Stripe test mode, test cards 4242 / 4000000000000341 (attach ok, charge fails) / 4000002500003155 (3DS).

### Lane 2 — Booking integrity
`claimTeeTime`, booking routes, operator manual booking, member booking,
`generate-tee-times`, schedules, blocked days.
- [ ] capacity invariant on every path that books (concurrency-test covers golfer path — does it cover operator + member?)
- [ ] time zones: course in a different zone from the server; DST weekend (Nov 1 2026); midnight-crossing slots
- [ ] booking window edges; past tee times can't be booked or deleted
- [ ] schedule edit with existing bookings on generated slots
- [ ] cancel → slot reopens with the right remaining capacity; waitlist notified

### Lane 3 — Auth, tenant isolation, permissions
Source: the code map's guard column for all 204 routes.
- [ ] every `/api` route: guard is `file` or `middleware`, never `client-side`
- [ ] the 3 `NONE FOUND` pages (`/courses/[slug]/account`, `/courses/[slug]/member`, `/dashboard/onboarding`): confirm their data comes only from guarded APIs
- [ ] every operator route scopes by the session's courseId, never a courseId from the body/query
- [ ] every staff-reachable route calls `requirePermission`; walk each preset and try each forbidden action by direct request, not by UI
- [ ] tokens (`/checkin`, `/manage`, `/call`, receipt): expiry, guessability, reuse after cancel
- [ ] session table in CLAUDE.md matches `src/lib/auth.ts` (TTLs, sliding renewal)
- [ ] Birdie: `birdie-isolation-test.ts` passes; no tool reads across courses; no proposal reaches money/policy/staff
Agent: `security-auditor` with the route list per area (admin 72, operator 57, public 43, golfer 20, member 7, cron 5).

### Lane 4 — Crons, emails, background work
- [ ] every cron in `vercel.json` is wrapped in `cronRoute()` and shows on Admin → System
- [ ] every route: no un-awaited promise (gotcha 6) — grep for `send`/`create` calls not awaited and not in `after()`
- [ ] every email goes through `getResend()` (gotcha 7) — grep for `new Resend(`
- [ ] each email: renders in Gmail + Outlook (Cam, manual), logo top-left, policy text via `describePolicy()` only
- [ ] reruns: running each cron twice in an hour sends nothing twice

### Lane 5 — Operator dashboard (daily use)
Tee sheet, check-in, bookings, settings, staff, analytics, members, Birdie.
- [ ] walk a full Saturday on the seeded course as owner and as narrow staff: book walk-in, check in, paid offline, no-show, still coming, block a time, edit a booking
- [ ] mobile width (bottom nav) for each of the above
- [ ] every action: pending state → success or explicit error (no-silent-failures rule applies here too)
- [ ] tee sheet vs homepage demo (`TeeSheetDemo.tsx`) still match (FLOW-2)
- [ ] AN-1: no KPI tiles on operational tabs; analytics owner-only

### Lane 6 — Golfer pages
Course page, book, confirmation, manage, check-in, receipt, account, member portal.
- [ ] each policy type: the wording the golfer sees at booking = `describePolicy()` = what is actually charged (lane 1)
- [ ] card asked for only when `cardRequired()`; Stripe JS loads only then
- [ ] phone width 360px, slow 3G: no layout break, perf budget passes
- [ ] PERS-1: course photo/logo/note render, and fallbacks when missing
- [ ] every error a golfer can hit (slot filled, card declined, expired link) has human copy and a way forward

### Lane 7 — Admin
- [ ] `admin-ux-auditor` over all of `src/app/admin` (not a diff) — no-silent-failures rule
- [ ] onboarding pipeline: each status transition, each email it sends
- [ ] Cal.com: webhook signature, create/move/cancel, unset `CALCOM_BOOKING_URL` fallback
- [ ] Admin → System reflects reality (break a cron locally, confirm it goes red)

### Lane 8 — Design and copy consistency (S3/S4 only)
- [ ] `design-auditor` over every page; design-guard baseline list = existing backlog
- [ ] TYPE-2/TYPE-3 sweep holds; no banned classes; no dark backgrounds
- [ ] marketing fee copy still frozen behind LQ-2
- Do this lane LAST. It produces the most findings and the least risk.

### Lane 9 — Ops readiness
- [ ] `/api/health` and `prisma migrate status` on prod (Cam or attended run)
- [ ] every env var in `docs/SHIPPING.md` set in Vercel (names only, never values)
- [ ] backup workflow green; a restore has actually been tested (`docs/RESTORE.md`)
- [ ] Sentry receives an error from prod

---

## Phase 2 — What only Cam can check (manual list)

Things no code read or local run can verify. The review produces this as a
walkable checklist with URLs; examples:
- Stripe dashboard: webhook endpoint registered, live Connect accounts healthy
- a real booking on a real phone, in the real course's brand
- emails landing in Gmail/Outlook inboxes, not spam
- Cal.com booking end to end against the real Outlook calendar
- Birdie against the live model (already on Cam's list)

---

## Phase 3 — Triage (Cam, ~30 min)

Ledger sorted by severity. Cam marks each S2/S3: fix / defer / won't fix.
S1s are not up for deferral.

## Phase 4 — Fix

- S1: one per run via `/gr-debug`, each with a regression test added to `scripts/`
  (and to CI if Phase 0's proposal was approved).
- S2: become RUN_QUEUE items, normal `/gr-run` → `/gr-review`.
- S3/S4: batched by surface; S4 visual-only items can go through `/gr-batch`.

## Done means

1. Every row in `REVIEW_COVERAGE.md` has a verdict.
2. Zero open S1. Every S2 either fixed or explicitly deferred by Cam.
3. Every Phase 0 test script passes, and (if approved) runs in CI.
4. Status board regenerated.

Not "zero problems." That bar can't be reached, so it can't be measured.

---

## Execution estimate

- Phase 0: 1 attended run.
- Phase 1: lanes 1–3 are the heavy ones (~1 run each); 4–7 ~½ run each; 8–9 small.
  Run in parallel as separate sessions, or as one multi-agent workflow (≈9 auditor
  agents + verifiers — sizeable token cost; Cam opts in explicitly).
- Phase 2/3: Cam's time.
