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
- Courses with no cancellation fee policy skip card collection entirely (no-card flow)
- Cancellation-window hold: the moment a booking's cancellation cutoff passes, the `hourly` cron charges the fee (the daily `cancellation-cutoff` is a safety net) to the saved card for EVERY still-confirmed booking at a fee-policy course. It is a hold, not a no-show penalty — it is refunded at check-in. No-fee courses get a check-in reminder email instead.
- Cancelling after the window keeps that fee (non-refundable)

### Booking status flow
```
confirmed → (check-in) → completed
confirmed → (cancel before window) → cancelled (no charge)
confirmed → (cancel after window) → cancelled (fee charged, non-refundable)
confirmed → (cutoff passes, hourly cron) → hold fee charged, still confirmed; refunded at check-in
confirmed → (staff marks no-show) → noShowAt set, still confirmed (reversible: "still coming")
confirmed → (staff "paid offline") → completed, paymentStatus paid_offline, no Stripe charge
```

### Check-in
- Staff check-in: tee sheet on `/dashboard` → `PATCH /api/operator/bookings` with `action: 'checkin'`
- Golfer self check-in: `/checkin/[bookingId]?token=...` → `/api/checkin/[bookingId]` (token-gated, emailed in confirmation)
- Both call shared `performCheckIn()` in `src/lib/checkin-booking.ts`
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

### Doc-file commit rule
After every run, `git status` — if dirty:
- **Doc files** (`RUN_QUEUE.md`, `*_SPEC.md`, `CLAUDE.md`, everything under `.claude/`, `scripts/*.mjs`, everything under `legal/`): COMMIT with message `"queue/spec update"` — never discard; Cowork edits them between runs.
- **Non-doc files**: never auto-discard. If they belong to the run, commit them with it; if you cannot tell whose they are, stop and ask Cam. (Changed 2026-09-29 — this used to be `git checkout -- .`, which silently destroyed any uncommitted code.)

First action of every run: commit any dirty doc files BEFORE reading the queue.

## Environment variables

All required in Vercel; the full list is in `docs/SHIPPING.md`, the secrets inventory in `docs/RUNBOOK.md`. Never paste values into chat, specs or the queue.

---

## Design system — two looks, split by audience (UI_REVISE_SPEC, Sept 2026)

Source of truth for anything visual: `UI_REVISE_SPEC.md` §1 (tokens) and §0 (decisions).
Clubhouse *structure* (white cards on paper, StatusDot, no pills, no dark mode) holds
everywhere; the type, corners and palette depend on **who the page is for**.

| | PUBLIC look | STAFF look |
|---|---|---|
| Where | `/`, `/for-courses`, legal pages, every golfer-facing page (`/courses/[slug]`, `/book`, `/checkin`, `/manage`, `/receipt`, member portal) | `/dashboard/*` and `/admin/*` |
| Fonts | Fraunces display · Inter body (root layout, `--font-serif` / `--font-sans`) | Newsreader display · Source Sans 3 body (`src/lib/staff-fonts.ts`) |
| Corners | 8px buttons/inputs (`rounded-md`), 14px cards (`rounded-lg`), pills 999px | **0 everywhere.** `rounded-full` only for avatars, dots, swatches |
| Paper / ink / line | #F6F4EC / #1C1C18 / #E6E3D7 | #F7F5EF / #1D1F1A / #E3E0D5 |
| Accent | pine (marketing) · per-course `Course.brandColor` (golfer pages) | course accent (operator) · pine (admin) |

**How the switch works (U-0):** the `/admin` and `/dashboard` route layouts wrap their
children in `.staff-look` (`STAFF_LOOK_CLASS` from `src/lib/staff-fonts.ts`). That class,
in `globals.css`, re-points Tailwind's theme variables — `--radius-*` to 0, `--font-serif` /
`--font-sans` to the staff fonts, the paper/ink/line tokens to the staff palette. Because
Tailwind v4 utilities resolve through those variables, **write staff pages with the same
classes as always** (`rounded-md`, `rounded-lg`, `font-serif`, `bg-paper`, `text-ink`); they
render square and in Newsreader/Source Sans 3 inside the wrapper and rounded/Fraunces/Inter
outside it. Do not hardcode radii or font-families to force either look.

