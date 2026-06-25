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
src/app/admin/           Internal admin console (dark theme)
src/app/dashboard/       Operator dashboard (dark theme)
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
```bash
# Check for parse errors (mirrors what SWC does)
npm install @babel/parser   # one-time
node -e "
const {parse}=require('@babel/parser');
const fs=require('fs');
const src=fs.readFileSync('src/app/admin/page.tsx','utf8');
try{parse(src,{sourceType:'module',plugins:['typescript','jsx']});console.log('OK')}
catch(e){console.log('FAIL line:'+e.loc?.line+' '+e.message)}
"
```

### Deploy
```bash
git add -A && git commit -m "..." && git push
# Vercel auto-deploys from main, or:
npx vercel --prod
```

### Git index issue (sandbox-specific)
The git index in this repo sometimes gets corrupted in sandboxed environments. Workaround:
```bash
GIT_DIR=/tmp/git-work GIT_WORK_TREE=$(pwd) git add ...
GIT_DIR=/tmp/git-work GIT_WORK_TREE=$(pwd) git commit -m "..."
```

---

## Environment variables (all required in Vercel)
```
DATABASE_URL
DIRECT_URL
NEXTAUTH_SECRET / JWT_SECRET
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
NEXT_PUBLIC_URL=https://greenreserve.app
ADMIN_TOKEN
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
```

---

## Design system (as of June 2026 redesign)

**Golfer-facing pages:** light mode, white/gray-50 backgrounds
**Operator dashboard + admin:** dark mode (`bg-gray-950`, `bg-gray-900`)

### Rules
- Max border-radius: `rounded-md` (6px) for buttons/inputs, `rounded-lg` (8px) for cards. Never `rounded-xl/2xl/3xl` on content.
- No emojis in UI — use lucide-react icons
- Nav/Footer: `bg-black`, `border-white/10`
- Primary accent: `emerald-600` (hover: `emerald-500`)
- Headings: `font-black tracking-tight`
- Labels/eyebrows: `text-xs font-bold uppercase tracking-widest`
- Email template: sharp corners (`border-radius:4px`), black header bar, zinc border

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
