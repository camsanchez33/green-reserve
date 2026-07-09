# Admin V3 Spec — run the business from the admin

Theme: the admin becomes the owner's cockpit — see the money, serve a golfer,
know what needs you, get anywhere in two keystrokes. No schema changes in any
phase (all data already exists in Booking/Course/Inquiry/Message records and
Stripe metadata we store).

Role rules follow the Phase 4b conventions: financial data and golfer PII =
SUPPORT_PLUS minimum; viewer sees dashboards without ledger/PII (mirror the
existing transactions/activity gating).

---

## Phase A0 — Fix what's broken + kill silent failures (do FIRST, medium)

From Cam's full admin audit (2026-07-09). Bugs and trust-killers, in order:

1. **Overview revenue chart is blank**: legend + correct totals render but the
   plot area is empty, and all x-axis labels read the same date ("Jul 7")
   instead of spanning the 30-day window. Fix data → series mapping and the
   axis. If a period truly has no data, show an explicit empty state
   ("No bookings in this period"), never a blank plot.
2. **"↗ 100% vs prior 30d" on zero-value cards**: comparison math is wrong or
   placeholder. Rule: prior period 0 or missing → show "—" (no arrow, no %);
   never show a percentage computed against zero.
3. **Courses: eye-icon View bounces back**: /admin/courses row → detail URL →
   infinite "Loading…" → silent redirect to list. Trace (likely fetch error
   swallowed or wrong id param) and fix; on genuine failure show an error
   state with retry, never a silent bounce.