### Shared tokens (Tailwind v4, `globals.css` `@theme {}`)
- `paper`, `card` (#FFFFFF), `ink`, `ink-soft`, `ink-muted`, `ink-faint` (#98968B), `line`, `line-soft`, `line-strong` (#D9D6C8)
- `pine` (#24513B) / `pine-hover` (#2E6349); `ok` (#3D6B4C), `bad` (#A3452F), `warn` (#8A6116), `dot-neutral` (#B3B1A6)
- `font-sans`, `font-serif` — resolve per look, see above

### Staff-look type scale (§1b)
- Page title: `font-serif text-[30px] leading-none` (existing 22px titles are acceptable until their reskin run lands)
- Section title: 15px/600 sans · Eyebrow: `text-[11px] uppercase tracking-[0.1em] text-ink-muted` · body 13.5–14px · tables 13.5px
- Attention: a 3px **left** border in the semantic color on a white card — the only place borders carry color
- Operator sidebar: white, 1px `line`; course crest + serif name + 10.5px uppercase meta; active item = accent text, 3px left border, paper bg
- Admin sidebar: `bg-pine`; wordmark serif 17px `paper`; inactive `#A9BFAF`, active `bg-white/10 text-paper`

### Rules (both looks)
- Status indicators: `<StatusDot status="ok|bad|warn|neutral" label="..."/>` — 5px dot, no pill badges
- Input class: `bg-paper border border-line rounded-md px-3 py-2.5 text-ink placeholder-ink-faint focus:border-pine/40 focus:ring-2 focus:ring-pine/10`
- Primary button: `bg-pine hover:bg-pine-hover text-white font-medium rounded-md` (course accent via inline style on operator/golfer surfaces)
- Inline notices may use a `/5` wash with a `/20` border (`bg-bad/5 border-bad/20`) — the ban below is on tinted status *pills*, not on notice banners
- No emojis — lucide-react icons. Nav/Footer return null on `/admin/*` and `/dashboard/*`
- Reskin runs change **zero behavior** (UI_REVISE_SPEC §3); behavior lives in §4, one run each
- Marketing fee copy is FROZEN behind the LQ-2 placeholder — never restore it in a reskin
- Email template: ONE light template for all emails (operator + golfer) — white body, ink text, pine accents (`#1b4332`), sharp corners (`border-radius:4px`), zinc border. LOGO-1 (Cam 2026-09-30): the lockup sits TOP-LEFT of every email (`public/brand/email-logo-3x.png`, shown at 180px — rendered from the vector at 3x because email clients don't show SVG); the footer is text only, "GreenReserve · greenreserve.app".
- Logo (LOGO-1): the vector lockup `public/brand/logo.svg` (cream: `logo-cream.svg`) everywhere on the web, with `unoptimized` on next/image — never the old raster `logo-lockup*.png`. Homepage header: logo pinned to the window's top-left corner (edge padding, not the content column), Operator login top-right. Browser-tab/app icons (`src/app/icon.svg`, `icon.png`, `apple-icon.png`, `favicon.ico`) are the paper golfer on a pine square. The golfer mark alone is `public/brand/golfer.svg`.
- NO Birdie dog artwork anywhere (Cam 2026-09-30: "unprofessional — it should just be the little golfer logo"). 404, empty states, coming-soon pages and the assistant's avatar use the golfer mark, and copy never speaks as the character ("We couldn't find…", not "Birdie couldn't…"). The assistant keeps the NAME Birdie (a golf term).

### BANNED
- `font-black`, `tracking-widest` — use `font-medium`/`font-semibold` and `tracking-[0.06em]` (public) / `tracking-[0.1em]` (staff eyebrows)
- Dark backgrounds (`bg-gray-950`, `bg-gray-900`) on admin/dashboard; gradients; drop shadows heavier than `0 1px 2px`. **Page-background gradients now have no exemption at all** (Cam 2026-09-16, H-2h): the four cream section hand-off dissolves on `/` are deleted, so `grep 'linear-gradient(.*#F6F4EC' src/app/home.module.css` must stay empty (match on the colour, not on `180deg` — two of the four deleted dissolves were `0deg`, so a `180deg` pattern would have passed with both still live). One exemption stands (Cam 2026-09-16, H-2h, reinstating H-2d-R1): the device mockups and cards in `home.module.css` keep their poster shadows — `.device`, `.heroDevice .device`, `.heroSheet`, `.laptopScreen`, `.btn:hover`, `.card:hover`. Nowhere else, and never on a staff surface. The two exemptions traded places on the same day and the trade was deliberate: H-2g deleted every shadow, then Cam chose shadows over dissolves, so the history reads as a reversal because it was one. The ban was never about scrims: a gradient that darkens a photo so text sits on it (`.storyShade`, `.dHd::after`) or shapes a device mockup's own hardware (`.laptopBase`) is not a background gradient and was never in scope — an earlier wording said "the only allowed gradients" while three such rules were already live, which is the kind of false absolute that gets a real rule ignored
- Tinted colored pill badges — use `<StatusDot>` instead
- `emerald-600` as accent — use `pine` / `ok` tokens
- `rounded-xl/2xl/3xl` anywhere; any rounded corner on a staff surface that isn't an avatar/dot/swatch
- Cursor-tracking motion, bounce easing; anything that moves without `prefers-reduced-motion` respected

---

## Cron jobs (`src/app/api/cron/`)
Schedules are in `vercel.json`.
- `hourly` — the time-sensitive one: free-cancel warning ~1h before the cutoff, charges the hold fee the moment the window closes, check-in email ~3h before the round (no-fee courses), agreement PDF retries, call reminders
- `cancellation-cutoff` — daily SAFETY NET for the same charge/check-in email; `paymentStatus` is the dedup so it never double-charges
- `send-reminders` — pre-round reminders and membership pay links
- `generate-tee-times` — materialises slots from `TeeTimeSchedule`
- `chase-onboarding` — nudges courses stalled in onboarding

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
