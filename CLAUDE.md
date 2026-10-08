# GreenReserve — Claude Code Context

## What this is
GreenReserve is an OpenTable-style golf tee sheet platform. Golf courses list for free, golfers book online. Revenue model: $1.50/player service fee charged to the golfer at booking; courses keep 100% of green fees.

**Live URL:** https://greenreserve.app  
**Stack:** Next.js 15 (App Router), TypeScript, Prisma (PostgreSQL), Stripe Connect, Resend (email), Vercel

---

## Key architectural decisions

### Payment flow (deferred, not immediate)
- Golfers save a card at booking via Stripe SetupIntent — **nothing is charged at booking time**
- Charge happens at **check-in** via direct Stripe charge against the saved PaymentMethod
- SP-B (Cam 2026-10-05, reverses FB-3's "every booking saves a card"): a card is asked for at booking ONLY when the course's policy can charge it — a late fee or a no-show fee (`cardRequired()` in `src/lib/cancel-policy.ts`). No fees → no card; the golfer gets the pay link `checkInWindowHours` before the round (paymentStatus `no_payment_method`). GreenReserve's $1.50 is collected when the golfer pays, and is charged ALONG WITH any late or no-show fee the course's policy charges. The policy (fee per booking/player, timing, no-show fee, auto no-show) is copied onto the Booking at creation; `describePolicy()` is the ONLY source of golfer-facing policy wording. CARD-1 (Cam 2026-10-05): Settings shows this as an explicit "Card at booking" choice — "No card" zeroes both fees; it is not a separate flag
- Cancellation-window hold: the moment a booking's cancellation cutoff passes, the `hourly` cron charges the fee (the daily `cancellation-cutoff` is a safety net) to the saved card for EVERY still-confirmed booking at a fee-policy course. It is a hold, not a no-show penalty — it is refunded at check-in. No-fee courses get a check-in reminder email instead.
- Cancelling after the window keeps that fee (non-refundable)

### Booking status flow
```
confirmed → (check-in) → completed
confirmed → (cancel before window) → cancelled (no charge)
confirmed → (cancel after window) → cancelled (fee charged, non-refundable)
confirmed → (cutoff passes, hourly cron) → hold fee charged, still confirmed; refunded at check-in   [timing hold_at_cutoff only]
confirmed → (late cancel, timing late_cancel / late_cancel_or_no_show) → cancelled, late fee + GreenReserve fee charged then
confirmed → (no-show: staff, or auto N min after tee time) → noShowAt set, no-show fee + GreenReserve fee charged; "still coming" refunds both
confirmed → (staff marks no-show) → noShowAt set, still confirmed (reversible: "still coming")
confirmed → (staff "paid offline") → completed, paymentStatus paid_offline, no Stripe charge
confirmed → (moved: staff, golfer's own swap, frost delay) → still confirmed on the new tee time; ONE lib/move-booking.ts (ACT-1). Staff keep the booked price unless they pick the new time's rate; a golfer's swap is priced at the new slot with their member tier re-applied; the booking fee keeps its per-player amount (0 stays 0); a hold already taken stays; event booking_moved
completed → (staff moves a checked-in group, Cam 2026-10-08) → still completed on the new tee time; price always kept (it's paid), nothing charged or refunded; the golfer's own swap and frost delay still refuse checked-in groups
```

### Check-in
- Staff check-in: tee sheet on `/dashboard` → `PATCH /api/operator/bookings` with `action: 'checkin'`
- Golfer self check-in: `/checkin/[bookingId]?token=...` → `/api/checkin/[bookingId]` (token-gated, emailed in confirmation)
- Both call shared `performCheckIn()` in `src/lib/checkin-booking.ts`
- PAY-1 (Cam 2026-10-06): paying at the counter without a POS = **Text pay link** on the tee sheet row (`send_pay_link` with `via: 'sms'`, Twilio) → the golfer pays on their own phone on `/checkin/[bookingId]` with Apple Pay / Google Pay (Stripe Payment Request button) or a card; the booking fee rides with the round. Works for counter/phone bookings too (a token is minted if missing). Cash = "paid at counter" (`paid_offline`), which collects no GreenReserve fee — PAY-2 (Cam 2026-10-06): that is accepted on purpose ("we are just going to have to eat it"); every such online booking is counted on Admin → Revenue ("Not collected, paid at the counter", per course) via `counterFeesUncollected()` in `src/lib/access-fee.ts`. Never block or penalise cash. Staff typing a card (tee sheet card modal) stays as the fallback
- EXCEPTION: the counter's `paid_offline` action (same operator route) completes the booking WITHOUT `performCheckIn()` — anything that must happen on every check-in has to cover that branch too

### Discovery-call booking (inquiry → call)
- The inquiry confirmation email links to `/call/[token]` (token-gated, 21 days)
- **Cal.com is the only scheduler** (Cam 2026-09-29 — the Google Calendar path was never connected and is deleted; do not reintroduce it). The page REDIRECTS to the prefilled public Cal.com booking page (reads Cam's Outlook; an in-page embed rendered blank live — don't retry it without testing against real cal.com); a signed webhook at `/api/calcom/webhook` creates/moves/cancels the inquiry's discovery `Call`. Admins book for a course with "Book on Cal.com" on the inquiry page. Unset `CALCOM_BOOKING_URL` = the page asks the course to reply with times. Admin → System → Call booking shows what the site sees. See `src/lib/calcom.ts`

### Operator onboarding pipeline
Inquiry → `pending` → `in_review` → `details_requested` → `details_submitted` → `building` → `live`
Admin page manages all stages. Operators get dashboard access when approved.

---

## Where things are

**Read `docs/CODEMAP.md` before grepping or reading source.** It names every
route with its auth level and where that auth is actually enforced, every
library and component with its exports and how many files import it, every
schema model with the files that write to it, and the one file that owns each
concept. Read a file only after the map tells you which one.

It is generated (`node scripts/codemap.mjs`) and CI fails when it drifts, so it
cannot go stale the way a hand-written tree does — the tree that used to live
here listed `src/app/account/`, which has never existed.

`docs/codemap.json` is the same data for a script to read.

### Key models
- `Course` — slug, operator, pricing, policies, facilities
- `TeeTime` — generated slots, status (available/booked/blocked)
- `TeeTimeSchedule` — templates that drive tee time generation
- `Booking` — links GolferAccount + TeeTime, holds paymentMethodId + customerId
- `CourseOperator` — operator login, Stripe accountId
- `GolferAccount` — golfer login, email-based auth
- `MembershipTier` / `CourseMembership` — member pricing tiers
- `TeeSet` — tee set options per course

---

## Overseer protocol — who does what (Cam 2026-10-06)

The main session is the **overseer** (the strongest model available — set with
`/model`; currently Opus 5.5). It plans every task, decides what to delegate,
and owns the final call. Agent models and effort are fixed in each
`.claude/agents/*.md` frontmatter, so routing = choosing the agent.

| Work | Who | Model · effort |
|---|---|---|
| Lookups: "where is X", "who writes Y" | `scout` | Haiku · low |
| Plan, design, anything ambiguous | overseer | session model |
| Money, auth/sessions, tenant isolation, charging crons, schema | **overseer only** — never delegated | session model |
| Mechanical edits from an exact plan: UI pages/components, copy, admin screens, new tests | `builder` — allow-list in `.claude/agents/builder.md`: no lib/api/schema/config, no UI that writes through the API or handles cards/tokens | Sonnet · medium |
| Zero-behavior reskin items, in a worktree (only via `/gr-batch`) | `reskin-worker` | Opus |
| Design-system / admin no-silent-failure audits | `design-auditor`, `admin-ux-auditor` | Sonnet |
| Security / spec audits | `security-auditor`, `spec-conformance` | Opus |
| **Every diff, before verification and push** | `final-reviewer` | Fable · high (Cam 2026-10-06: the last gate reads only a diff, so the strongest model costs little here) |

Rules:
- **Don't delegate small work.** A sub-agent starts cold and re-reads what the
  overseer already has. Under ~3 files, or when the overseer already holds the
  context, the overseer does it itself.
- **Money and auth never go to a cheaper model** — the 2026-10-05 review found
  the S1 bugs there.
- **Nothing ships without `final-reviewer` PASS** — `/gr-run` and `/gr-debug` run it before every push. BLOCK → fix → re-review. The
  reviewer is never the agent that wrote the change. The overseer then verifies
  (tests, CI) and decides.
- Parallel, independent lanes (a full-site review) use a Workflow only when Cam
  asks for one.

## Build & deploy

### CRITICAL: build validation
`next.config.ts` has `typescript: { ignoreBuildErrors: true }` — TypeScript type errors do NOT fail the build. Only **SWC parse errors** do.

To validate before pushing:
- `npx tsc --noEmit` — CI runs this via `.github/workflows/typecheck.yml`
- `node scripts/parse-check.js src` (or a file list) — SWC-parity parse check on every `.ts`/`.tsx`, mirrors what the build does. The PostToolUse hook in `.claude/settings.json` runs the same check on every file Claude edits, so a parse error surfaces the moment it is written.

### Deploy
```bash
git add -A && git commit -m "..." && git push
# Vercel auto-deploys from main, or:
npx vercel --prod
```

### Shipping to production

Full checklist, rollback steps and env-var list: `docs/SHIPPING.md`. The rules that never bend:

- Schema changes go through real Prisma migrations: `migrate dev` → commit the migration file → `migrate deploy` on prod. `db push` is banned except on throwaway sandbox DBs.
- Schema changes are run attended, on a feature branch, and must pass `.github/workflows/schema-check.yml`. Never `migrate reset`, `db push`, or direct `psql` writes on prod, and never test a migration on prod.
- **No Vercel preview step (Cam 2026-09-29: "drop the preview rule").** Preview builds fail and nobody uses them. A schema change is verified LOCALLY instead: apply every migration from scratch to a local Postgres (`migrate deploy`), run the app against it and walk the feature end to end. Migrations must be additive — new tables, nullable columns or columns with a default; no drops, renames or type changes. A migration that rewrites or backfills existing rows is tested against a Neon branch of prod first (docs/SHIPPING.md) and needs Cam's approval.
- Vercel's production build runs `scripts/migrate-prod.js` (`migrate deploy` only when `VERCEL_ENV === 'production'`), so merging to main applies the migration to prod. Rollback: Neon PITR or a compensating migration.
- After any schema deploy: `/api/health` returns `{"ok":true,"db":"up"}` and `npx prisma migrate status` reports up to date.

### Performance budgets (golfer-facing pages)

Enforced by `.github/workflows/perf-audit.yml` on every PR (budgets, audited pages and the local command are in `docs/SHIPPING.md`). Rules that keep it green:
- No heavy client-side animation libraries (framer-motion is unused but still listed in package.json — never import it; use CSS transitions)
- `<img>` tags must have `loading="lazy"` unless above the fold
- Stripe JS deferred until a card is actually needed (`getStripePromise()` pattern in book/page.tsx)
- New `'use client'` components on golfer pages need a bundle-size justification

### No-silent-failures rule (admin)
Every admin action must show: pending state → then success or an explicit error explaining what to do next. Never swallow a `catch` in an admin fetch handler — always surface the error to the user. Never silently redirect away on a fetch failure — show an inline error state with a retry option. This rule applies to all new admin routes and must be audited when touching existing admin pages.

### Staff permissions (SP-A, STAFF_POLICY_SPEC Part A)
Staff logins are permissioned PER PERSON by the course owner (Settings → Staff & permissions). The catalog, presets and dependencies live in ONE file, `src/lib/staff-permissions.ts`; `resolveDashboardSession()` exposes `session.permissions` and every staff-reachable route gates with `requirePermission(session, key)`. The client (`useDashboardAccess()`) only hides — the route is the control. A new staff-reachable action needs a key in the catalog AND a `requirePermission` call. Staff rows with `permissionsSetAt` null resolve as the Legacy preset (pre-SP-A powers minus weather cancel and waiving fees). Never grantable: staff management, Stripe, the agreement, the cancellation policy (`STAFF_FORBIDDEN` stays on those).

### Session policy (per surface)

| Surface | Cookie | JWT TTL | Renewal |
|---------|--------|---------|---------|
| Admin employees (viewer/support/manager) | `admin_session` | 12h absolute | None — re-authenticate after 12h |
| Admin owner | `admin_session` | 12h absolute | None — 2FA at each login |
| Operator/staff dashboard | `gr_operator` | 7 days sliding | Reissued when >50% elapsed |
| Golfer | `gr_golfer` | 90 days sliding | Reissued when >50% elapsed |
| Member (per-course) | `gr_member` | 90 days absolute | None |

Sliding renewal is implemented in `src/lib/auth.ts` → `getOperatorSession()` / `getGolferSession()`.
Do NOT run `scripts/route-inventory.ts`: ARCHITECTURE.md's route tables were deleted on purpose (Cam 2026-09-16, they drifted from the code map) and that script would regenerate them. `docs/CODEMAP.md` (`node scripts/codemap.mjs`) is the route map.

### Status board — regenerate at the end of EVERY run

`STATUS.md` / `STATUS.json` / `STATUS.artifact.html` are how Cam sees what has
shipped and what is planned without reading the queue. They are generated, not
hand-edited. Last step of every run, after the work is committed:

```bash
node scripts/status.mjs && node scripts/status-html.mjs
```

then commit the three outputs with the run. A stale board is worse than none —
it reports work as "not started" that shipped hours ago.

`AUDIT_MASTER.md` is Cam's private ideas bank. It is gitignored. Never commit it,
and never move its contents into the queue without asking.

### Control Room — every session reports itself (Cam 2026-10-06)

Cam watches what every session is doing on the Control Room page,
https://claude.ai/artifact/CWmgjgJHTZaTr4XThBuvZL. A page cannot list sessions,
so each session writes its own row. **Only the main session (the overseer)
writes — sub-agents never touch it** (they share the session id and would
overwrite the row). Use the `ArtifactData` tool (load it with ToolSearch) on that
URL, collection `sessions`, doc id = this session's id (the `session_…` part of
the `Claude-Session:` URL in the commit attribution). If `ArtifactData` isn't
available, skip the Control Room and say so once in the first reply.

