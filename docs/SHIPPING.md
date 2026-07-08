# Shipping to Production

A safe, reproducible checklist for deploying GreenReserve changes.

---

## Small changes (no schema change)

1. Code review complete
2. `git push` to `main` — Vercel auto-deploys within ~2 min
3. Check Vercel dashboard for successful build
4. Spot-check affected feature on https://greenreserve.app

That's it. No extra steps needed.

---

## Schema changes or risky features

Any Prisma schema change (new model, new field, index) or feature that touches
the booking/payment flow needs the branch workflow:

### 1. Branch + preview deploy

```bash
git checkout -b feat/my-change
# make your changes
git push origin feat/my-change
```

Vercel auto-creates a preview deployment at a URL like
`green-reserve-git-feat-my-change-camsanchez33.vercel.app`.

### 2. Create a Neon branch

1. Neon console → your project → **Branches** → **New Branch**
2. Name: `preview-my-change`
3. Branch from: **main** (production data snapshot)
4. Copy the branch's `DATABASE_URL` and `DIRECT_URL` connection strings

### 3. Point preview deployment at the branch DB

1. Vercel dashboard → Deployments → find the `feat/my-change` preview
2. Click the three-dot menu → **Edit environment variables**
3. Override `DATABASE_URL` and `DIRECT_URL` with the Neon branch connection strings
4. Redeploy

### 4. Run migration against branch

```bash
# From your local machine with the branch DATABASE_URL:
DIRECT_URL="postgresql://..." npx prisma migrate deploy
# or for non-destructive schema sync:
DIRECT_URL="postgresql://..." npx prisma db push
```

### 5. Verify on preview URL

Hit the preview deployment, test the feature end-to-end. Check Vercel logs for errors.

### 6. Merge to main

Once verified: open a PR and merge to main. The migration will run automatically
because Vercel runs the build command (`next build`) which triggers `prisma generate`,
and the deploy hook can be configured to run `prisma migrate deploy`.

> **If you forgot to set up auto-migration:** run `npx prisma migrate deploy` manually
> against production DIRECT_URL immediately after the Vercel deploy completes.

### 7. Clean up the Neon branch

Neon console → Branches → `preview-my-change` → Delete.

---

## Rollbacks

### Code rollback (fast, one click)

Vercel dashboard → **Deployments** → click the prior successful deployment →
**"Promote to Production"**. Takes ~30 seconds, no downtime.

### Data rollback

See `docs/RESTORE.md` for both Neon PITR and pg_dump artifact restore procedures.

---

## Forbidden on production

- `prisma migrate reset` — drops all tables and data
- `prisma db push --accept-data-loss` — silently deletes columns/rows
- `DROP TABLE` without a Neon snapshot first
- Any direct psql writes without a backup step

---

## Environment variables

All secrets live in Vercel (production + preview scopes). Recover them via:
- Vercel dashboard → Project → Settings → Environment Variables
- Or `vercel env pull .env.local` (requires Vercel CLI)

See `docs/RUNBOOK.md` for the full secrets inventory.
