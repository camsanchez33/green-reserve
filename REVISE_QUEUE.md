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

- [ ] A-01 /admin — Overview (stats, needs-you list, revenue chart)
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