- **When:** at the start of the run (after committing dirty docs), after each
  real step (a push, a PR opened or merged, a blocker hit), at least every ~20
  minutes during a long step, and as the last thing before ending the turn.
- **First write:** `get` the doc. Missing → `set` it (no `if_version`). Present
  (a resumed or compacted session) → `update` with its `version`. Every later
  write is `update` with `if_version` = the version the previous write returned;
  if refused, `get` and redo it with the current version.
- **Fields:** `title` (the session's title), `state` — `working` | `waiting`
  (needs Cam) | `review` (PR ready for Cam) | `failed` | `done`, `doing` (one
  plain sentence: what it is doing right now), `needs` (what Cam must do, or
  ""), `pr` (number or null), `branch`, `model` (short id, e.g. `fable-5-1`), `sessionUrl`
  (`https://claude.ai/code/<session id>`), `updatedAt` (`date -u
  +%Y-%m-%dT%H:%M:%SZ` — real time, never guessed).
- End every turn with `state` other than `working` — a `working` row that goes
  30 minutes without a write shows as **Silent** on the page.
- Never put secrets, customer data or env values in a row; Cam may share the page.

### Doc-file commit rule
After every run, `git status` — if dirty:
- **Doc files** (`RUN_QUEUE.md`, `*_SPEC.md`, `CLAUDE.md`, everything under `.claude/`, `scripts/*.mjs`, everything under `legal/`): COMMIT with message `"queue/spec update"` — never discard; Cowork edits them between runs.
- **Non-doc files**: never auto-discard. If they belong to the run, commit them with it; if you cannot tell whose they are, stop and ask Cam. (Changed 2026-09-29 — this used to be `git checkout -- .`, which silently destroyed any uncommitted code.)

First action of every run: commit any dirty doc files BEFORE reading the queue.

## Environment variables

All required in Vercel; the full list is in `docs/SHIPPING.md`, the secrets inventory in `docs/RUNBOOK.md`. Never paste values into chat, specs or the queue.

---

## Homepage direction — READ `HOMEPAGE_SPEC.md` §0 FIRST (Cam 2026-10-07)

HOME-2 is Cam's own layout: one full-screen coast photo with the cream logo
centred and one line under it saying what we are (CLUB-1) → what it is
(paragraph, bullets, "See how it works" + "Learn more about the tee sheet"
cards) → what your course gets (only features that exist today; pro-shop
access waits until built) → the working demo (tee sheet on a laptop, golfer
phone beside it) with Book a demo → the logo again with "The tee sheet your
course deserves." The detail, FAQ (+ its JSON-LD), about and contact live on
`/teesheet`. `src/app/HomeContent.tsx` + `home.module.css`, ONE client island
`src/components/home/TeeSheetDemo.tsx`, whose every label must match the real
dashboard tee sheet and booking flow. Every "Book a demo" goes to `/demo`
(→ Cal.com, tagged source=homepage); "Ask a question" goes to `/for-courses`
(CLUB-0); the Cal.com webhook opens a pending "Demo booking" inquiry when a
booking matches none. The one hero photo is allowed (Cam 2026-10-07 lifted the
photo ban for it); still rejected, never revive: Direction B
(Figtree/white/pills), the printed-scorecard look, the scroll-driven golf-hole
concept and an aerial course behind the whole page. Homepage copy has NO
durations and NO contract terms; fee sentences only from
`legal/LQ-2_FEE_COPY.md`. The spec also lists what is waiting on Cam.

## Design system — ONE look for every page (FLOW-1, Cam 2026-10-01)

Cam 2026-10-01: "get this ui build out through /admin and /dashboard and every other
page so the whole site flows together." The split PUBLIC/STAFF look (UI_REVISE_SPEC §0/§1,
Sept 2026) is RETIRED. Every page — homepage, /for-courses, legal, golfer pages, /dashboard,
/admin — uses the homepage's palette, type (TYPE-1: EB Garamond + Libre Franklin) and corners. Clubhouse *structure* still holds
(white cards on paper, StatusDot, no pills, no dark mode).