4. **Inquiries visibility gap**: a course in Building shows nowhere by
   default — "Your move" reads 0 while a build sits waiting for go-live.
   Building-stage inquiries COUNT as "Your move" (you're the one building).
   Also: dedupe the two identical "Go Live" buttons on the detail page (keep
   the Next-step banner one; toolbar shows the remaining actions); make
   "Manage Course" vs "Review Course" one clearly-labeled action or two with
   distinct labels ("Open course admin" vs "Preview public page"); fix the
   first activity-log entry missing the "by Cam" attribution.
5. **"Show archived" mislabel**: it swaps the list to archived-only. Make it a
   proper segmented filter: All / Active / Archived — no misleading toggle.
6. **Archive semantics**: archiving a course with bookings/revenue/recent
   messages (the daisylinks case) is confusing — add a warning when archiving
   a course with activity in the last 30 days, and display archived courses
   with their history intact. (Renaming archived→"Paused" is NOT in scope —
   flag for discussion if the warning isn't enough.)
7. **Messages relative time wrong**: "Yesterday" shown for a 2-day-old
   message. Fix the calc (calendar-day diff in the course's/admin's TZ, not
   24h buckets); >7 days shows the date.
8. **Add Course wizard silent validation**: required fields block Continue
   with NO feedback. Add inline per-field errors + red borders on blur/submit
   attempt, and scroll to first error. Fee placeholders look like values and
   caused a real $0 trap — placeholder style must be unmistakably empty
   (lighter, "e.g. 45.00" prefix) AND the Review step highlights $0/empty
   money fields as warnings. Remove internal language from labels ("stored in
   description notes"). "Enable resident rates" defaults OFF.
9. **Broadcasts: review step**: show a preview (rendered email + recipient
   count) requiring explicit "Send to N operators" confirmation.
10. **Activity default date filter**: default to a labeled "Last 30 days"
    range, not an unexplained hardcoded start date.
11. **Profile: 2FA link styled as a link** (pine color + underline on hover)
    — it's the path to secure owner login and currently looks like body text.
12. **Cross-cutting rule (apply while touching each file above, and add to
    CLAUDE.md design rules):** no silent failures anywhere in admin — every
    action shows pending state, then success or an error with what to do
    next. Audit admin fetch handlers for swallowed catches while in there.

## Phase A1 — Collapsible sidebar (small)

- AdminSidebar collapses to an icon rail (~56px): logo mark only, icons with
  tooltips on hover, active state preserved. Chevron toggle at the bottom;
  keyboard shortcut `[`.
- State persists (localStorage) and applies without flash on navigation
  (read before paint or default-collapsed CSS strategy).
- Content area reflows to use the freed width.
- Same treatment for OperatorSidebar IF it shares SidebarShell cleanly —
  otherwise operator side is a follow-up, don't force it.

## Phase A2 — Revenue tab (medium)

New `/admin/revenue` (sidebar: DollarSign icon, label "Revenue", above
Employees). SUPPORT_PLUS gated like /api/admin/transactions.
- Header stats (serif numbers): Fees collected — today / last 7 days / this
  month; bookings count same periods; failed charges count (red if > 0).
- **Per-course table**: course, bookings (30d), service fees (30d), green fee
  volume processed (30d), failed charges, Stripe status dot. Sortable, search.
- **Problems section** (above the table when non-empty): failed check-in
  charges and failed late-cancel fees with booking link + retry guidance;
  refunds issued (fee refunds at check-in) listed for the period.
- Data source: existing Booking/charge records + structured log fields we
  already store — reuse /api/admin/transactions where possible, extend that
  route (no new schema).
- Date range selector: 7d / 30d / 90d / custom month.

## Phase A3 — Golfer support lookup (medium)

New `/admin/golfers` (sidebar: Search icon, label "Golfers"). SUPPORT_PLUS.
- One search box: email, name, or phone → matching GolferAccounts (and
  bookings made without account linkage if guest email matches).
- Golfer view: contact info, account created date, then ALL bookings across
  courses (date, course, players, status, amounts charged, receipts) newest
  first. Each booking links to its admin course + a "view receipt" link
  (token URL) and "resend confirmation/receipt email" action.
- Actions log to the activity feed ("Support resent receipt for booking X").
- No editing golfer data in this phase — read + resend only.

## Phase A4 — Actionable Overview (small/medium)

Top of `/admin` becomes a **"Needs you"** list (above existing stats):
- Inquiries on Your Move (count + top 3 by days-in-stage, link to tab)
- Failed charges since yesterday (link to Revenue problems)
- Courses with incomplete Stripe onboarding (link to course)
- Unread admin↔course messages (link to Messages)
- Draft courses awaiting review (link)
Each row: StatusDot severity, one line, one link. Empty state: "All clear."
Keep the existing stats below. Role-filter rows the viewer can't act on.

## Phase A5 — Ctrl+K command palette (medium)

- Global on all /admin pages: Ctrl+K (and a subtle search button in the
  sidebar header) opens a palette (Clubhouse-styled, no new heavy deps —
  build it, don't install cmdk unless trivial and light).
- Searches (debounced, one API route, role-aware): courses (name/slug/city),
  inquiries (course/contact), golfers (email/name — SUPPORT_PLUS only),
  employees (owner/manager only), plus static nav ("revenue", "broadcasts").
- Enter navigates. Arrow keys work. Esc closes. Recent selections cached
  client-side.

## Phase A6 — Audit round 2 fixes (from browser audit of the live V3 build)

In priority order:

1. **CRITICAL: course detail 500** — /api/admin/course-detail returns 500 for
   EVERY course (active and archived). Check Sentry for the stack trace first;
   reproduce locally; fix. The inline error+retry UI worked as designed — the
   API is what's broken.
2. **Action buttons: pending state + fast server response.** "Send Sheet" and
   "Reset pwd" freeze the page 30s–2min with no feedback while actually firing
   (emails awaited synchronously in the route). Fix BOTH sides: (a) client —
   immediate pending state on the button, disabled while in flight, success/
   error banner after (no-silent-failures rule; A0 missed these handlers);
   (b) server — don't await email sends in the request path (fire-and-forget
   with .catch logging, like /api/inquiries does). Add a confirm step to
   Reset pwd and Deactivate (destructive-adjacent). Audit ALL admin routes for
   awaited email sends while in there.
3. **Revenue per-course table excludes archived courses** — DaisyLinks has the
   only real revenue and doesn't appear (its failed charges DO show above —
   inconsistent). Stats include archived (established 2d rule); show archived
   rows with an "(archived)" marker.
4. **Golfer summary "$0.00 charged" while bookings below show real amounts** —
   aggregation is summing the wrong field or wrong status filter. Charged =
   sum of successful charges (checked-in totals + late-cancel fees kept);
   make the number match the rows beneath it.
5. **Ctrl+K drops keystrokes / shows stale results** — typing fast loses
   characters ("Sanchez" → "ez") and old results flash. Likely same controlled-
   input-rerender disease as the money fields plus an unguarded async race:
   keep input uncontrolled or stable, and discard out-of-order search
   responses (request id/AbortController).
6. **Inquiry status mismatches** — list shows "Pending" while detail history
   shows "In Review" (find source-of-truth divergence); "-1d in stage" flashes
   before correcting (clamp at 0 / render after load); direct URL to sub-tabs
   flashes zero-count badges + stuck loading (loading skeleton until data).
7. **Golfer bookings: date column disagrees with amount column by one day** —
   one renders tee-time date, other renders createdAt in UTC; both should be
   the course-timezone tee-time date via tee-time-utils.
8. **Support view groups guest bookings with matching accounts** — same email
   → show under one golfer header ("includes 1 guest booking") in /admin/
   golfers. Real account-linking stays out of scope (Ideas list).
9. **Activity course filter includes archived courses** — DaisyLinks isn't
   selectable though all activity is on it.
10. **Label cancellation entries clearly** — the "-$10.00" entry needs a
    type label ("Late-cancel fee refund" / whatever it actually is) so it maps
    to a booking without guesswork; link it to the booking.

NOT code (Cam to-dos, listed so they're not lost):
- DaisyLinks Stripe re-onboarding (dashboard → Settings → Stripe) to enable
  card_payments; then retry the two failed charges from Revenue.
- Delete the two "not-an-email" test inquiries and the typo'd/vulgar test
  broadcasts from history (or wait for the prelaunch purge script).

### Demotion (fold into whichever phase touches the sidebar first)
- "Add Course" nav item renamed "Manual build" and moved to the bottom
  cluster near Profile — the pipeline path is inquiry → draft build now.

### Ground rules
- No schema changes, no heavy new dependencies.
- Every new API route: requireRole per the conventions above + rateLimit
  where it returns PII.
- Clubhouse design system; StatusDot not pill badges; validate .tsx parses.
- Update RUN_QUEUE.md with hash after each phase.
