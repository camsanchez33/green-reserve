# UI REVISE SPEC — whole-product visual revise

Decision record + build queue for the visual redesign of GreenReserve, September 2026.
Source of truth for anything about "how it looks". Runs go through `/gr-run <item>`
like everything else; check boxes here only after `/gr-review` and a live walk.

References (open these before any run in this file):
- Product mockups — design canvas "GreenReserve UI":
  https://claude.ai/code/artifact/9e4a82e3-f03a-4dcd-9c7a-2a6d960d45ba
  Pages: Golfer · Operator dashboard · Admin + marketing · Explored (rejected directions).
- Homepage prototype (approved 2026-09-05, "i love it"):
  https://claude.ai/code/artifact/4172ca6d-0b62-4ea7-aadc-6ddf1a2f05ba
  Source template: `docs/design/homepage-prototype.html` (photos referenced by Unsplash id, see `docs/design/README.md`).
- Legal placeholders that gate copy: `legal/LEGAL_QUEUE.md` LQ-1 (entity name), LQ-2 (who pays the $1.50), LQ-3 (fee refund).

---

## 0. Decisions (Cam, 2026-09-04 → 05)

1. **Two looks, split by audience — on purpose.**
   - **PUBLIC look** (homepage, /for-courses, /contact, legal pages, and EVERY golfer-facing page):
     Fraunces headings + Inter body, rounded corners (8px buttons/inputs, 14px cards/device), real photography.
     This is what the live site and the golfer pages already use — the golfer work is layout + flow, not a retype.
   - **STAFF look** (/dashboard/* and /admin/*): Newsreader headings + Source Sans 3 body, square corners (0 radius), paper/ink/line tokens,
     course accent (operator) or pine (admin). Quieter, denser, built for people who live in it all day.
2. Golfer direction: **B · Clubhouse** structure ("easy to understand"). Rejected: A Sheet-first, C Ask-first (kept on the canvas for the record).
3. White-label knobs a course controls: **logo, one accent color, one hero photo. Nothing else.** No typeface choice, no layout variants.
4. Homepage: photography-led, Apple-style scroll storytelling, Resy-style course cards. **Live interactive booking demo stays.** Ship with the stock (Unsplash) photos now; swap in real course photography as courses go live.
5. "Just looks" is NOT fully true. The mockups embed behavior changes. **Reskin runs change zero behavior.** Behavior changes are the separate items in §4, one run each.
6. ~~Marketing copy about the fee is FROZEN until LQ-2 is decided.~~ **Lifted 2026-09-14** — the fee sentences now come from `legal/LQ-2_FEE_COPY.md` (allowed sentences + banned phrases). "You keep 100%" and "never touches your Stripe account" stay banned everywhere.

---

## 1. Design tokens

### 1a. PUBLIC look (unchanged fonts; tokens formalized)
```
fonts      display: Fraunces (opsz 9..144, 400/500 via next/font)   body: Inter 400/500/600
radius     buttons/inputs 8px · cards/device 14px · pills 999px
paper      #F6F4EC   white #FFFFFF   ink #1C1C18   ink-2 #57574F   ink-3 #87867C   line #E6E3D7
pine       #24513B   pine-hover #2E6349   pine-deep #12271C (dark sections)
course     per-course accent (Course.brandColor) — buttons, selected states, crest color, links on golfer pages
ok #3D6B4C  bad #A3452F  warn #8A6116  late/amber #C98A2E
motion     ease cubic-bezier(.16,1,.3,1) · reveals 0.9–1.1s translateY(24px)+opacity · no bounce, no cursor-tracking
```

### 1b. STAFF look (new — replaces DESIGN_SYSTEM_SPEC Clubhouse fonts/radius for /dashboard and /admin)
```
fonts      display: Newsreader (opsz 6..72, 400/500 via next/font)   body: Source Sans 3 400/500/600
radius     0 everywhere (buttons, inputs, cards, badges). rounded-full only for avatars/swatches.
paper      #F7F5EF   card #FFFFFF   ink #1D1F1A   ink-2 #5D5F56   ink-3 #8A8B80   line #E3E0D5   line-soft #F0EDE2
operator   sidebar white + 1px line; course identity block (crest, serif name, 10.5px uppercase meta); active item = accent text, 3px left border, paper bg
admin      sidebar pine #24513B; wordmark serif 17px paper; active item white/10 bg; inactive #A9BFAF
type       page title serif 30px/1; section title 15px/600 sans; eyebrow 11px uppercase .1em ink-3; body 13.5–14px; table 13.5px
attention  left 3px border in the semantic color (warn amber, bad red, ok green) on a white card — the ONLY place borders carry color
banned     font-black, tracking-widest, gradients, drop shadows heavier than 0 1px 2px, rounded corners, emoji
```
Tailwind: keep the existing color tokens, add `--font-serif-staff`/`--font-sans-staff` variables scoped to `/dashboard` and `/admin` layouts, and a `rounded-none` default in those layouts. The public layout keeps Fraunces/Inter.

---

## 2. Design-system run (do this first)

- [ ] **U-0 · Staff design system foundation** (no migration, medium) — SHIPPED a3c1bea,
  box open until /gr-review U-0 + a live walk. HOW: one `.staff-look` wrapper on the
  /admin and /dashboard layouts re-points Tailwind's theme variables (radius → 0,
  --font-serif/--font-sans → Newsreader/Source Sans 3 from `src/lib/staff-fonts.ts`,
  paper/ink/line → §1b), so step 2 needed NO component edits — every existing
  `rounded-*` / `font-*` / `bg-paper` class inside the wrapper renders the staff look.
  Sidebars per the canvas boards (operator: crest + serif name + meta, 3px accent
  active, footer link + "Powered by GreenReserve"; admin: serif wordmark, name · role).
  CLAUDE.md rewritten; DESIGN_SYSTEM_SPEC marked superseded for staff surfaces.
  LIVE CHECK: /dashboard and /admin square + Newsreader; `/`, `/courses/[slug]`, `/book`
  unchanged (Fraunces, rounded). NOT verified in a browser here (local build cannot
  collect page data without JWT_SECRET).
  1. Load Newsreader + Source Sans 3 via `next/font/google`; expose as CSS variables on the `/dashboard` and `/admin` route layouts only. Public layout untouched.
  2. Update `src/components/ui/*` (Card, Eyebrow, StatGroup, StatusDot, PageHeader, Btn, SidebarShell) to read radius/fonts from the layout variables so the same components render public-rounded and staff-square depending on where they're mounted. If that's a fight, fork them into `ui/staff/*` — say which in the restate step.
  3. Operator sidebar: identity block per §1b (already partly built in D2 — verify against canvas "Operator · Tee sheet"). Admin sidebar: per §1b (verify against canvas "Admin · Overview").
  4. CLAUDE.md design section: rewrite to describe the two looks and the audience rule. Mark DESIGN_SYSTEM_SPEC.md phases D1–D3 as superseded for /dashboard and /admin; keep D3's golfer white-label rules.
  Acceptance: `/dashboard` and `/admin` render in Newsreader/Source Sans 3 with square corners; `/`, `/courses/[slug]`, `/book` unchanged. No behavior change anywhere.

---

## 3. Reskin runs — ZERO behavior change

> **BATCH 2026-09-11 — REVIEWED and MERGED TO MAIN 525b32a on 2026-09-14 at Cam's instruction; live walk still pending.** Was branch `batch/2026-09-11-reskin`. Four items merged (U-G, U-O, U-A, U-M), guard clean on every worker branch and
> on the merged range (the only structural hit is the declared shared change: /api/receipt returns
> brandColor). Combined review: admin-UX 0 blocking (Settings field inventory verified 1:1, ?stripe=
> deep link intact); design 2 blocking + spec 2 missing, ALL FIXED on the branch (c023eeb, 99fa4a0):
> receipt header now wears the course colour; /manage selected row + confirm buttons in the course
> accent; staff modal/drawer shadows to the 0 1px 2px ceiling; toggle switches square; revenue
> Archived/Not-live chips → StatusDot; the /book confirmation's free-cancel deadline is now computed
> in COURSE time (it parsed the tee time as browser-local — a Denver golfer saw a Denver deadline for
> a New York course); admin eyebrows moved to the §1b 0.1em the dashboard already used.
> LEFT AS-IS, CAM'S CALL: (1) blocked tee-sheet rows use a hard-stop repeating-linear-gradient hatch
> (BANNED says gradients); (2) the three legal "short version" boxes are new prose — the two operator-
> agreement bullets restate the LQ-2 fee flow — read before merge; (3) /for-courses still carries the
> unfrozen fee copy in four places (hero, stat tiles, pitch, FAQ) — pre-existing, not touched by U-M,
> same claim H-1 froze on `/`; (4) account OTP screen not restyled (already on tokens); (5) cards are
> rounded-lg (8px) not 14px — needs a radius token if 14px is wanted; (6) U-A's "stalled 7d+" fade is
> the spec's own bullet, but it is a threshold — say if you want it gone. NOT VERIFIED: any board
> side-by-side, phone walk, Lighthouse on /courses/[slug], real-data subtitles.

Rule for every run in this section: no route changes, no API changes, no new state, no new copy that changes meaning, no schema. If a mockup element needs any of those, it is in §4, not here. `git diff` should be JSX/CSS only. The restate step must list every file it will touch.

- [ ] **U-G · Golfer surface — public look, Clubhouse structure** (no migration, large; may split G1/G2)
  Canvas boards: "1 · Course page", "1b · Course page, desktop", "2 · Reserve", "3 · Confirmed", "4 · Manage + cancel", "5 · Check in + paid", "6 · Golfer account", "7 · Member view", "8 · States", "Course page wearing three courses".
  Fonts/corners: PUBLIC look (Fraunces/Inter/rounded) — the boards are drawn in the staff look; **use their layout, not their type.**
  Routes: `/courses/[slug]` (+ CourseBookingClient), `/book`, `/receipt/[bookingId]`, `/manage/[bookingId]`, `/checkin/[bookingId]`, `/courses/[slug]/account`, `/courses/[slug]/member`, `/membership/[id]`.
  Reskin-only items:
  - Course page: hero = course photo (flat tint of accent when none), crest, serif name, one-line meta; section order identity → book controls → slot list → the place (about/map/contact) → "Booking by GreenReserve" footer line. Slot rows: time in serif, "$62 / player" always with the unit, open count, a Select affordance. Selected slot **expands in place** (this is already how it works — restyle only), itemized lines, primary button in course accent.
  - Desktop: filter rail left (exists), list right; selected row expands into two columns (options | totals + button).
  - Reserve (/book): summary card with "You'll pay at check-in" AND "Charged today $0.00" as two lines; two numbered steps (Your details, A card to hold your spot); the "Why a card, if nothing is charged?" box is a restyle of the existing TrustNote/policy copy, same facts.
  - Confirmed: the existing confirmation restyled as a "what happens next" timeline (Today / free-cancel deadline / check-in) using data already on the page (cancellationHours → render as a real date+time; that's a formatting change, allowed). Course header bar, not the GreenReserve black bar (fixes the white-label audit finding).
  - Manage: three action cards (Change time / Change players / Cancel) with plain-English subtitles; cancel confirm card is green (before deadline) or red (after) — both states already exist in code, restyle only.
  - Check-in: total card, primary "Check in · pay $X" in accent, the pro-shop alternative as a sentence.
  - Account: OTP screen (exists) restyled; portal with Upcoming card + Played list.
  - Member portal: bring `/courses/[slug]/member` onto the public look tokens (it's on emerald/gray today). Layout per board 7 as far as the existing data allows; **do not merge it into the course page in this run** (that's B-3).
  - States: sold-out/no-match empty state restyled; "Get an alert" modal restyled (inline version is B-2).
  Must NOT change: any pricing math, any policy text meaning, OTP vs magic-link auth, tabs vs no-tabs on the course page (tab removal is B-1), modal vs inline alert (B-2).
  Acceptance: walk inquiry→sheet→book→receipt→manage→checkin on a phone AND desktop; every dollar figure identical to before; Lighthouse mobile perf on `/courses/[slug]` not below current.

- [ ] **U-O · Operator dashboard — staff look** (no migration, large; split O1 tee sheet+settings / O2 the rest)
  Canvas boards: "Operator · Tee sheet", "Settings with live golfer preview", "Members", "Sign in + 2FA", "Getting started", "Schedule", "Analytics", "Payments", "Cancellations", "Messages".
  Routes: `/dashboard` (+ analytics tab), `/dashboard/schedules`, `/cancellations`, `/members`, `/payments`, `/messages`, `/settings`, `/onboarding`, `/login`, `/2fa`, `/forgot-password`, `/reset-password`, `/verify`, `/outings`, `/tournaments` (placeholders — empty-state pattern only).
  Reskin-only items: shell + sidebar per §1b; page header = serif title + one-sentence subtitle with the page's numbers ("31 booked of 80 spots for sale · 9 checked in · $571.50 collected"); tables = 11px uppercase headers, 13.5px rows, faded past rows, hatched blocked rows, amber late rows; stat tiles = eyebrow / serif 30px / 12.5px note; filters as square chips; login + 2FA per board.
  Settings: sub-nav on the left naming the existing sections in this order: How you look · Basic information · Course details · Photos · Booking rules · Cancellation · Member & resident pricing · Walking & carts · Payouts (Stripe) · Staff. "How you look" = the existing Branding fields (logo, brand color, course photo) grouped at the TOP with plain-English labels. **The live preview panel is B-6, not this run.**
  Must NOT change: any field, any validation, the schedule data model (time-band table view is B-7), attention rows/actions (B-8, B-9).
  Acceptance: every existing button still does what it did; a GM can find every setting they could find before; tee sheet check-in flow unchanged.

- [ ] **U-A · Admin console — staff look** (no migration, medium)
  Canvas boards: "Admin · Overview", "Inquiries board" (superseded — see INQUIRY_CALL_SPEC IC-3), "Courses" (superseded — see COURSES_SHEET_SPEC CS-2; U-A restyles the existing rows only), "Course detail", "Revenue", "Golfer lookup", "Employees + roles", "Activity", "System".
  Routes: all `/admin/*`.
  Reskin-only items: pine sidebar per §1b; Overview keeps the A-01 v2 section order exactly (pulse strip → your-move queue → ghost-bar trend → producers → systems line), only restyled; tile labels say whose money ("GreenReserve fees today" with "N players · M bookings" — fees are per PLAYER, never compute from booking count); inquiries = the 7-column sheet from INQUIRY_CALL_SPEC (NOT a kanban board — that canvas board is superseded, 2026-09-13); U-A only restyles the table, section headers and Next-call cell, behavior lives in IC-1..IC-3; course detail keeps its six tabs; revenue page is labeled "GreenReserve's money — not the courses'"; system page: green = tracked, grey = link-only (turning grey cards green is a schema item, out of scope).
  Must NOT change: any role gate, any action, the reconciliation logic.

- [ ] **U-M · Public pages other than the homepage** (no migration, small)
  `/for-courses` (lead form per canvas "Marketing · /for-courses": two-column, sticky pitch left, form right, "No account is created" line), `/contact`, `/terms` `/privacy` `/operator-agreement` (left legal sub-nav, version line, plain-English short version box at top, sections numbered). Public look. Placeholders for LQ-1/LQ-2/LQ-3 stay visible in the rendered page until legal clears them.

---

## 4. Behavior items — one run each, never inside a reskin

> **MERGED TO MAIN 525b32a on 2026-09-14 (was `feat/b-1-course-page`) — B-1, B-2, B-4, B-5, B-6, B-8, B-10 built and
> reviewed 2026-09-13/14; B-5 security review in flight at merge time.** Admin-UX: clean (one toast wording fixed). Spec: 33 MET / 4 PARTIAL / 1 NOT MET
> (B-8 "Mark no-show", declared — needs a schema column, attended); its two blockers FIXED on the branch:
> B-4 now fires on a real sold-out day (full rows still render, so "no row fits this party" is the
> trigger, offered as a panel above the rows), and scripts/route-inventory.ts now carries the MP-6b
> money-flow text so regenerating ARCHITECTURE.md no longer reverts it. Security auditor was
> rate-limited before starting; read by hand instead: the new remind-overdue route is owner/manager
> only, scoped to the session's course, throttled 7 days per member, and reuses the existing payToken
> link. CAM'S CALLS: (1) B-6's preview draws the PUBLIC look (14px radius, photo scrim) inside the
> staff shell — deliberate, but a §1b exception; (2) the reused dues email says "keep your … booking
> privileges" (pre-existing copy, src/lib/email.ts) — no such rule exists; (3) B-8 uses a 10-minute
> grace and the browser clock (same as the sheet's own "now"); (4) B-1's deadline is course wall-clock
> arithmetic — off by an hour if the window crosses a DST change. SHIP ORDER: reskin batch first
> (ff), then this branch (ff).

Ordered by value ÷ risk. Each is small unless marked.

- [ ] **B-1 · Course page: kill the tab bar, trust line above the first slot** — About/Photos become sections below the sheet; the trust line ("Nothing charged today. Cancel free until <real date+time>. $1.50/player booking fee.") renders above the slot list from course policy fields. Cancel deadline becomes a real date+time once a slot is selected. (AUDIT_MASTER trust-gap finding.)
  → BUILT 1258088, MERGED TO MAIN 525b32a (live walk pending) (stacked on the reskin batch; Cam merges after it). Tabs gone; About/Photos are #about/#photos sections under the sheet; trust line from cancellation_hours / late_cancellation_fee ("No card needed — cancel any time" when there is no late fee); deadline becomes a real date+time in COURSE time once a slot is selected. NOT touched: the pre-existing `TrustNote "Green fees go 100% to the course"` inside the expanded slot — frozen copy, someone should decide. Box open until review + walk.
- [ ] **B-2 · "Tell me if it opens" inline** — full slot expands in place with an email field + one-sentence promise; replaces the modal. Same API.
  → BUILT d360fb1, MERGED TO MAIN 525b32a (live walk pending). Full row taps open in place (sentence + email + "Tell me"), same /api/alerts; tap again folds it. Date-level "Set alert" keeps the modal. Both paths now show an error when the POST fails (the old catch swallowed it). Box open until review + walk.
- [ ] **B-3 · Member view = the course page, signed in** — a signed-in member sees member rate in place, guest lines priced per player, no card step. Retires the separate member portal design (keeps `/courses/[slug]/member` as the membership/dues page). Depends on member auth staying per-course OTP (see project memory: member auth is separate per course).
  **ANSWERED (Cam, 2026-09-14): it depends on the tier, and the course adjusts it.** Read it off the
  tier the member holds: `MembershipTier.greenFeeWeekdayCents/WeekendCents` = 0 or null → rounds
  included, show $0 green fee (cart fee from the tier's cart cents if set); a positive value → that
  is the member rate, show it; `discountPct` set and no fixed cents → guest price × (1 − pct). No new
  schema; the course already edits tiers in Members settings. Guest lines always at the guest price.
- [ ] **B-4 · Sold-out day → nearest fits** — empty state offers tomorrow / next day / same day for fewer players, from data the tee-times API already returns.
  → BUILT, MERGED TO MAIN 525b32a (live walk pending). Empty state offers the two nearest dates (within a week) with a slot that fits the party, and "Same day for N players →" when the day has seats but not enough. Replaces the party-blind "Next available" button. Box open until review + walk. REVIEW FIX: now also fires when every row is full (panel above the rows).
- [ ] **B-5 · Cart add-on at check-in** — "Add a cart today?" toggle on `/checkin` for bookings without one; adds cart fee to the check-in charge. **CONFIRMED by Cam 2026-09-14 — build it.** Uses the course's cart fee (tier cart cents for members).
  → BUILT, MERGED TO MAIN 525b32a (live walk pending). /checkin toggle for bookings with no cart whose tee time prices one (tee-time cart fee × players); performCheckIn(addCart) writes cartSelected/cartFeeTotal/totalAmount to the booking BEFORE the charge so charge, receipt and ledger agree; idempotency key now includes the amount. SECURITY-REVIEWED, hotfix d801dac on main: the already-charged guard now runs on every attempt (with the amount in the idempotency key, a cart retry after a timed-out first charge could have charged twice); member tier cart rate honoured via the membership (golferAccountId + courseId); cart write rolled back on a declined card; POST refuses when a cart cannot be added; /api/checkin rate-limited. Box open until review + walk (needs a real booking without a cart).
- [ ] **B-6 · Settings: live golfer preview** — the "How you look" section renders a 380px live preview of the course page (hero photo / tint, crest, accent on Select/Reserve) that updates as fields change. Read-only component fed from the form state. This is the most persuasive screen in the operator product; treat as a feature.
  → BUILT, MERGED TO MAIN 525b32a (live walk pending) (src/components/dashboard/CoursePreview.tsx). 380px read-only picture of the course page (hero photo/tint, crest, serif name, meta, trust line, slot rows with Select in the accent) fed from the form state; sticky beside "How you look" on xl, below it otherwise. Fetches/saves nothing. Box open until review + walk.
- [ ] **B-7 · Schedule as a time-band table** (Cam 2026-09-14: GO — but after the reskin batch and feat/b-1-course-page both merge) — rates by band × weekday/weekend × member/resident in one table, seasons as tabs, blocks + booking windows beside it. View-layer over the existing schedule objects; **no data model change** unless the restate step proves one is needed, in which case stop and split.
  → BUILT 9df9f2f on main. One table (band × weekday/weekend/member/resident/cart/status) over the same objects and actions; blocked days (blackouts API) and booking windows (read from Settings) beside it. NOT built: seasons as tabs — no date range on a schedule; schema if wanted. REVIEWED (admin-UX + spec): fixes on main — settings load errors surfaced, side panels render without schedules, blackout POST no longer deletes booked times (it 500'd), rate columns follow saved rates. Box open until a walk.
- [ ] **B-8 · Tee sheet "needs attention" row** — late group (tee time passed, not checked in) surfaces above the sheet with Mark no-show / Still coming.
  → BUILT (PARTIAL), MERGED TO MAIN 525b32a (live walk pending). Late groups (tee time 10+ min ago today, nobody checked in) surface above the sheet with "Check in now" (existing flow) and "Still coming" (session-only dismiss). NOT built: "Mark no-show" — nothing in the schema records a no-show; that half is attended (a noShowAt column + what it should do to the late fee). Box open until review + walk.
- [ ] **B-9 · Frost delay action** — push every tee time before HH:MM back by 30/60/90 minutes and email affected golfers in one step. Attended run; touches bookings + email.
- [ ] **B-10 · Members: overdue dues reminder** — one-click reminder email to all overdue members; "online booking paused until paid" only if that rule actually exists in code (verify first).
  → BUILT, MERGED TO MAIN 525b32a (live walk pending). POST /api/operator/members/remind-overdue emails the existing dues-link email to every active member on a paid tier who is unpaid or past expiry, once per 7 days each (renewalRemindedAt), outcomes counted back by name; Members page button + result toast. VERIFIED FIRST as the spec asked: no "booking paused until paid" rule exists in the booking code, so nothing claims it. Box open until review + walk.
- [ ] **B-11 · Getting-started checklist** — already specced as ONBOARDING_V2 V13; build it in the staff look. Not a new item, listed for order.
  → COVERED: the checklist exists (src/components/dashboard/GettingStartedChecklist.tsx, ONBOARDING_V2 V13) and U-O retokened it to the staff look. Nothing further to build here.
- [ ] **B-12 · Receipt rework** — itemize the $1.50, course header bar. Already on RUN_QUEUE as "booking receipt needs rework"; fold into U-G's confirmed/receipt restyle if the itemization is display-only.
  → COVERED by U-G + the batch review fixes: /receipt itemises the $1.50 (serviceFeeLabel) and wears the course header bar in the course colour. Nothing further to build here.

---

## 5. Homepage build — H-1 (its own run, medium-large, no migration)

> **SHIPPED 767d81c (2026-09-13)** — box open until /gr-review H-1 + a live walk. Built as
> specced below; deviations: (1) the story's "You keep every dollar" beat is frozen by §0.6
> and reads "Green fees are paid straight to your own account."; (2) the demo device is a
> standalone component (src/components/home/HomeDemo.tsx), not a CourseBookingClient
> derivative — that file is 1,500 lines of real booking logic with fetches; (3) the
> course cards are labelled example pages in the section copy and link to /for-courses
> until a demo course slug exists; (4) the final CTA's "book a 15-minute call" is an email
> link — no booking tool exists. FLAG FOR CAM: the README's "TEE" photo (the "We set it
> up" band) is a hillside of wind turbines, not golf — approved in the prototype, but worth
> a second look. Not yet Lighthouse-audited.

Build `/` from the approved prototype. Public look. Sections in order:
1. Nav (white/blur, lockup, links, pine CTA) — shrinks on scroll.
2. Hero: full-bleed ball-in-cup photo, text LEFT so the ball stays visible, slow settle (scale 1.12→1.06 over 7s) + scroll parallax (0.28×). Headline "The tee sheet your course deserves." Sub, two CTAs, fine print.
3. Story (pinned, 340vh): bunker photo pinned, scale 1→1.14 across the section; three beats crossfade (Your page / Your money / Your rules); progress ticks at right.
4. "See it work": the **live booking-page demo** — a real `CourseBookingClient`-derived component in demo mode (no network): tap a time → expands → Reserve → reserved state; 4 accent swatches + Your photo / No photo toggle drive a CSS variable page-wide. One shared component; must not import Stripe.
5. Course cards (Resy-style, 3 across): photo, serif name, town · type · holes, "From $X / player", "See tee times →". Hover lifts card, photo scales 1.05.
6. Photo band (tee shot) with parallax: "We set it up. You run it."
7. Four steps on paper cards.
8. Pricing on pine: "$1.50 per player" tile + copy from `legal/LQ-2_FEE_COPY.md` (placeholder removed 2026-09-14).
9. FAQ accordion: the six existing questions.
10. Final CTA + footer with lockup.

Motion rules: one easing curve everywhere; reveals only on scroll-in; no cursor tracking; `prefers-reduced-motion` disables all transforms/animations; mobile (<960px) unpins the story and stacks beats.

Assets: DO NOT ship data URIs. `next/image` with WebP/AVIF, sizes for 1600/1200/800, `priority` on the hero only. Photos: Unsplash ids in `docs/design/README.md` (free license; attribution optional); replace with real course photography as courses go live. Logo: `public/brand/logo-lockup.png` (already there).

Perf budget (mobile, Lighthouse): LCP ≤ 2.5s on the hero image, CLS < 0.05, total JS for `/` not above current + 20KB gz. The story section must use `transform` only (no layout thrash). If the live demo component pushes JS over budget, lazy-load it below the fold.

Acceptance: walk on iPhone Safari + Chrome desktop; hero ball visible at 1440 and 390 widths; reduced-motion renders static; no console errors; placeholders visible.

---

## 5b. Homepage revisions — H-2 (Cam's live walk, 2026-09-14)

Cam walked the live H-1 page. Two verdicts, decided via AskUserQuestion 2026-09-14:
- The pinned story "looks a little odd" — a frozen still for 2.4 screens. "I don't mind
  if the picture scrolls, but it almost needs to look like a video."
- "See it work" should ALSO show the dashboard the course would actually get, not only
  the golfer booking page. Decision: **both, two tabs**. Decision: **build the dashboard
  demo after U-O lands** so it is built once, in the new operator look.

Two runs. H-2a has no dependency and can run now; H-2b waits for U-O (O1).

### H-2a · Story looks like a video (small/medium, no migration, no U-O dependency)

Keep the pin, the 340vh, the three beats and the progress ticks — the STRUCTURE was
approved and the copy is good. Replace the frozen still with motion:

1. **Looping video under the beats.** `<video>` in `.storyPh` replacing the `<Image>`:
   `autoplay muted loop playsinline preload="none"`, `poster="/home/bunker.jpg"`
   (the current still, so nothing changes until the clip is ready). Sources: `.webm`
   (VP9) then `.mp4` (H.264). Same `object-fit: cover; object-position: center 70%`.
   Keep the scroll-driven `--z` scale on the wrapper — video + slow zoom reads as one
   continuous shot.
2. **Start/stop with visibility.** IntersectionObserver on the section: `play()` when
   ≥10% visible, `pause()` when not. Never let it play under the fold.
3. **Fallbacks, all three required:** `prefers-reduced-motion` → do not render the
   `<video>` at all, the poster shows (the existing rule); `navigator.connection?.saveData`
   → same; if the video errors or never reaches `canplay` within 4s → the poster stays,
   no spinner, no console error.
4. **The clip.** CAM SUPPLIES OR PICKS IT — the run does not fetch stock footage.
   Requirements: slow drone or slider move over a course (no people close up, no
   logos, no text), 8–15s, loops without a visible cut (either a true loop or a slow
   crossfade at the seam done in the edit), no audio track. Encode 1920×1080 at ~2.5
   Mbps: target ≤ 3.5 MB mp4 and ≤ 3 MB webm. Put both in `public/home/` as
   `story.mp4` / `story.webm`. Free-license source (Pexels/Pixabay video are fine);
   record the source id in `docs/design/README.md` like the photos.
   **2026-09-14: files are IN PLACE** — `public/home/story.mp4` (3.8 MB), `story.webm` (2.9 MB),
   `story-poster.jpg` — a 24s ease-in/ease-out push on a top-down green photo Cam chose.
   Use `story-poster.jpg` as the poster (not bunker.jpg). Photo source: [SOURCE — Cam to fill
   in docs/design/README.md before this run ships; do not deploy with this placeholder].
4b. **The poster is never a frozen still.** Until a clip exists (and whenever the
   fallbacks fire), the still gets a CSS keyframe drift: `scale 1.02→1.10` with a
   `translate` of ~2% over 28s, `alternate`, `ease-in-out`, on the same `.storyPh`
   wrapper (compose with the scroll `--z` by putting the drift on the inner `<img>`).
   This is Cam's minimum bar for the section — motion in the picture at all times —
   and it costs nothing. Disabled by `prefers-reduced-motion` like everything else.
5. **Mobile (<960px):** stays unpinned, and does NOT load the video (data) — the
   stacked-beats-over-still layout remains as built.
6. Perf: the video is below the fold and `preload="none"`, so LCP is untouched. Verify
   the mobile Lighthouse numbers from §5 still hold and that `/` JS grew by < 2KB gz.

Acceptance: at 1440 the story plays as a continuous moving shot with the three beats
over it; pausing scroll does not stop the picture; reduced-motion shows the still;
no request for `story.*` at 390px.

### H-2b · "See it work" shows both sides (medium, no migration — AFTER U-O O1)

Section 4 becomes a two-tab demo. Tabs sit under the `.h2`/`.sub`, segmented control
in the public look (`.seg`): **What golfers see** · **What you see**. Default tab:
"What golfers see" (the approved demo). Sub copy becomes: "Both halves are real: this
is how the booking page works, and this is the tee sheet you run it from."

1. **What golfers see** = today's `HomeDemo`, unchanged.
2. **What you see** = new `HomeDashboardDemo` (`src/components/home/`), standalone like
   `HomeDemo` — no fetch, no session, no import from `src/app/dashboard/`. It mirrors
   the dashboard HOME tee sheet as it looks after U-O (canvas board "Operator · Tee
   sheet" is the visual source; the current `dashboard/page.tsx` tee-sheet block is
   the anatomy source):
   - Stats row: Total slots · Booked · Expected · Blocked (four tiles, serif numbers).
   - Date strip: 7 days, today selected; clicking another day swaps to a second fake
     day (fewer bookings) so the strip is not dead.
   - Tee sheet: ~8 rows from 7:00 to 12:30. States present at least once each: open,
     partly booked (2 of 4, names shown as "M. Rivera +1"), full, blocked ("Course
     maintenance"), checked in. Row anatomy = the real tee-sheet row (time, players,
     names, price, status chip, right-side action).
   - Interactions (all local state): tap a booked row → it expands → "Check in" →
     row flips to checked-in and the Booked/Expected tiles update; tap an open row →
     "Block time" → blocked state, Blocked tile +1. One "Undo" per action so a visitor
     can play without reloading.
   - Sidebar: the real operator sidebar's identity block (logo mark, course name,
     "Hollow Creek Golf Club"), nav labels only, nothing clickable except the demo.
   - Framed as a laptop, not a phone: the `.device` frame at ~980px wide, scaled with
     `transform: scale()` to fit the wrap on smaller desktops; below 960px show the
     tee sheet alone at full width without the sidebar.
3. **Shared white-label state.** The accent swatch picked on "What golfers see" also
   recolors "What you see" (course accent per §1b: status chips, selected date, the
   sidebar identity block). The course name and photo the golfer demo shows are the
   ones the dashboard demo shows. Lift the swatch state to a small parent
   (`HomeDemoTabs`) so both children read it.
4. Copy honesty: the tee sheet shows "$1.50/player service fee" nowhere on the
   operator side (it is a golfer-side line) and no revenue claims beyond the fake
   day's own arithmetic.
5. Perf: `HomeDashboardDemo` is lazy-loaded (`next/dynamic`, ssr false) only when its
   tab is first selected; the default tab's JS stays as today.

Acceptance: tabs work with keyboard (arrow keys, role=tablist); switching tabs does
not reset the picked accent; the four tiles change when a row is checked in or
blocked; at 390px the dashboard tab shows the sheet without the sidebar and no
horizontal scroll; Lighthouse mobile numbers from §5 still hold.

### H-2c · Kill the photo band (small, no migration — run FIRST, it's a live embarrassment)

Cam, 2026-09-14, after a live walk: the "We set it up. You run it." band renders a
**wind farm** — Unsplash id `1532601224476-15c79f2f7a51` (the README's "TEE") is not a
tee shot. Separately, the page's top half is three full-bleed photo-with-white-text
sections in a row (hero, story, band), which is what makes it read as busy.

1. Delete section 6 (`.band`, `bandRef`, `bandPhRef`, the `--py` parallax branch in the
   scroll handler, the `.band*` CSS rules) and `public/home/tee.jpg`. Remove the TEE row
   from `docs/design/README.md`.
2. Its headline moves into section 7: "Live in four steps." keeps its position as the
   `.h2`; directly under it, one line in the section-sub style: "We set it up. You run
   it. Tell us about your course and we build the sheet with you; you approve a private
   preview, connect your bank, and go live. Days, not months." Replace the current sub
   ("No technical knowledge needed…") with that — don't stack two subs.
3. Nothing else changes. Resulting rhythm: photo hero → moving story → white demo →
   course cards → white steps → pine pricing → FAQ → CTA — every photo section is
   followed by a quiet one.
4. While in there: grep `public/home/` and the README for every image id and open each
   one in a browser; confirm each is a golf image. One wrong id got through H-1's
   review; assume there could be another.

Acceptance: no `tee.jpg` request on `/`; the steps section reads as one block; Lighthouse
mobile numbers from §5 still hold (they'll improve — one fewer 1600w image).

## 6. Verification, every run

`/gr-review` as usual, plus: side-by-side with the canvas board named in the item; a phone walk of any golfer route touched; `git diff --stat` reviewed for files outside the restate list (that's the smuggling check). Reskin runs additionally: grep the diff for `fetch(`, `prisma`, `useState(` additions — any hit means the run drifted into §4 and must be split.

## 7. Out of scope here

Legal copy resolution (legal/), fee-flow decision, schema of any kind, marketplace/directory, outings & tournaments features, admin role-shaped views (parked), cross-course golfer account.

## 8. Order

U-0 → H-1 (highest external value, independent of the staff look) → U-G → B-1 → B-2 → U-O (O1 then O2) → B-6 → U-A → U-M → remaining B-items by Cam's pick.