| | Every page |
|---|---|
| Fonts | TYPE-1 (Cam 2026-10-05, "the font is all so blocky looks ai"): `font-serif` = **EB Garamond** (600 since CLUB-1 — Cam 2026-10-05 after clubup.com: headlines carry weight; lining figures) — the display face, for headlines, course names and dates ONLY; `font-sans` = **Libre Franklin** for everything else — times, buttons, tables, body. Never set times or data in the serif. Both via next/font in layout.tsx. Archivo, Newsreader and Source Sans 3 are no longer loaded |
| Corners | Tailwind defaults: `rounded-md` 6px buttons/inputs, `rounded-lg` 8px cards; `rounded-full` avatars/dots/swatches |
| Paper / ink / line | #FAFAF7 / #141814 / #E3E4DE |
| Accent | `pine` (#173B2A forest) for GreenReserve; per-course `Course.brandColor` on golfer pages and the operator dashboard. CLUB-1: `fairway` (#3BAA6B) is a second, DECORATION-ONLY green — rules, the slanted stripe, link underlines, the active tab. It is 2.9:1 on paper, so never text and never the only signal |

FLOW-2 (Cam 2026-10-01, "clunky"): cards are soft sheets — `<Card>` / `CARD` is `bg-white rounded-lg shadow-card` (a 6% ring + 0 1px 2px), never a ruled `border border-line` box, and never a box inside a box (inner items are rows with hairlines or a `bg-paper/70` fill). The admin sidebar is a light rail (white, `border-line`, the lockup). The operator tee sheet mirrors the homepage demo (`TeeSheetDemo.tsx`) — change one, check the other. SHEET-2 (Cam 2026-10-07, "like a draft board"; 2026-10-08, "the board should just replace the list"): the board (`TeeSheetBoard.tsx`) is the tee sheet's default on tablet/desktop; the list stays as the phone default and behind the List | Board toggle. Each time is an equal square naming every group with its count; its 3px left edge is the money state (`ok` every group paid, `warn` booked not paid, `bad` declined card or no-show) and the next time reads "Next up". Tapping a square opens a side panel whose group lines and buttons are the list's own (`groupRow()` in dashboard/page.tsx renders both — never fork them). Dragging a group opens the same ACT-1 `MoveGroupModal`; nothing moves without its confirm. The homepage demo still shows the list — bringing it to the board is queued (PLATFORM_ROADMAP_SPEC §9). Its time cards sitting inside the sheet card is deliberate (Cam: "each was a box") — the one exception to FLOW-2's no box-in-box.

AN-1 (Cam 2026-10-01): operational tabs carry NO KPI tiles, charts or intro cards — Tee Sheet keeps one header line ("Thu, Oct 1 · 8 booked · 3 checked in"); every metric lives on `/dashboard/analytics` (owner logins only), computed server-side in `src/lib/analytics.ts` (definitions at the top of that file). Never add a stat tile back to an operational tab; add the metric to Analytics. Charts there are plain HTML/CSS — no chart library. AN-2 (Cam 2026-10-08, "has to … be organized and look clean and make sense"): the page reads top to bottom — four plain-English numbers against the period before, "What to look at" (sentences built only from those numbers, never estimates), the monthly AI review, then the detail behind tabs (Money · Busy times · No-shows & cancellations · Golfers). Keep labels in plain words; a new metric goes in the tab it belongs to, not as another headline number. Past tee times cannot be deleted (unfilled slots are lost-revenue history).

`.staff-look` (`STAFF_LOOK_CLASS`, src/lib/staff-fonts.ts) still wraps /admin and /dashboard
but carries no styling — it is only a hook. Never re-add a second palette, font or radius
set there. Self-contained public pages that skip the Nav (/for-courses, setup sheet,
/call) use `<PlainHeader>` (src/components/PlainHeader.tsx) — logo top-left like `/`.

### Shared tokens (Tailwind v4, `globals.css` `@theme {}`)
- `paper` (#FAFAF7), `card` (#FFFFFF), `ink` (#141814), `ink-soft`, `ink-muted` (#6B706A), `ink-faint`, `line` (#E3E4DE), `line-soft`, `line-strong`
- `pine` (#173B2A) / `pine-hover` (#0F2C1F, darker); `ok` (#3D7A55), `bad` (#A3452F), `warn` (#9A5B13), `dot-neutral`
- `font-sans` (Libre Franklin), `font-serif` (EB Garamond — display)

### Staff-page type scale (§1b — sizes still apply; fonts are TYPE-1's since 2026-10-05)
- Page title: `font-serif text-[30px] leading-none` (existing 22px titles are acceptable until their reskin run lands)
- Section title: 15px/600 sans · body 13.5–14px · tables 13.5px
- TYPE-2 (Cam 2026-10-05, "the small sub headings above the main heading is such an ai thing"): NO small uppercase label above a heading — the heading says it. Real form labels and table headers stay, in sentence case. Sentences are full ink; `text-ink-muted` / `text-ink-faint` only on metadata (timestamps, "updated…", counts). Swept across every page 2026-10-05 (emails and the agreement PDF excepted) — design-guard ratchets `uppercase` and `<Eyebrow>` down; never add one
- Attention: a 3px **left** border in the semantic color on a white card — the only place borders carry color
- Operator nav (CLUB-3, Cam 2026-10-05): NO left rail on desktop — a top bar in the course's `brandColor` (`OperatorSidebar.tsx`, name kept): course name in the display face, the tabs, Course alert / Your page / Sign out on the right, active tab underlined in `fairway`, a 4px fairway rule beneath. "Soon" placeholders (Tournaments, Outings) stay off the bar. Below md the slim strip + bottom tab bar are unchanged. Every dashboard page wrapper is `flex flex-col` (never `md:flex-row`)
- Admin sidebar (FLOW-2): a light rail — white, 1px `line`, the lockup at the top; inactive `text-ink-soft`, active `bg-pine/[0.07] text-pine font-semibold`; count chips `rounded-md` (never 999px pills)

### Rules (every page)
- Status indicators: `<StatusDot status="ok|bad|warn|neutral" label="..."/>` — 5px dot, no pill badges
- Input class: `bg-paper border border-line rounded-md px-3 py-2.5 text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10`
- Primary button: `bg-pine hover:bg-pine-hover text-white font-medium rounded-md` (course accent via inline style on operator/golfer surfaces)
- Inline notices may use a `/5` wash with a `/20` border (`bg-bad/5 border-bad/20`) — the ban below is on tinted status *pills*, not on notice banners
- No emojis, and no decorative icons (TYPE-3, Cam 2026-10-05: "Lucide icons everywhere" is an AI tell). A lucide icon only where it does a job: icon-only buttons (with `aria-label`), `Loader2` spinners, close `X`, `Search` in a search field, `ExternalLink` on new-tab links, date-stepper and disclosure chevrons, star ratings, the operator mobile bottom nav. Never next to button text, in front of a heading or value, in an icon tile, or in an empty state (that's the golfer mark). Status is `<StatusDot>`, not a check/alert icon. design-guard ratchets each file's lucide imports down. Nav/Footer return null on `/admin/*` and `/dashboard/*`
- Reskin runs change **zero behavior** (UI_REVISE_SPEC §3); behavior lives in §4, one run each
- Marketing fee copy is FROZEN behind the LQ-2 placeholder — never restore it in a reskin
- Email template: ONE light template for all emails (operator + golfer) — white body, ink text, pine accents (`#1b4332`), sharp corners (`border-radius:4px`), zinc border. LOGO-1 (Cam 2026-09-30): the lockup sits TOP-LEFT of every email (`public/brand/email-logo-3x.png`, shown at 180px — rendered from the vector at 3x because email clients don't show SVG); the footer is text only, "GreenReserve · greenreserve.app".
- Logo (LOGO-1): the vector lockup `public/brand/logo.svg` (cream: `logo-cream.svg`) everywhere on the web, with `unoptimized` on next/image — never the old raster `logo-lockup*.png`. Homepage header (HOME-2): no nav logo — the hero's centred logo replaces it; Operator login + Book a demo top-right. Every other page keeps the logo top-left. Browser-tab icons (`src/app/icon.svg`, `icon.png`, `favicon.ico`) are JUST the golfer (Cam 2026-09-30: "it should just be this guy") — pine, and cream in dark mode via the SVG's media query; the home-screen icon (`apple-icon.png`, `public/apple-touch-icon.png`) is the pine golfer on paper, since iOS paints transparency black. The golfer mark alone is `public/brand/golfer.svg`.
- PERS-1 (Cam 2026-10-05): every course-owned golfer page (book, confirmation, check-in, manage) wears the course's OWN uploads through `<CourseHeaderBar photoUrl logoUrl>` — the hero photo becomes a short band, the logo sits beside the name. No per-page images, no page builder. The one extra knob is `Course.confirmationNote` (Settings → Your course), shown on the confirmation screen and in the confirmation email
- Birdie (BIRDIE_AI_SPEC B4a/B4b, Cam 2026-10-05): the dashboard assistant reads live data through `src/lib/birdie/tools.ts` and DRAFTS changes through `src/lib/birdie/proposals.ts` — a confirm card whose button calls the page's own route. Birdie never writes. A new Birdie action needs: a propose tool, its route in `PROPOSAL_ROUTES` (plus a `BODY_RULES` entry when the route does more than one thing), and a check in `scripts/birdie-isolation-test.ts`. ACT-2 (2026-10-07): Birdie also drafts tee-sheet changes — move a group, block/reopen a run of times, add a phone booking or walk-in, send a pay link; a card may carry several calls (`calls`), run in order. Money, refunds, cancelling (waits on Cam), the cancellation policy, Stripe and staff stay off it
- NO Birdie dog artwork anywhere (Cam 2026-09-30: "unprofessional — it should just be the little golfer logo"). 404, empty states, coming-soon pages and the assistant's avatar use the golfer mark, and copy never speaks as the character ("We couldn't find…", not "Birdie couldn't…"). The assistant keeps the NAME Birdie (a golf term).

### BANNED
- `font-black`, `tracking-widest` — use `font-medium`/`font-semibold`/`font-bold` and `tracking-[0.06em]`–`tracking-[0.1em]` for eyebrows
- Dark backgrounds (`bg-gray-950`, `bg-gray-900`) on admin/dashboard; gradients; drop shadows heavier than `0 1px 2px`. **Page-background gradients now have no exemption at all** (Cam 2026-09-16, H-2h): the four cream section hand-off dissolves on `/` are deleted, so `grep 'linear-gradient(.*#F6F4EC' src/app/home.module.css` must stay empty (match on the colour, not on `180deg` — two of the four deleted dissolves were `0deg`, so a `180deg` pattern would have passed with both still live). One exemption stands (Cam 2026-09-16, H-2h, reinstating H-2d-R1): the device mockups in `home.module.css` keep their poster shadows — `.laptopScreen` and `.phone` (HOME-2). Nowhere else, and never on a staff surface. The two exemptions traded places on the same day and the trade was deliberate: H-2g deleted every shadow, then Cam chose shadows over dissolves, so the history reads as a reversal because it was one. The ban was never about scrims: a gradient that darkens a photo so text sits on it (`.storyShade`, `.dHd::after`) or shapes a device mockup's own hardware (`.laptopBase`) is not a background gradient and was never in scope — an earlier wording said "the only allowed gradients" while three such rules were already live, which is the kind of false absolute that gets a real rule ignored
- Tinted colored pill badges — use `<StatusDot>` instead
- `emerald-600` as accent — use `pine` / `ok` tokens
- `rounded-xl/2xl/3xl` anywhere
- Cursor-tracking motion, bounce easing; anything that moves without `prefers-reduced-motion` respected

---

## Cron jobs (`src/app/api/cron/`)
Schedules are in `vercel.json`.
- `hourly` — the time-sensitive one: free-cancel warning ~1h before the cutoff, charges the hold fee the moment the window closes, check-in email ~3h before the round (no-fee courses), agreement PDF retries, call reminders
- `cancellation-cutoff` — daily SAFETY NET for the same charge/check-in email; `paymentStatus` is the dedup so it never double-charges
- `send-reminders` — pre-round reminders and membership pay links
- `generate-tee-times` — materialises slots from `TeeTimeSchedule`
- `chase-onboarding` — nudges courses stalled in onboarding
- `monthly-review` — BI-1 (PLATFORM_ROADMAP_SPEC §1): daily, writes each live course's AI review of its previous month once that month ends in the course's timezone (`src/lib/monthly-review.ts`). The numbers come from `computeAnalytics()`; the model only interprets them, and `validateNumbers()` rejects any draft carrying a number it wasn't given. First full live month = the baseline. Emails the owner; shown on Analytics → Monthly reviews

Every cron route is wrapped in `cronRoute(job, handler)` (`src/lib/cron-log.ts`, MP-8b), which writes one `CronRunLog` row per run; Admin → System reads it and goes red on a failed, unfinished or overdue run. A new cron must use the wrapper AND be added to `vercel.json`, or System cannot see it. Stripe webhook receipts land in the same table as job `webhook:stripe`.

---

## Known gotchas
1. **File write truncation** — large files written via tool sometimes truncate. Always validate line count and parse after writing. Use `printf` or heredoc for smaller files.
2. **Null bytes from sed** — avoid using `sed -i` with shell-quoted patterns on these files. Use Python `re.sub()` instead.
3. **JSX multi-line ternaries** — SWC/Babel chokes on `? [...]` starting a new line inside JSX. Pre-compute filtered arrays before the `return` instead.
4. **Missing closing divs** — JSX parse errors often cascade from a missing `</div>` much earlier in the file. Binary-search with `@babel/parser` to find the true root.
5. **Stripe webhook** — must be registered in Stripe dashboard pointing to `/api/stripe/webhook`
6. **Never fire-and-forget in a route** — Vercel freezes the function once the response is sent, so an un-awaited promise (an email, a log write) silently dies. Await it, or wrap it in `after()` from `next/server`. This is why inquiry emails stopped for two weeks in Sept 2026.
7. **Resend never throws** — the SDK returns `{ error }`. `getResend()` in `src/lib/email.ts` converts that into a throw; always send through it, never through a fresh `new Resend()`.
8. **Edits made through Bash bypass the parse hook** — the PostToolUse hook only fires on the Edit/Write tools. After a Python/heredoc edit, run `node scripts/parse-check.js <files>` yourself.

---

## Key people
- **Beast (Cam)** — founder/operator, `camsanchez33@icloud.com`
- Admin inbox: `thegreenreserve@outlook.com` — every alert, reply-to and visible contact address. `hello@greenreserve.app` is SEND-ONLY (the Resend `from`, which must be on the verified domain); it takes no mail, so never show it as a contact or send alerts to it (Cam 2026-09-29).

## Preferences
- Concise, direct responses — no unnecessary explanation
- Challenge ideas when needed — don't just agree
- No bullet-point lists for conversational responses
- No emojis unless asked
