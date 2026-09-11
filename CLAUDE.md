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
- Late cancellation fee: if golfer cancels after the window, the saved card is charged automatically by cron — this fee is refunded at check-in

### Booking status flow
```
confirmed → (check-in) → completed
confirmed → (cancel before window) → cancelled (no charge)
confirmed → (cancel after window) → cancelled (fee charged, non-refundable)
confirmed → (no-show, cron fires) → fee charged, booking still confirmed until check-in
```

### Check-in
- Staff check-in: `/dashboard` button → `POST /api/checkin/[bookingId]`
- Golfer self check-in: `/checkin/[bookingId]?token=...` (token-gated, emailed in confirmation)
- Both paths call shared `performCheckIn()` in `src/lib/checkin-booking.ts`

### Operator onboarding pipeline
Inquiry → `pending` → `in_review` → `details_requested` → `details_submitted` → `building` → `live`
Admin page manages all stages. Operators get dashboard access when approved.

---

## Tech stack details

```
src/app/                  Next.js App Router pages
src/app/api/             API routes
src/app/admin/           Internal admin console (light — Clubhouse)
src/app/dashboard/       Operator dashboard (light — Clubhouse)
src/app/book/            Golfer booking flow
src/app/account/         Golfer account + booking history
src/app/checkin/         Golfer self check-in page
src/app/for-courses/     Lead-gen interest form
src/app/courses/         Course listing/search
src/components/          Nav, Footer, CourseCard, OperatorSidebar
src/lib/
  email.ts               All Resend email functions (baseTemplate + per-event fns)
  stripe.ts              Stripe helpers (direct charge, refund, setup intent)
  checkin-booking.ts     Shared performCheckIn() logic
  cancel-booking.ts      Shared cancellation logic
  booking-status.ts      Status label/badge helpers
  tee-sheet-engine.ts    Tee time generation engine
  tee-time-utils.ts      Timezone-aware tee time utilities
  session.ts             JWT session management (jose)
  auth.ts                Auth helpers
  prisma.ts              Prisma client singleton
prisma/schema.prisma     Database schema
```

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
- Schema changes are run attended, on a feature branch, against a Neon branch DB, verified on the Vercel preview, and must pass `.github/workflows/schema-check.yml`. Never `migrate reset`, `db push`, or direct `psql` writes on prod.
- Vercel's production build runs `scripts/migrate-prod.js` (`migrate deploy` only when `VERCEL_ENV === 'production'`); previews skip it, so previews sharing the prod `DATABASE_URL` is safe.
- After any schema deploy: `/api/health` returns `{"ok":true,"db":"up"}` and `npx prisma migrate status` reports up to date.

### Performance budgets (golfer-facing pages)

Enforced by `.github/workflows/perf-audit.yml` on every PR (budgets, audited pages and the local command are in `docs/SHIPPING.md`). Rules that keep it green:
- No heavy client-side animation libraries (framer-motion removed — use CSS transitions)
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
Re-run `scripts/route-inventory.ts` after adding routes to keep ARCHITECTURE.md current.

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
- **Non-doc files**: `git checkout -- .` to discard.

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
- Email template: ONE light template for all emails (operator + golfer) — white body, ink text, pine accents (`#1b4332`), sharp corners (`border-radius:4px`), zinc border. No logo in the header — content starts straight at the top of the card. Footer: the standalone golfer mark (`public/brand/golfer.png`, ~56px tall) centered above "Green Reserve · greenreserve.app" — no lockup, no Birdie (Birdie is web-only: 404, coming-soon, empty states).

### BANNED
- `font-black`, `tracking-widest` — use `font-medium`/`font-semibold` and `tracking-[0.06em]` (public) / `tracking-[0.1em]` (staff eyebrows)
- Dark backgrounds (`bg-gray-950`, `bg-gray-900`) on admin/dashboard; gradients; drop shadows heavier than `0 1px 2px`
- Tinted colored pill badges — use `<StatusDot>` instead
- `emerald-600` as accent — use `pine` / `ok` tokens
- `rounded-xl/2xl/3xl` anywhere; any rounded corner on a staff surface that isn't an avatar/dot/swatch
- Cursor-tracking motion, bounce easing; anything that moves without `prefers-reduced-motion` respected

---

## Cron jobs (`src/app/api/cron/`)
- `charge-cancellation-fee` — fires at the cancellation cutoff, charges late cancellations, also sends check-in reminder for no-fee courses
- Triggered by Vercel cron (configured in `vercel.json`)

---

## Known gotchas
1. **File write truncation** — large files written via tool sometimes truncate. Always validate line count and parse after writing. Use `printf` or heredoc for smaller files.
2. **Null bytes from sed** — avoid using `sed -i` with shell-quoted patterns on these files. Use Python `re.sub()` instead.
3. **JSX multi-line ternaries** — SWC/Babel chokes on `? [...]` starting a new line inside JSX. Pre-compute filtered arrays before the `return` instead.
4. **Missing closing divs** — JSX parse errors often cascade from a missing `</div>` much earlier in the file. Binary-search with `@babel/parser` to find the true root.
5. **Stripe webhook** — must be registered in Stripe dashboard pointing to `/api/stripe/webhook`

---

## Key people
- **Beast (Cam)** — founder/operator, `camsanchez33@icloud.com`
- Admin email: `hello@greenreserve.app`

## Preferences
- Concise, direct responses — no unnecessary explanation
- Challenge ideas when needed — don't just agree
- No bullet-point lists for conversational responses
- No emojis unless asked
