# ADMIN-REDO — GreenReserve headquarters (Cam 2026-11-11)

Cam's plan, in chat 2026-11-11: the admin is a separate product from the course dashboard — "the headquarters of a
software company", like Stripe / Ramp / Linear, not a golf-course dashboard. Same GreenReserve branding (forest green,
our fonts, serif headings where they fit, off-white page), its own visual identity.

## Decisions (question feature, 2026-11-11)
- **Now, one page at a time.** Each page: a mockup with example content (clearly marked) → Cam reviews what is on it
  and how it looks → built with real numbers only → Cam reviews live → next page. Nothing goes out all at once.
- **Mockup first**, starting with Overview.
- **The look (Cam 2026-11-11, on the Overview mockup `lanes/admin/overview-mockup.html`,
  claude.ai/artifact/Lp9VdYJTqNEJeQ9jbj9hRk): the admin is GREEN GLASS** — green-tinted frosted panels over soft
  blurred green shapes, light by default with a dark switch, highlight tiles in forest green + one warm gold, EB Garamond
  headings + Libre Franklin. It replaces ADMIN-C (white, Inter) for `/admin/*` and overrides, for the admin only, the
  bans on rounded-xl, shadows above 0 1px 2px and the dark background. Glass stays readable: solid panels under
  `prefers-reduced-transparency`, text on glass clears 4.5:1 in both themes.
- **The course dashboard goes CHARCOAL** (the mockup's third direction: solid raised cards, no glass, light default
  with a dark option) — carried over page by page AFTER the admin Overview is built and approved. Build's job.
- The homepage demo's phone keeps the $1.50 line (it mirrors the real booking page).
- **#360 (old admin Home) closed; #365 (Problems) merged** — Problems becomes Support & Issues later.

## Navigation (Cam's)
Workspace: Overview · Golf Courses · Onboarding · Bookings · Users & Golfers.
Financials: Revenue & Payments · Expenses · Financial Analytics.
Management: Business Analytics · Support & Issues · Platform Activity · Settings.
Global search, notifications and a Quick actions button (add course, add user, record expense, create report, view
alerts, export data) on every page.

## Phase 1 (build first)
Overview · Golf Courses (directory + profile, readable without logging into the course's dashboard) · Onboarding
(pipeline + implementation checklist + profile) · Revenue & Payments (earned vs collected vs outstanding, per course,
per player) · Expenses (add, receipt, category, vendor, recurring) · global search and notifications.

## Phase 2 / 3 (later)
Financial and business analytics, golfer database and retention, acquisition funnel, reports and exports; then
automated onboarding, support tickets, advanced permissions, billing, platform health, forecasts.

## Overview (the first mockup)
Six cards: courses, revenue this month, bookings, active golfers, onboarding waiting, net profit — each against the
period before. Revenue chart with day/week/month/quarter/year and the period before. Recent activity and Needs
attention side by side.

## Rules carried over (Build will hold these, raising conflicts with Cam)
- Live numbers are counted, never estimated; example numbers appear only on mockups, marked as examples.
  Forecasts and break-even are estimates by nature — Phase 3, and Cam decides how they're labelled then.
- Test courses never count in platform numbers (TEST-2).
- There are no course subscriptions today; no subscription or MRR figures until there are.
- Admin areas (AW-11) and the owner-only doors stay; every new page gets an area and `areaGate`.

## Overview review (Cam 2026-11-11, on the built page)
- "Very nice" on the look. The top bar's "A system needs attention" line goes: each broken system is its own row in
  Needs attention, linking to the fix.
- Cards: courses live, revenue, onboarding pipeline, net profit, EXPENSES (new), and FEES MISSED (service fees not
  collected because golfers paid cash at the counter — PAY-2's counterFeesUncollected). Players and golfers come off.
- Quick actions: removed.
- Later: an AI assistant in the admin, like the course dashboard's — read-only, never shares information outside
  GreenReserve. Its own mockup and decisions when we get there.
