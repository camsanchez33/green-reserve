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