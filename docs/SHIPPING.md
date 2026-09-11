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
4. Push branch — Vercel auto-creates a preview deployment
5. In Vercel dashboard → the preview deployment → Settings → Environment Variables:
   override `DATABASE_URL` + `DIRECT_URL` to point to the Neon branch
6. `npx prisma migrate deploy` applies the migration to the Neon branch
7. Verify the feature on the preview URL
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
AUDIT_BASE_URL=https://greenreserve.app npx tsx scripts/perf-audit.ts
```

| Metric | Budget |
|--------|--------|
| Lighthouse Performance score | ≥ 85 |
| LCP (Largest Contentful Paint) | ≤ 2.5 s |
| TBT (Total Blocking Time) | ≤ 300 ms |
| CLS (Cumulative Layout Shift) | ≤ 0.10 |

Pages audited: `/`, `/for-courses`, `/courses/[slug]`, `/book` (shell).
Mobile emulation + simulated slow-4G throttling. Chromium required.

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

