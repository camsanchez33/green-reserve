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

- [ ] A-01 /admin — Overview — SPEC (from Cam's teardown 2026-07-16):
  PRINCIPLES: organization, order, reason — every element must answer "why am I seeing this?"

  1. LAYOUT: full-width. Drop the ~half-screen max-width container; responsive
     grid that uses the whole viewport (sidebar-aware). Wide screens: action
     queue + chart side by side; stats span the top.

  2. ONE ACTION QUEUE (replaces BOTH "Needs You" and "Needs Attention" — two
     competing worry-lists is the core disorganization). Severity-ranked,
     grouped, self-explaining, built to scale to 1000 courses:
     - Tiers in fixed order: MONEY BROKEN (red — failed charges w/ $ amount,
       live course with Stripe incomplete/disabled) → PIPELINE STALLED (amber —
       inquiry waiting on Cam N days, draft awaiting review, preview sent no
       reply >5d, sheet sent no response >7d) → CONVERSATION (neutral — unread
       operator messages) → HYGIENE (stale/pending inquiries >7d).
     - Every row: severity dot · WHO (course/inquiry name) · WHY in plain
       English with the number that matters ("Charge failed — $69.50, card
       declined", "Waiting on you — 4 days in review") · age · ONE action verb
       button (Retry / Review / Reply / Finish setup) deep-linking to the
       exact spot.
     - Scale rule: max 5 rows per tier + "View all N →" to the filtered
       tab/page. Counts in tier headers. Empty state: "All clear — nothing
       needs you." No bare yellow highlights anywhere.

  3. REVENUE CHART: real daily BARS, last 30 days (toggle 7/30/90): gross
     across all courses per day + GR fees per day as a second series (fees on
     their own scale or paired sub-bar — fees are cents vs gross dollars, do
     NOT let one flatten the other). Hover/tooltip: date, gross, fees,
     bookings count. Weekend ticks labeled. Zero days render as baseline, not
     gaps. Use the lightweight approach already in the codebase (no new heavy
     chart deps).

  4. STAT CARDS: keep 4 (live courses, pending inquiries, bookings 30d, GR
     revenue 30d) — comparisons obey the A0 rule (no % vs zero, show "—"),
     every card clicks through to its tab.

  5. TOP COURSES (30d): keep; add per-row bookings + fees + trend arrow vs
     prior 30d; rows link to the course page. Cap 5.

  6. QUICK ACTIONS: DELETE the section. Reason test failed: navigation lives
     in the sidebar, work lives in the action queue — a third list of generic
     buttons is noise.

  7. RECENT ACTIVITY (bottom section): replace raw feed with "TODAY AT A
     GLANCE" digest — bookings today (count · gross · fees), check-ins today,
     cancellations today, new inquiries today; each stat deep-links to the
     filtered Activity/Revenue view. Raw scrolling feed stays on
     /admin/activity where it belongs. Overview answers "what happened today
     + what needs me" — never an unbounded log.

  8. SYSTEMS LINE (small, bottom): one quiet row — last nightly backup OK/date,
     last cron run OK, Stripe webhook last received. StatusDots, links to
     logs. The 30-second "is the machine healthy" check without leaving the
     page.
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
- [ ] A-13 /admin/profile — password, 2FA path
- [ ] A-14 Admin auth pages — login, owner-login, set-password, forgot-password
- [ ] A-15 Admin shell — sidebar, collapse, Ctrl+K palette, unread badges

(Teardown notes → spec block gets written under each entry when Cam tears it down.)

## SURFACE 2: OPERATOR DASHBOARD (queued)
## SURFACE 3: GOLFER FLOW + PORTALS (queued)
## SURFACE 4: MARKETING SITE (queued)
## SURFACE 5: EMAILS (queued)
