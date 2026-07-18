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
- [x] A-01e Overview chart FINAL FORM — BUILT: c20701e. SUPERSEDES A-01c's bar re-bucketing
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
- [x] A-01f Radar card money fix (Cam) — BUILT: d6ce00a. NOTE: spec asked to
  fold "pending late-cancel fees" into the GR-fees headline, but
  chargeOnConnectedAccount is called with applicationFeeCents: 0 for those
  charges in both cron/cancellation-cutoff and cron/hourly — today that fee
  is 100% course revenue, GR takes no cut. Left out of the headline rather
  than misstate "our take"; flag if the fee-split was supposed to change
  (that'd be its own item, not a revise-run fix). Otherwise built as spec'd:
  "Expected at check-in $133" shows
  the COURSE'S gross, not ours. Replace with "GR fees expected today" (the
  $1.50 x players across today's uncompleted rounds, + any pending
  late-cancel fees) as the headline number; keep the gross as a small muted
  secondary line ("courses will collect ~$130") since it's context, not the
  point. Principle: every money number on OUR overview defaults to OUR take.
  Audit the rest of the Overview for the same confusion (the ticker already
  leads with fees — verify nothing else leads with gross).
- [x] A-02 /admin/inquiries — LIST — BUILT: items 1-3 f29e1c8, item 4
  f242ac0, item 6 4a9848b, item 7 dd0134f, item 8 53714c8, item 5 a698e15.
  All 8 items built as spec'd. SPEC (Cam teardown + browser audit, 2026-07-18):
  1. FULL-WIDTH layout (kill half-screen container), same as Overview.
  2. HEADER REBUILT (Cam: "genuinely changed"): two clean rows, nothing stacked
     awkwardly — Row 1: "Inquiries" title + one-line pipeline summary
     ("4 active · 1 needs you · 3 live all-time") left; search + Refresh right.
     Row 2: tabs with counts left; sort dropdown right, SAME row. The gray
     per-tab description bar DIES — its text moves to each tab's empty state
     and a hover tooltip. No third row.
  3. TABS RECONCILED: Your move · New · In review · Waiting on them ·
     Building · LIVE (new — converted wins get their own tab; successes are
     not "archived") · All · Archived. "All" = every stage INCLUDING live +
     archived (make the name true). Archived = rejected/closed only.
     Every count comes from the same API definitions the Overview strip uses
     — one source of truth, numbers can never disagree (fix the Waiting
     card mismatch + its unstable format while in there).
  4. ORDER: default sort on work tabs (Your move, New, In review) = LONGEST
     IN STAGE first (it's a queue — oldest overdue screams first); All/
     Archived default Newest. Sort choice persists per tab.
  5. SCALE: pagination (50/row pages); filters row (collapsible): course
     type, state, age bucket (>3d / >7d / >14d), has-bad-data. Bulk select
     checkboxes → bulk Send Sheet (New tab), bulk Archive (with typed
     confirm) — each bulk action previews recipient list before firing.
  6. DATA QUALITY: rows with invalid email get an amber "bad email" chip
     (no more invisible not-an-email records).
  7. ROWS ARE REAL LINKS: <a> semantics — keyboard nav, middle-click new
     tab. Status dots get text labels or a legend (no color-only signals).
  8. VIEWING IS NOT ACTING: opening a Pending inquiry NO LONGER auto-flips
     it to In Review or writes fake "Cam moved this" history. Stage moves
     happen only on explicit actions. (The New count only drops when Cam
     DOES something.)
- [ ] A-03 /admin/inquiries/[id] — DETAIL — items 1-7 BUILT (item 1 cbbf1e0,
  items 2+3 dfec543, item 5 26a09ac, item 4 11e0975; item 7 fixed alongside
  item 6, commit 639a748/cd9a2a0 — see A-02/A-03 log above). Item 8 NOT
  done: cleaning up "Fake Fairways Golf Club" means deleting a real
  course/operator record (or reverting an inquiry's stage) in what's the
  production database — Claude Code can't safely locate or delete this
  without either a live admin session or Cam naming the exact
  inquiry/course/operator ID and confirming the delete. Box stays
  unchecked until item 8 is resolved — Cam, please either do this cleanup
  yourself or hand back the exact record ID(s) to delete.
  SPEC (Cam teardown + browser audit, 2026-07-18):
  1. HEADER REBUILT as a flight plan, not a button strip:
     - STAGE CHECKPOINTS across the top: Inquiry → Review → Sheet → Build →
       Live, each with done/current/pending state and its DATE when done —
       "what has been done and what needs to be done" visible in one glance.
     - ONE primary action button = the current stage's next step (same logic
       as the Next Step card, which merges INTO the header — one brain, not
       two). Everything else (Manage course, dashboard access, preview,
       stage override, delete) moves into a "⋯ More" menu.
  2. NO PUBLISHING ON A WHIM: Go Live opens a preflight modal — checklist of
     preconditions with real checks (sheet submitted? page approved by
     course? Stripe connected? operator email verified?) — green checks
     proceed; missing items require an explicit "override and go live
     anyway" with the course name typed. Same pattern for Skip & Build
     (rename: "Build without sheet"), which currently fires a welcome email
     + Stripe attempt with NO confirm — audit's #1 finding, this is the gun:
     modal must state exactly what will happen and WHO gets emailed, typed
     confirm required.
  3. EVERY EMAIL-SENDING ACTION discloses recipient + content summary in its
     modal before firing ("Sends setup sheet link to jamie@example.com").
     No generic browser confirm() anywhere on the page.
  4. ACTIVITY BECOMES A REAL LEDGER (Cam: "specific what was actually
     done"): log the missing events — sheet SUBMITTED by course (the
     when-did-they-respond moment), preview sent (to whom), dashboard access
     sent, welcome email sent, course built (via sheet draft-build or manual),
     approval received, contact edited, note added. Attribution honest: "by
     Cam" only for Cam's clicks, "system" for automatic transitions, course
     actions attributed to the course. Fix the approval-after-live ordering
     bug. Views are never logged.
  5. READY-TO-BUILD CHECKLIST: three states — present (green) / thin (amber:
     suspicious content like a 1-char description) / missing (red) — with
     labels, not identical dots. Checks usefulness, not just presence.
  6. Fix raw enum leak (beverage_cart → "Beverage cart") via the existing
     label maps. Next Step guidance is content-aware (never "review the
     Answers tab" when answers are empty).
  7. Overview action queue: archived or live inquiries can NEVER appear as
     stalled (fix the query).
  8. CLEANUP: revert Fake Fairways Golf Club to its pre-audit stage (the
     browser audit's Skip & Build fired for real) — delete the orphan
     course/operator it created if any.
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