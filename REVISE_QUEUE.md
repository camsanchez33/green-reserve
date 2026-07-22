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
- [x] A-02b Inquiries tab row v2 — BUILT: b6ec669. PIPELINE + LENSES (Cam's pick):
  Replace the flat 8-tab row with two visual groups on one row:
  - LEFT — the pipeline as a connected mini-funnel, clickable stages with
    counts and small chevron/arrow connectors showing flow:
    New (0) → In review (2) → Waiting on them (1) → Building (1) → Live (2).
    Current stage-filter renders as the active segment (pine underline/fill);
    stages with count 0 render muted. The row itself teaches how an inquiry
    moves left to right.
  - RIGHT — the lenses, visually separated (gap + subtle divider):
    Your move (count, amber chip when >0 — it's the work tab), All, Archived.
  - Counts stay live from the shared definitions (A-02 item 3). Sort +
    per-tab empty states unchanged. Keyboard navigable. On narrow widths the
    funnel wraps above the lenses rather than truncating.
- [x] A-02c URGENT — BUILT: 2abb5f2. Added src/lib/inquiry-status.ts as the single
  exported status→segment source of truth (list, funnel, detail page, Overview
  action queue all import it). Sheet In (details_submitted) segment added,
  Waiting on them renamed to Sheet sent. Completeness invariant renders a red
  "N inquiries unmapped" chip if any status ever falls outside the known set —
  verified live: this immediately surfaced ONE pre-existing prod inquiry
  ("cam course", id cmqkb84he00007itp9jmas88d) sitting at status="approved",
  which isn't a real pipeline stage (that string is used elsewhere for
  pageApprovalStatus, unrelated) — likely stale test data, left untouched
  pending Cam's call (same as the Fake Fairways cleanup in A-03 item 8 — not
  deleting production records without an explicit go-ahead). CAM SANCHEZ
  COURSE (Cam's original repro) has since progressed from Sheet In to
  Building in prod, so it renders correctly under its own segment now; the
  fix itself was verified against the details_submitted case directly.
  Your Move lens now derives from age (pending/in_review stalled >3d,
  sheet-sent stalled >7d) in addition to details_submitted/building, per
  item 3.
  ORIGINAL SPEC: funnel has a hole: "Sheet In" (details_submitted) has NO
  segment, so an inquiry whose course just submitted their sheet DISAPPEARS
  from the pipeline row (Cam's live repro: CAM SANCHEZ COURSE, Sheet In,
  every funnel count 0). Fix with a COMPLETENESS RULE, not a patch:
  1. The funnel maps EVERY inquiry status to exactly one segment:
     New (pending) → In review → Sheet sent (details_requested) →
     SHEET IN (details_submitted — new segment, amber count chip since it's
     always your move) → Building → Live. Rename "Waiting on them" to
     "Sheet sent" (says what happened, not who's waiting).
  2. INVARIANT enforced in code: sum of funnel segment counts must equal the
     active+live total shown in the header summary. Add an assertion — if
     any status ever maps nowhere (a future stage gets added, say), the
     header renders a loud red "N inquiries unmapped" chip instead of
     silently hiding them. Never again.
  3. Same completeness audit on the LENSES: Your move = exactly
     (details_submitted + building + anything aged past thresholds), All =
     truly all, Archived = rejected/closed. Write the status→segment map as
     ONE exported constant used by the list, the funnel, the Overview strip,
     and the action queue — a single source of truth for what each stage
     means everywhere.
- [x] A-02d Lenses + closed-state model — BUILT (5d48331). ALIVE_STATUSES
  added to src/lib/inquiry-status.ts; "All" now matches alive only (funnel
  total). "Archived" lens relabeled "Closed", rows grouped into Rejected/
  Archived sections with why+when (reusing the existing whyArchived
  helper) and only Restore/Permanently-delete actions — both routed through
  the LIFECYCLE PARITY LAW service (RUN_QUEUE item 6). Count invariant
  extended: allTabCount === funnelSum, and unmapped+all+closed === total,
  checked live. Verified against real data (read-only, no mutation
  performed): 3 live linked inquiries (alive) + 1 unlinked rejected inquiry
  ("cam course") = 4 total, invariant holds exactly (0 unmapped, 3 alive,
  1 closed). That same unlinked record's restore path surfaced a real bug —
  see RUN_QUEUE item 6/7's notes — its prior status was a stale 'approved'
  value from before A-02c existed, which the new pipeline-only restore
  logic now correctly falls back past instead of erroring. Reconciliation
  sweep (RUN_QUEUE item 6.6) fires on first visit to this tab. Original
  spec below (Cam, 2026-07-20 — supersedes A-02 item 3's "All includes
  archived"):
  THE MODEL: every inquiry is either ALIVE (somewhere on the funnel: New →
  In review → Sheet sent → Sheet in → Building → Live) or CLOSED (out of
  the pipeline: rejected, or archived via the parity law). Alive and closed
  never mix in a view.
  - LENSES (right side) become: **Your move** (work queue) · **All**
    (= every ALIVE inquiry, funnel total, NO closed records — the name
    finally matches by definition) · **Closed** (replaces "Archived").
  - CLOSED tab is a managed graveyard, not a dump: each row shows WHY and
    HOW it got there ("Rejected · Jul 12 · by Cam" / "Archived · course
    paused · Jul 18"), grouped Rejected vs Archived, searchable. Actions
    per row: Restore (routes through the parity law — restoring an
    archived pair revives both) and Permanently delete (guarded by the
    pair's payment history, guard reason shown inline). Nothing else lives
    here — no stage overrides, no sends.
  - COUNT INVARIANT extends: Alive total = funnel sum = All count;
    Closed counted separately; the unmapped-chip failsafe covers both.
  - Delete/archive AVAILABILITY recap on the alive side: archive available
    from any alive stage (pair-aware warning); delete only via the ⋯ menu
    with blast-radius modal; both route through the lifecycle service.
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
- [ ] A-04 /admin/courses — LIST — SPEC (designed with Cam, 2026-07-21):
  0. PREREQ, THE METRICS BRAIN: one shared metrics module (src/lib) defining
     bookings/gross/GR-fees/period math ONCE — list, course detail, Revenue,
     Overview all import it. The audit found 4 surfaces with 4 different
     numbers for the same course; after this, a disagreement is a failing
     test, not a discovery. Include the definitions in code comments (what
     counts: which statuses, dues or not, which window).
  1. FULL-WIDTH; page fills the monitor (Cam #12).
  2. ROWS = CLEAN DIRECTORY ENTRIES: name, location·type, operator name, and
     ONE worded status chip ("Healthy" / "Setup incomplete" / "Payments
     broken" / "Going quiet" / "Offline" — worst truth wins, dot + words,
     tooltip with the reason). NO number columns, NO icon actions — the row
     is a doorway; everything else lives inside. Rows are real links.
  3. ICON ACTION BAR DIES (star/power/globe/eye/archive) — all actions move
     into the course page with labeled buttons + confirms.
  4. FILTERS REORGANIZED to match the new row: segmented Active/Archived/All,
     status-chip filter (the worded statuses), type dropdown, search.
     Live/Offline + Stripe filters fold INTO the status chips (that's what
     the statuses mean). One row, no reflow at any width.
  5. SORT: Name · Newest · Status severity (default: severity — worst first,
     it's a triage list even when clean). Pagination at 50. Count line
     reflects the ACTIVE filter, always.
  6. "Verified 3/3" dies on the list — replaced by the worded status; the
     checklist itself lives on the course page (A-05 item 4).
  7. "30d rev" label + all row numbers: gone with the numbers (item 2); the
     Revenue tab is where money ranking lives (it already sorts).
- [ ] A-05 /admin/courses/[id] — DETAIL — SPEC (designed with Cam, 2026-07-21):
  1. FULL-WIDTH. Tabs reorganized into TWO LABELED GROUPS:
     BUSINESS: Overview · Transactions · Documents · Messages
     OPERATIONS: Tee Sheet · Schedule · Members · Staff · Setup
     (Contact folds into Overview's client card — not its own tab.)
  2. HEADER: name, worded status chip (same brain as the list), location,
     type; labeled action buttons with confirms replace icon-emojis: Feature,
     Take offline/Set live (preflight-aware), View public page, Archive
     (pair-aware), Delete in a danger menu. No bare icons anywhere (Cam #5/#7).
  3. OVERVIEW TAB = "both, stacked": TOP: client health block — setup
     checklist state, worded status + why, last activity, open items
     (unanswered messages, incomplete steps, unaddressed change requests).
     BOTTOM: money block from the shared metrics brain — bookings, gross,
     GR fees, trend, all agreeing with every other page by construction.
     Client card (contact info, editable) on the side.
  4. SETUP TAB REBUILT = three sections, one source of truth:
     a. ONBOARDING CHECKLIST: the verification process as named steps
        (email verified · password set · page approved · Stripe connected ·
        schedule confirmed · live) each with date/state — replaces
        "Verified 3/3" everywhere.
     b. AUTO-CHASE: incomplete steps trigger automatic reminder emails at
        3d, 7d, 14d, then weekly — every send logged to the course timeline
        + visible here ("Reminder sent Jul 24 · Stripe"), stops instantly on
        completion. Kill switch per course ("pause reminders").
     c. FULL MIRROR (Cam's call): every operator setting (policy, fees,
        booking windows, layout, branding) is EDITABLE from this tab too —
        admin can fix anything for a client on the phone. NO drift rule:
        both surfaces call the SAME APIs and render from the SAME source —
        the admin tab REUSES the operator settings components/endpoints
        (shared components, admin session authorized), never a parallel
        form. Every admin-side edit is logged to the course timeline
        ("Weekend fee changed $65→$70 by Cam") and the operator can see the
        change history in their dashboard — no silent edits to a client's
        course. Admin-only levers (featured, live/offline, danger zone)
        remain separate in the header.
  5. DOCUMENTS TAB (new, Business group) — the protection paper trail:
     a. AUTO records: Operator Agreement acceptance (version + who + when —
        NEW clickwrap checkbox added to the operator first-login flow, V11
        extension), Stripe connected-account agreement date, go-live
        approval record, booking-terms version in force.
     b. Uploads: PDFs per course (existing blob storage), listed with date +
        uploader. c. Client notes (freeform institutional memory).
     d. E-sign: explicitly future, placeholder note only.
  6. TRANSACTIONS: keep (Cam likes it) — switch its numbers to the metrics
     brain, reconcile with Overview by construction.
  7. TEE SHEET: renders the course's actual layout — 27-hole courses show
     their products/nines (verify what L1 actually shipped; the "configure
     combos" banner must link somewhere real or not exist).
  8. MESSAGES: stays as a tab (Cam confirmed). Unanswered messages surface
     in Overview's open items.
  9. Sweep: one status vocabulary everywhere (Live/Offline/Archived — kill
     "inactive"), no raw Stripe/enum strings surfaced (use the friendly-
     message map), casing consistency, dead "OP LOGIN —" hidden until its
     column exists, watchlist counts payments-broken as unhealthy, action
     queue headers always match their row counts.
- [ ] A-06 /admin/revenue — fees, per-course table, problems, Stripe reconciliation
- [ ] A-07 /admin/golfers — support lookup
- [ ] A-08 /admin/messages — threads
- [ ] A-09 /admin/activity — ledger + filters
- [ ] A-10 /admin/employees — roles, provisioning
- [ ] A-11 /admin/broadcasts — compose, preview, history
- [ ] A-12 /admin/create — manual build wizard (in-person tool)
- [ ] A-13 /admin