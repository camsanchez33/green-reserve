# Course Layout Spec — nines, combos, and bookable products

Cam's ruling (2026-07-16): course layout deserves its own dashboard tab, and
it must drive the BOOKING page — a 27-hole course is usually three nines
whose 18-hole combos can be booked separately. Today: layout data is captured
on the details sheet (V3b/V7) but dies in build notes; Course has flat
holes/par/yardage/slope/rating fields; the tee sheet knows nothing of nines.

Core concept: a course OFFERS one or more BOOKABLE PRODUCTS:
- an 18-hole course offers "18 holes" (+ optionally "9 holes front/back")
- a 27-hole course offers its active combos (North+South, South+West, ...)
  each as an 18-hole product, + optionally single nines
Each product is what a golfer actually books; slots belong to a product.

## Phase L1 — Layout model + dashboard tab (schema change, ATTENDED)
- Schema: `Nine` (courseId, name, par, order) and `CourseProduct`
  (courseId, label e.g. "North + South", holes 18|9, nineIds[], active,
  sortOrder). Existing flat Course fields stay as display fallbacks for
  simple 18-hole courses (no forced backfill).
- TeeSet gains per-nine yardage storage (TeeSetNine join or JSON — decide in
  run based on model fit; rating/slope live per CourseProduct per TeeSet).
- New dashboard tab "Course & Layout" (replaces the Course Details box in
  Settings): layout type, named nines with par, products list with
  activate/deactivate, tee sets editor with per-nine yardages, per-product
  rating/slope. Clubhouse style, no-silent-failure patterns.
- Draft build (V4 path) maps sheet layout answers (V7 structured combos)
  into Nine + CourseProduct rows instead of build notes; existing courses
  unaffected until an operator/admin opens the tab and configures.

## Phase L2 — Booking page sells products (big, no migration if L1 landed)
- TeeTimeSchedule gains product scoping (via L1 schema); tee-time generation
  creates slots per active product where schedules say so. DEFAULT/simple
  case unchanged: one product, sheet looks exactly like today.
- Course page: product selector above the tee sheet (tabs/pills:
  "North + South", "South + West", "9 holes") — only when >1 active product.
  Slot cards show the product's holes/rating; pricing can vary per product
  (9-hole rate already exists from V3b answers).
- Booking/receipt/emails/dashboard/admin all display the PRODUCT label
  (fixes the "2 · 27 holes" class of confusion permanently).
- ANSWERED by Cam (2026-07-16): rotation is CONFIGURED BY THE COURSE in the
  Schedules setup. L2 therefore includes:
  - Schedule editor becomes product-aware: every TeeTimeSchedule is assigned
    to ONE CourseProduct, with its own days/time window/interval — so a
    course builds e.g. "North+South · daily 7:00–12:00" and
    "South+West · daily 12:10–17:00". The schedules page groups schedules
    under their product with clear headers.
  - CONFLICT DETECTION: products know their nineIds. If two ACTIVE schedules
    overlap in time on the same days AND their products share a nine, block
    save with a plain-English error ("South is in use by North+South until
    12:00"). This is what makes operator-configured rotation safe.
  - Setup flow for a new multi-nine course: the Course & Layout tab nudges
    "now build a schedule for each combo" with a link; the draft build
    creates ONE default schedule per active product from the sheet's tee
    sheet answers (first/last/interval) so courses start from working
    defaults rather than a blank page.

## Phase L3 — polish + isolation (small)
- Isolation tests: products of course A never leak into course B's sheet.
- Admin course detail shows layout summary; Sheet tab (V5) links answers →
  configured layout. Health/perf budgets apply.
