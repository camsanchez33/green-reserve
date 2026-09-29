# Shipping to production

Authoritative deploy, migration, rollback, performance-budget and environment
reference for GreenReserve. Moved here from `CLAUDE.md` on 2026-09-11 so every
Claude Code agent stops loading it on start; `CLAUDE.md` keeps only the rules that
never bend. **This file replaced an older SHIPPING.md that predated the migration
rule and still allowed `prisma db push` — that advice is gone on purpose.**

---

## Deploy and migration checklist

> **MIGRATION RULE (reversal from db-push era):** The project now uses real Prisma
> migrations. Schema changes go through `migrate dev` → commit migration file →
> `migrate deploy` on prod. `db push` is banned except on throwaway sandbox DBs.

**Small changes (no schema change):** push to main is fine — Vercel auto-deploys.

**Schema changes — checklist (every time, no exceptions):**
1. Create a feature branch: `git checkout -b feat/my-change`
2. Point your local `.env` at a Neon branch DB (not prod):
   - Neon console → Branches → "Create branch" from production
   - Set `DATABASE_URL` + `DIRECT_URL` in `.env` to point to the branch
   - Set `SHADOW_DATABASE_URL` to a second Neon branch (needed by `migrate dev`)
3. Generate the migration: `npx prisma migrate dev --name <descriptive-name>`
   - This creates `prisma/migrations/<timestamp>_<name>/migration.sql` — commit it
4. Verify locally (Cam 2026-09-29: no Vercel preview step): apply every migration
   from scratch to a local Postgres with `npx prisma migrate deploy`, run the app
   against it, and walk the feature end to end.
5. Additive only: new tables, nullable columns, or columns with a default. No drops,
   renames or type changes.
6. A migration that rewrites or backfills existing rows: also `migrate deploy` it on
   the Neon branch from step 2 (a copy of prod data) and check the rows, and get
   Cam's approval before merging.
7. Push the branch; `.github/workflows/schema-check.yml` must pass.
8. Merge PR to main → Vercel build command is:
   `prisma generate && node scripts/migrate-prod.js && next build`
   `scripts/migrate-prod.js` runs `prisma migrate deploy` **only when
   `VERCEL_ENV === 'production'`** and exits non-zero (fails the build) if
   it errors. Preview builds skip it entirely — safe even if they share
   `DATABASE_URL` with prod.
9. Post-deploy: confirm `/api/health` returns 200 (DB query succeeds)
10. Run `npx prisma migrate status` — must show "Database schema is up to date"

**Never on prod:**
- `prisma migrate reset` — destructive
- `prisma db push` — bypasses migration history, causes drift
- `prisma db push --accept-data-loss` — destructive
- Direct `psql` writes without a backup step

**Required env vars for local migration work (add to .env, NOT committed):**
```
SHADOW_DATABASE_URL=postgresql://...   # a second Neon branch, prisma migrate dev needs it
```
Cam: create a permanent "shadow" branch in Neon named `shadow-dev` and keep its URL
in `.env.local` only.

**Rollback:**
- Code: Vercel dashboard → Deployments → click prior deploy → "Promote to Production"
- Schema: Neon PITR (see docs/RESTORE.md) — point-in-time recovery in the console;
  or write a compensating migration (`migrate dev --name revert-x`)

**Vercel preview env status:** Vercel auto-creates preview deployments for every branch.
Preview deployments share the production `DATABASE_URL` by default. This is safe
because `scripts/migrate-prod.js` only runs migrations when `VERCEL_ENV === 'production'`
— previews skip it automatically. No manual override needed just to prevent accidental
migration; still override if you need the preview to point at a branch DB for testing.

---

## Schema change mini-checklist (post Section A)
Every schema change must pass ALL of these before merging to main:
1. `prisma migrate dev --name <x>` generated a migration file (committed)
2. `npx prisma migrate status` shows "Database schema is up to date!" (no drift)
3. `/api/health` returns `{"ok":true,"db":"up"}` after deploy
4. `.github/workflows/schema-check.yml` is green on the PR

GitHub secret `SHADOW_DATABASE_URL` must be set in the repo for the CI check to work.

---

## Performance budgets (golfer-facing pages)

Enforced by `.github/workflows/perf-audit.yml` on every PR. Run locally:
```bash
AUDIT_BASE_URL=https://greenreserve.app node --experimental-strip-types scripts/perf-audit.ts   # Node 22+; NOT tsx (crashes: __name is not defined)
```

| Metric | Budget |
|--------|--------|
| Lighthouse Performance score | ≥ 85 |
| LCP (Largest Contentful Paint) | ≤ 2.5 s |
| TBT (Total Blocking Time) | ≤ 300 ms |
| CLS (Cumulative Layout Shift) | ≤ 0.10 |

Pages audited: `/`, `/for-courses`, `/courses/[slug]`, `/book` (shell).
Mobile emulation + simulated slow-4G throttling. Chromium required.
Each page runs 3 times and is judged on the MEDIAN of each metric (Cam 2026-09-29,
PERF-4 — single runs swung Home's TBT 443–1798ms on identical code); `AUDIT_RUNS=1`
for a quick local look. A failing page prints its main-thread breakdown, top
scripts and long tasks.

Key rules to keep budgets green:
- No heavy client-side animation libraries (framer-motion removed — use CSS transitions)
- `<img>` tags must have `loading="lazy"` unless above the fold
- Stripe JS deferred until a card is actually needed (`getStripePromise()` pattern in book/page.tsx)
- New `'use client'` components on golfer pages need a bundle-size justification

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
CALCOM_BOOKING_URL            # CAL-1/2: the Cal.com event link courses book on (/call/[token] embeds it). Unset = the page asks them to reply with times. Admin → System shows what the site sees
CALCOM_WEBHOOK_SECRET         # CAL-1: signs Cal.com → /api/calcom/webhook (booking created/rescheduled/cancelled)
ANTHROPIC_API_KEY             # BIRDIE B1: the assistant's key (costs money; caps in lib/birdie/guardrails.ts)
BIRDIE_ENABLED                # BIRDIE B1: 'true' switches the assistant on; anything else is off
BLOB_READ_WRITE_TOKEN         # PUBLIC Blob store (photos, sheet uploads). Connect with the read-write token box ticked
BLOB_PRIVATE_READ_WRITE_TOKEN # PRIVATE Blob store (contracts + signed agreement PDFs, lib/private-blob.ts). Prefix BLOB_PRIVATE, token box ticked
```


Recover them via the Vercel dashboard → Project → Settings → Environment Variables, or
`vercel env pull .env.local`. Full secrets inventory (names and locations, never values):
`docs/RUNBOOK.md`.

---

## Troubleshooting

### Git index issue (sandbox-specific)
The git index in this repo sometimes gets corrupted in sandboxed environments. Workaround:
```bash
GIT_DIR=/tmp/git-work GIT_WORK_TREE=$(pwd) git add ...
GIT_DIR=/tmp/git-work GIT_WORK_TREE=$(pwd) git commit -m "..."
```

