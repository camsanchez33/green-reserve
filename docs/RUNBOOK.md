# GreenReserve Operations Runbook

Everything needed to keep GreenReserve running if Cam is unavailable or loses his laptop.
This document contains NO secret values — only where to find them.

---

## Secrets Inventory

| Secret name | Lives in | Purpose | Regenerate at |
|-------------|----------|---------|---------------|
| `DATABASE_URL` | Vercel env (prod + preview) | Neon pooled connection | Neon console → Project → Connection Details |
| `DIRECT_URL` | Vercel env (prod + preview) | Neon direct connection (for migrations) | Same as above |
| `JWT_SECRET` | Vercel env (prod) | Signs all session JWTs (operators, golfers, members, admin) | Generate locally: `openssl rand -hex 32` |
| `NEXTAUTH_SECRET` | Vercel env (prod) | Same as JWT_SECRET (legacy alias) | Same |
| `STRIPE_SECRET_KEY` | Vercel env (prod) | Stripe API — charges, payouts, Connect | Stripe dashboard → Developers → API keys |
| `STRIPE_PUBLISHABLE_KEY` | Vercel env (prod) | Stripe client-side (public, safe to expose) | Same as above |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Vercel env (prod) | Same as above (NEXT_PUBLIC_ prefix for client bundle) | Same |
| `STRIPE_WEBHOOK_SECRET` | Vercel env (prod) | Validates Stripe webhook payloads | Stripe dashboard → Developers → Webhooks → signing secret |
| `RESEND_API_KEY` | Vercel env (prod) | Transactional email (Resend) | resend.com → API Keys |
| `NEXT_PUBLIC_URL` | Vercel env (prod) | App base URL (`https://greenreserve.app`) | Update if domain changes |
| `ADMIN_TOKEN` | Vercel env (prod) | Bootstrap admin account creation | Generate: `openssl rand -hex 32` |
| `TWILIO_ACCOUNT_SID` | Vercel env (prod) | Twilio (2FA SMS) | twilio.com → Console |
| `TWILIO_AUTH_TOKEN` | Vercel env (prod) | Twilio API token | Same |
| `TWILIO_FROM_NUMBER` | Vercel env (prod) | SMS from-number | Same |
| `CRON_SECRET` | Vercel env (prod) | Authenticates Vercel cron requests to /api/cron/* | Generate: `openssl rand -hex 32` |
| `BACKUP_DATABASE_URL` | GitHub Actions secret | Neon direct URL for pg_dump backup | Neon console (use DIRECT_URL value) |
| `BACKUP_PASSPHRASE` | Password manager | Encrypts pg_dump artifacts | Your choice — store in password manager |

---

## Where each secret is set

- **Vercel:** dashboard.vercel.com → `green-reserve` project → Settings → Environment Variables
  or via CLI: `vercel env ls` / `vercel env pull .env.local`
- **GitHub Actions:** github.com/camsanchez33/green-reserve → Settings → Secrets and variables → Actions

---

## Laptop Lost Recovery

1. Get a new machine and install Node.js 20+ and Git
2. Clone the repo: `git clone https://github.com/camsanchez33/green-reserve.git`
3. Install Vercel CLI: `npm i -g vercel`
4. Log in: `vercel login`
5. Pull env vars: `vercel env pull .env.local` (or copy from Vercel dashboard)
6. `npm install` then `npm run dev` — the app runs locally
7. All run queue state is in `RUN_QUEUE.md` and spec files in the repo — nothing is lost

No data is on the laptop. The database is on Neon (cloud). Backups are GitHub Actions artifacts.

---

## Secret Rotation (one line per provider)

- **JWT_SECRET / NEXTAUTH_SECRET:** Generate `openssl rand -hex 32` → update in Vercel → all active sessions are immediately invalidated (users must log in again).
- **STRIPE_SECRET_KEY:** Stripe dashboard → Developers → API keys → Roll secret key → update Vercel.
- **STRIPE_WEBHOOK_SECRET:** Stripe dashboard → Webhooks → click endpoint → Reveal/rotate signing secret → update Vercel.
- **RESEND_API_KEY:** resend.com → API Keys → Delete old → Create new → update Vercel.
- **DATABASE_URL / DIRECT_URL:** Neon console → Project → Reset connection password → update Vercel.
- **TWILIO_AUTH_TOKEN:** twilio.com → Console → Account Security → Auth Tokens → Secondary → Promote → update Vercel.
- **ADMIN_TOKEN:** Generate new token → update Vercel → old bootstrap endpoint no longer works.
- **BACKUP_PASSPHRASE:** Generate new passphrase → update GitHub Actions secret → old encrypted backups are still decryptable with the old passphrase (keep the old one in password manager until old artifacts expire in 90 days).

After any Vercel env change: trigger a new Vercel deployment to pick up the new value.

---

## Queue and Spec Files

`RUN_QUEUE.md`, `HARDENING_SPEC.md`, `BACKUP_OPS_SPEC.md`, `ONBOARDING_SPEC.md`,
`DESIGN_SYSTEM_SPEC.md`, `PUBLIC_SITE_SPEC.md` — all checked into the repo.

The doc-commit rule (see `RUN_QUEUE.md` header and `CLAUDE.md`) ensures they are
committed after every Claude Code run. They are backed up with every `git push`.

---

## On-Call Quick Checks

| Symptom | First check |
|---------|-------------|
| Bookings failing | Vercel logs → /api/bookings; Stripe dashboard for card errors |
| Emails not sending | Resend dashboard → Logs |
| 2FA SMS not arriving | Twilio console → Monitor → Logs |
| Stripe Connect issues | Stripe dashboard → Connected accounts |
| Database errors | Neon console → Metrics / Query inspector |
| Backup not running | GitHub Actions → Nightly Database Backup → check run status |
| Cron not firing | Vercel dashboard → Logs → filter by /api/cron |
