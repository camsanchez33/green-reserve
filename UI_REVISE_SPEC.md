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
6. Marketing copy about the fee ("you keep 100%", "we charge golfers, not you") is FROZEN behind a visible placeholder until LQ-2 is decided. Reskin runs must not restore it.

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
  Canvas boards: "Admin · Overview", "Inquiries board", "Courses", "Course detail", "Revenue", "Golfer lookup", "Employees + roles", "Activity", "System".
  Routes: all `/admin/*`.
  Reskin-only items: pine sidebar per §1b; Overview keeps the A-01 v2 section order exactly (pulse strip → your-move queue → ghost-bar trend → producers → systems line), only restyled; tile labels say whose money ("GreenReserve fees today" with "N players · M bookings" — fees are per PLAYER, never compute from booking count); inquiries board columns = the real pipeline stages, pine left-edge = your move, faded = stalled 7d+; course detail keeps its six tabs; revenue page is labeled "GreenReserve's money — not the courses'"; system page: green = tracked, grey = link-only (turning grey cards green is a schema item, out of scope).
  Must NOT change: any role gate, any action, the reconciliation logic.

- [ ] **U-M · Public pages other than the homepage** (no migration, small)
  `/for-courses` (lead form per canvas "Marketing · /for-courses": two-column, sticky pitch left, form right, "No account is created" line), `/contact`, `/terms` `/privacy` `/operator-agreement` (left legal sub-nav, version line, plain-English short version box at top, sections numbered). Public look. Placeholders for LQ-1/LQ-2/LQ-3 stay visible in the rendered page until legal clears them.

---

## 4. Behavior items — one run each, never inside a reskin

Ordered by value ÷ risk. Each is small unless marked.

- [ ] **B-1 · Course page: kill the tab bar, trust line above the first slot** — About/Photos become sections below the sheet; the trust line ("Nothing charged today. Cancel free until <real date+time>. $1.50/player booking fee.") renders above the slot list from course policy fields. Cancel deadline becomes a real date+time once a slot is selected. (AUDIT_MASTER trust-gap finding.)
- [ ] **B-2 · "Tell me if it opens" inline** — full slot expands in place with an email field + one-sentence promise; replaces the modal. Same API.
- [ ] **B-3 · Member view = the course page, signed in** — a signed-in member sees member rate in place, guest lines priced per player, no card step. Retires the separate member portal design (keeps `/courses/[slug]/member` as the membership/dues page). Depends on member auth staying per-course OTP (see project memory: member auth is separate per course).
  Open question for Cam before this runs: do all tiers cover rounds (show $0) or do some pay a member rate?
- [ ] **B-4 · Sold-out day → nearest fits** — empty state offers tomorrow / next day / same day for fewer players, from data the tee-times API already returns.
- [ ] **B-5 · Cart add-on at check-in** — "Add a cart today?" toggle on `/checkin` for bookings without one; adds cart fee to the check-in charge. Cam to confirm he wants this at all.
- [ ] **B-6 · Settings: live golfer preview** — the "How you look" section renders a 380px live preview of the course page (hero photo / tint, crest, accent on Select/Reserve) that updates as fields change. Read-only component fed from the form state. This is the most persuasive screen in the operator product; treat as a feature.
- [ ] **B-7 · Schedule as a time-band table** — rates by band × weekday/weekend × member/resident in one table, seasons as tabs, blocks + booking windows beside it. View-layer over the existing schedule objects; **no data model change** unless the restate step proves one is needed, in which case stop and split.
- [ ] **B-8 · Tee sheet "needs attention" row** — late group (tee time passed, not checked in) surfaces above the sheet with Mark no-show / Still coming.
- [ ] **B-9 · Frost delay action** — push every tee time before HH:MM back by 30/60/90 minutes and email affected golfers in one step. Attended run; touches bookings + email.
- [ ] **B-10 · Members: overdue dues reminder** — one-click reminder email to all overdue members; "online booking paused until paid" only if that rule actually exists in code (verify first).
- [ ] **B-11 · Getting-started checklist** — already specced as ONBOARDING_V2 V13; build it in the staff look. Not a new item, listed for order.
- [ ] **B-12 · Receipt rework** — itemize the $1.50, course header bar. Already on RUN_QUEUE as "booking receipt needs rework"; fold into U-G's confirmed/receipt restyle if the itemization is display-only.

---

## 5. Homepage build — H-1 (its own run, medium-large, no migration)

Build `/` from the approved prototype. Public look. Sections in order:
1. Nav (white/blur, lockup, links, pine CTA) — shrinks on scroll.
2. Hero: full-bleed ball-in-cup photo, text LEFT so the ball stays visible, slow settle (scale 1.12→1.06 over 7s) + scroll parallax (0.28×). Headline "The tee sheet your course deserves." Sub, two CTAs, fine print.
3. Story (pinned, 340vh): bunker photo pinned, scale 1→1.14 across the section; three beats crossfade (Your page / Your money / Your rules); progress ticks at right.
4. "See it work": the **live booking-page demo** — a real `CourseBookingClient`-derived component in demo mode (no network): tap a time → expands → Reserve → reserved state; 4 accent swatches + Your photo / No photo toggle drive a CSS variable page-wide. One shared component; must not import Stripe.
5. Course cards (Resy-style, 3 across): photo, serif name, town · type · holes, "From $X / player", "See tee times →". Hover lifts card, photo scales 1.05.
6. Photo band (tee shot) with parallax: "We set it up. You run it."
7. Four steps on paper cards.
8. Pricing on pine: "$1.50 per player" tile + copy; **LQ-2 placeholder note stays visible** until cleared.
9. FAQ accordion: the six existing questions.
10. Final CTA + footer with lockup.

Motion rules: one easing curve everywhere; reveals only on scroll-in; no cursor tracking; `prefers-reduced-motion` disables all transforms/animations; mobile (<960px) unpins the story and stacks beats.

Assets: DO NOT ship data URIs. `next/image` with WebP/AVIF, sizes for 1600/1200/800, `priority` on the hero only. Photos: Unsplash ids in `docs/design/README.md` (free license; attribution optional); replace with real course photography as courses go live. Logo: `public/brand/logo-lockup.png` (already there).

Perf budget (mobile, Lighthouse): LCP ≤ 2.5s on the hero image, CLS < 0.05, total JS for `/` not above current + 20KB gz. The story section must use `transform` only (no layout thrash). If the live demo component pushes JS over budget, lazy-load it below the fold.

Acceptance: walk on iPhone Safari + Chrome desktop; hero ball visible at 1440 and 390 widths; reduced-motion renders static; no console errors; placeholders visible.

---

## 6. Verification, every run

`/gr-review` as usual, plus: side-by-side with the canvas board named in the item; a phone walk of any golfer route touched; `git diff --stat` reviewed for files outside the restate list (that's the smuggling check). Reskin runs additionally: grep the diff for `fetch(`, `prisma`, `useState(` additions — any hit means the run drifted into §4 and must be split.

## 7. Out of scope here

Legal copy resolution (legal/), fee-flow decision, schema of any kind, marketplace/directory, outings & tournaments features, admin role-shaped views (parked), cross-course golfer account.

## 8. Order

U-0 → H-1 (highest external value, independent of the staff look) → U-G → B-1 → B-2 → U-O (O1 then O2) → B-6 → U-A → U-M → remaining B-items by Cam's pick.
