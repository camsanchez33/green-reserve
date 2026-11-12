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

## Page 2 — Golf Courses (Cam's comments 2026-11-12, then "approved, build it to match the mockup")
Mockup: `lanes/admin/courses-mockup.html` (claude.ai/artifact/S9uejLkUeukpvf9f3Hcgw2). A directory — course, status,
bookings this month (vs last month to the same day), our fees this month, last booking — with filters All · Live ·
At risk · Onboarding · Offline and a find box; clicking a course opens its profile beside the list (Overview: bookings,
fees, fees missed, failed charges, last booking, joined; Contact & agreement; Setup checklist; Payments; Notes) with
"Open full profile" (the existing admin course page) and "Open their booking page". Readable without signing in to the
course's dashboard. At risk = a live course with no bookings in 14 days (Build's default; Cam can change it).

Final mockup (after Cam's comments): `lanes/admin/courses-mockup.html` v13. The directory's last column is
"Booked online" (% of the month's rounds booked online — where our fee is earned), not last booking. The profile is
one column, no tabs: numbers (bookings, our fees, fees missed, failed charges) → Setup only while unfinished (first
for an onboarding course) → Contact → Agreement & payments (agreement, Stripe, joined, last booking) → Notes; "Full
profile →" and "Booking page ↗" are small pills beside the course name.

## ADMIN FORMAT — every admin page follows this (Cam 2026-11-12, from his comments on Golf Courses)
1. **No subheadings.** A page title is the title alone ("Golf courses") — no sentence under it, no date line.
2. **One search, in the top bar, frosted glass, no wording** — a magnifier and the field. Never a second search box
   on the page; the top search finds courses, golfers and payments.
3. **Filters are one "Filter" button** that opens a short menu with counts; the button then reads "Filter: At risk".
   No rows of filter chips.
4. **Separate things are separate glass cards with a gap** (as the Overview's cards). Inside a card: no boxes —
   numbers, facts and notes are plain rows divided by hairlines.
5. **Few cards, no decoration:** the alerts bell and other top-bar controls sit without boxes; only search is glass.
6. **Links to elsewhere are small pills at the top of their panel**, never a row of boxed buttons at the bottom.
7. **Menu group headings (Workspace, Financials, Management) are bold, full ink** — readable, not faint grey.
8. **One column over tabs** when a panel's parts fit in one scroll; the most useful part first.
9. **Columns and cards show business numbers** — what earns, leaks or needs action (e.g. "Booked online", "Fees
   missed"), not trivia like "last booking".
The Overview is brought into line with these (no date line under the title, glass search with no wording, bold menu
headings, no boxed top-bar controls).
