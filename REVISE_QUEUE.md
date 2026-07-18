# REVISE QUEUE — the meticulous page-by-page pass

Process per page (no exceptions):
1. TEARDOWN — Cam walks the page like a hostile user: screenshots + notes on
   everything (layout, copy, data correctness, dead ends, silent failures,
   mobile width). Browser-audit assist optional.
2. SPEC — Cowork distills the teardown into this file as the page's spec
   block (replaces the placeholder under the page's entry).
3. BUILD — Claude Code runs that page's spec block only. No migrations inside
   revise runs; anything needing schema or a real feature becomes its own
   RUN_QUEUE.md item and is linked, not smuggled in.
4. VERIFY — Cam re-walks the live page. Only then does the box get checked.

Rules: Clubhouse design system, no-silent-failures, size doctrine (big logo
= homepage only), white-label rule on golfer surfaces, perf budgets. One page
in flight at a time.

---

## SURFACE 1: ADMIN (in progress)

- [x] A-01 /admin — Overview — SPEC v2 (designed with Cam, 2026-07-16):
  BUILT: 9b5558c. Sections 1-7 built to spec. Section 8 (Systems Line) shipped
  as honest external links (GitHub Actions / Vercel / Stripe dashboard) with
  neutral StatusDots, not live status — none of backup/cron/webhook/CI status
  is tracked anywhere in the app, and wiring real checks needs new persistence
  (a schema change, out of scope for a revise run). Live-status version is a
  candidate RUN_QUEUE.md item if wanted.
  PRINCIPLES: organization, order, reason. Page reads top-to-bottom as:
  today's pulse → what's stuck → how's the trend → who's producing → is the
  machine healthy. Full-width responsive layout (kill the half-screen container).

  1. TOP STRIP — the morning pulse, in THIS order (Cam's scan order):
     a. FEES TODAY: GR fees since midnight ($) + bookings today (count), with
        small substats: check-ins today, cancellations today.
     b. UNREAD: operator messages + inquiry replies awaiting a reply (count +
        newest sender name) → deep-links to Messages.
     c. WAITING: new inquiries not yet acted on (count + oldest age) + drafts
        awaiting review (count) → deep-links to Inquiries.
     Each is a clickable card. This strip answers "how's business today and
     what's in my inbox" before any scrolling.

  2. ACTION QUEUE — blockers + stalls ONLY (the "Inbox=new, Queue=stuck"
     rule: fresh items live in the top strip counts; they enter the queue
     only when they AGE past thresholds — nothing is listed twice):
     - RED (money broken): failed charges (with $ amount + decline reason),
       live course with Stripe incomplete/disabled.
     - AMBER (stalled): inquiry waiting on us >3d, draft unreviewed >2d,
       preview sent no reply >5d, sheet sent no response >7d, message thread
       unanswered >2d.
     - Row anatomy: severity dot · who · WHY in plain English with the
       number that matters · age · ONE action-verb button deep-linking to the
       exact fix. Cap 5 per tier + "View all N →" to the filtered tab.
       Tier headers carry counts. Empty state: "All clear — nothing stuck."

  3. REVENUE CHART — Day / Week / Month toggle, daily/weekly/monthly BARS:
     gross (all courses) + GR fees as paired series on separate scales (fees
     must stay readable next to gross). GHOST BARS: faint prior-period bar
     behind each bar (this Tue vs last Tue, this month vs last) so comparison
     is built into every glance. Tooltip: period, gross, fees, bookings.
     Zero periods render at baseline, never gaps. No new heavy chart deps.

  4. 30-DAY ROW — compact stat row under the chart: live courses, bookings
     (30d), GR fees (30d) — honest deltas only (A0 rule, "—" when no prior),
     each clicks through.

  5. TOP COURSES (30d) — keep; bookings + fees + trend arrow per row; rows
     link to course pages; cap 5. (At 1000 courses this is the "who matters"
     shortlist, not an inventory.)

  6. QUICK ACTIONS — deleted (sidebar = navigation, queue = work).
  7. RECENT ACTIVITY — deleted from Overview (raw log lives in /admin/activity;
     today's summary is the top strip).
  8. SYSTEMS LINE — quiet bottom row: last backup ✓/date · crons ✓ · Stripe
     webhook last event · CI status. StatusDots + links. 30-second health check.

- [x] A-01b Overview follow-up (from Cam's verify pass) — BUILT: 84c9387. P&L-style header: the
  chart's headline numbers FOLLOW the Day/Week/Month toggle like a stock P&L —
  Day shows fees earned TODAY (+ gross today), Week shows this week, Month
  shows this month, each with "vs prior period" delta next to it (ghost-bar
  logic, now in the numbers). Default view = Day. The static 30d totals move
  down into the 30-DAY ROW where they already have a home.
- [x] A-01c Overview chart follow-up — BUILT: 485eab0. (1) the CHART re-buckets with the
  toggle, not just the header: Day = last 30 daily bar-pairs (current
  behavior), Week = last 12 weekly bars (Mon-Sun totals), Month = last 12
  monthly bars — ghost bar behind each = the corresponding prior period
  (last year's month for months). X-axis labels match the bucket (Jul 4 /
  "Wk of Jul 14" / "Jul"). (2) Honest in-progress deltas: an unfinished
  period never shows a scary drop against a FINISHED prior — "$0.00 ↘100%
  vs last Sat" at breakfast is noise, not signal. Rule: while the current
  period is incomplete, compare against the prior period UP TO THE SAME
  POINT (same time-of-day / same day-of-week/month) and label it "so far";
  if there's simply no data yet, show "no bookings yet today" with no arrow
  at all.
- [x] A-01d Overview round-3 refinements (Cam's verify pass, 2026-07-18) — BUILT: b3ff0d7.
  Item 3(c) group-then-fire only implemented for failed charges (the one
  place duplicates actually recur per course today); other AMBER categories
  are naturally ~1-per-course already. Item 5's Crons/CI live-status via
  GitHub API skipped — no GITHUB_TOKEN configured, so it's an honest
  link-out instead; heartbeat table is flagged as a future schema item.
  Operator-inactivity signal in the Course Health Watchlist skipped for the
  same reason (no login-timestamp field). Everything else built as spec'd:
  1. HEADER earns its place: drop the "Everything happening across
     GreenReserve" slogan; show today's date + a quiet "updated Xs ago"
     (auto-refresh or refresh button integrated). Title stays.
  2. WAITING card speaks in sentences: labeled clickable lines, never a bare
     number — "2 inquiries waiting · oldest 9d" → inquiries tab; "1 draft to
     review" → its course. Same self-explanation audit on the other two strip
     cards (UNREAD shows newest sender; FEES TODAY substats already do this).
  3. ACTION QUEUE upgrades: (a) GROUP by course/inquiry — N identical issues
     collapse to one row ("DaisyLinks — 2 failed charges · $242.50 · oldest
     10d"), expandable; at 1000 courses ungrouped rows are unusable.
     (b) every row gets a "Do this:" line stating the literal next step
     ("Operator must finish Stripe onboarding — resend link, then retry both
     charges"), not just a verb button. (c) rows whose fix is an email/nudge
     fire it from the row (reuse existing send actions) with pending/success
     states.
  4. BOTTOM TRIO replaces Top Courses (deleted — rankings without purpose):
     a. PIPELINE FUNNEL (month-to-date): new inquiries → sheets out →
        building → went live, counts + conversion between stages, each stage
        deep-links to the filtered inquiries tab.
     b. TODAY'S TEE SHEET RADAR (all courses): rounds playing today,
        check-ins done vs expected, revenue expected at check-in today,
        deep-links to activity/revenue.
     c. COURSE HEALTH WATCHLIST: courses trending DOWN vs their own prior
        30d (bookings drop >40%, operator not logged in >14d, zero bookings
        while live) — reuses A7 health signals, worst first, cap 5, links to
        course pages. Empty state: "No courses trending down."
  5. SYSTEMS LINE → /admin/system page (sidebar: "System", wrench icon, small,
     near Profile): sections for Backups (last artifact date via GitHub API if
     GITHUB_TOKEN available, else deep-link), Crons (each cron's last-run —
     NEEDS heartbeat markers: micro-table, fold into the EXPENSE TRACKER
     migration batch; until then show links + docs), Stripe webhook (last
     event received — derivable from DB timestamps), CI (link + last status
     via GitHub API if token), Sentry (link). Overview keeps ONE dot:
     "Systems ✓" → /admin/system. No-silent-failure states throughout.
- [ ] A-01e Overview chart FINAL FORM — SUPERSEDES A-01c's bar re-bucketing
  (if bars per bucket were already built, replace them): the chart is a
  CUMULATIVE MONEY TICKER, stock-P&L style:
  - Day view: a line of cumulative GR fees earned since midnight, climbing
    through the day; behind it a faint ghost line = YESTERDAY's cumulative
    at the same time-of-day. One glance answers "am I ahead of yesterday?"
  - Week view: cumulative fees since Monday vs last week's line to the same
    point. Month view: since the 1st vs last month's line to the same point.
  - No x-axis labels needed (maybe faint start/now marks); y-axis minimal;
    current value dot at the line's tip with the $ amount.
  - Header numbers (A-01b) stay and agree with the line's endpoint; the
    "so far vs prior" delta IS the gap between the two lines.
  - AUTO-REFRESH every 5 minutes (silent poll; ties into the header's
    "updated Xs ago"). Gross can remain as a secondary lighter line via the
    legend toggle; fees are the star.
  - Zero-data state stays honest: flat line at $0 with "no bookings yet
    today", ghost line still visible (yesterday's pace is useful even at $0).
- [ ] A-02 /admin/inquiries — list (tabs, search, sort)
- [ ] A-03 /admin/inquiries/[id] — detail (Contact/Answers/Sheet/Activity, next-step card, toolbar)
- [ ] A-04 /admin/courses — list (filters, health signals, search)
- [ ] A-05 /admin/courses/[id] — course detail (all tabs: overview, transactions, tee sheet, schedule, members, staff, messages, contact, setup)
- [ ] A-06 /admin/revenue — fees, per-course table, problems, Stripe reconciliation
- [ ] A-07 /admin/golfers — support lookup
- [ ] A-08 /admin/messages — threads
- [ ] A-09 /admin/activity — ledger + filters
- [ ] A-10 /admin/employees — roles, provisioning
- [ ] A-11 /admin/broadcasts — compose, preview, history
- [ ] A-12 /admin/create — manual build wizard (in-person tool)
- [ ] A-13 /admin