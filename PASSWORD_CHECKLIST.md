# Password & Token Checklist — do in this order

No secret values in this file. Every password you copy goes into KeePassXC and
NOWHERE else — never into chat, never into a text file.

**KeePassXC entry format (same every time):**
Open KeePassXC → unlock → **+** button → fill Title / Username / Password / URL → OK → Ctrl+S.

**Generate a random token (used in several steps below):**
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## PHASE 1 — Save the logins you already have (10 min, no changes, zero risk)

Just put your existing passwords into KeePassXC so they exist somewhere safe.

- [ ] **Neon** — Title: `Neon console` — URL: https://console.neon.tech — your login email + password
- [ ] **Vercel** — Title: `Vercel` — URL: https://vercel.com
- [ ] **GitHub** — Title: `GitHub` — URL: https://github.com
- [ ] **Stripe** — Title: `Stripe` — URL: https://dashboard.stripe.com
- [ ] **Resend** — Title: `Resend` — URL: https://resend.com
- [ ] **Twilio** — Title: `Twilio` — URL: https://console.twilio.com
- [ ] **Sentry** — Title: `Sentry` — URL: https://greenreserve.sentry.io
- [ ] **Master password** — written on paper, stored at home. NOT in a file.

---

## PHASE 2 — Neon database password (the important one)

- [ ] 2.1 Neon console → project → **Branches** → **production** → **Roles & Databases**
      → `neondb_owner` → **Reset password**. Copy it.
- [ ] 2.2 KeePassXC entry — Title: `Neon neondb_owner (production)`, Username: `neondb_owner`,
      Password: (paste), URL: https://console.neon.tech
- [ ] 2.3 Still in Neon: click **Connect** on the production branch. Copy TWO strings:
      - pooling ON  → this is your new **DATABASE_URL** (hostname contains `-pooler`)
      - pooling OFF → this is your new **DIRECT_URL**
      Paste both into the Notes field of the KeePassXC entry you just made.
- [ ] 2.4 Update Vercel (paste when prompted; DATABASE_URL = pooled one,
      add `&pgbouncer=true&connect_timeout=15` to the end of it):
      ```
      vercel env rm DATABASE_URL production
      vercel env add DATABASE_URL production
      vercel env rm DIRECT_URL production
      vercel env add DIRECT_URL production
      ```
- [ ] 2.5 Update GitHub backup secret: repo → Settings → Secrets and variables → Actions.
      Whichever exists there — `DATABASE_URL` or `BACKUP_DATABASE_URL` — click it →
      Update → paste the **DIRECT** url (pooling OFF one).
- [ ] 2.6 Update local file: open `.env` in gr-app, replace DATABASE_URL and DIRECT_URL
      with the two new strings (keep `&pgbouncer=true&connect_timeout=15` on DATABASE_URL).

## PHASE 3 — Shadow database (for migrations; old one is burned + was wrong anyway)

- [ ] 3.1 Neon → Branches → **shadow-dev** → Roles & Databases → `neondb_owner` → **Reset password**
- [ ] 3.2 Neon → Connect → branch dropdown = **shadow-dev**, pooling **OFF** → copy the URL
      (hostname must NOT contain `-pooler`)
- [ ] 3.3 KeePassXC — Title: `Neon shadow-dev`, paste URL in Notes
- [ ] 3.4 Fix Vercel (removes the broken one you added earlier):
      ```
      vercel env rm SHADOW_DATABASE_URL development
      vercel env add SHADOW_DATABASE_URL development
      ```
- [ ] 3.5 GitHub → Settings → Secrets → Actions → `SHADOW_DATABASE_URL` → Update → paste same URL

## PHASE 4 — ADMIN_TOKEN

- [ ] 4.1 Generate one with the node command at the top. Copy it.
- [ ] 4.2 KeePassXC — Title: `ADMIN_TOKEN (Vercel)`, Password: (paste)
- [ ] 4.3 ```
      vercel env rm ADMIN_TOKEN production
      vercel env add ADMIN_TOKEN production
      ```
      (If `vercel env ls` shows it's named ADMIN_SECRET instead, use that name.)

## PHASE 5 — BACKUP_PASSPHRASE (old one is burned — it was pasted in chat)

- [ ] 5.1 Generate a new one with the node command. Copy it.
- [ ] 5.2 KeePassXC — Title: `BACKUP_PASSPHRASE (DB backups)`, Password: (paste)
- [ ] 5.3 ```
      gh secret set BACKUP_PASSPHRASE
      ```
      (paste when prompted) — or GitHub → repo → Settings → Secrets → Actions → update it.
      Old backups become unreadable; tonight's backup uses the new phrase. Fine.

## PHASE 6 — Sentry env vars (not passwords, just missing config)

- [ ] 6.1 Get DSN: greenreserve.sentry.io → Settings → Projects → javascript-nextjs
      → Client Keys (DSN) → copy
- [ ] 6.2 ```
      vercel env add SENTRY_DSN production
      vercel env add NEXT_PUBLIC_SENTRY_DSN production
      vercel env add SENTRY_ORG production
      vercel env add SENTRY_PROJECT production
      ```
      First two = the DSN. SENTRY_ORG = `greenreserve`. SENTRY_PROJECT = `javascript-nextjs`.

## PHASE 7 — Admin app password

- [ ] 7.1 Log into https://greenreserve.app/admin → Profile tab → change password.
      Make it a NEW strong one (KeePassXC can generate: the dice icon in the entry editor).
- [ ] 7.2 KeePassXC — Title: `GreenReserve admin (owner)`, URL: https://greenreserve.app/admin

## PHASE 8 — Deploy + verify (do this LAST, after all the above)

- [ ] 8.1 `vercel --prod`
- [ ] 8.2 Open https://greenreserve.app/api/health — must say `{"ok":true,"db":"up"}`
- [ ] 8.3 Log into /admin once, load /dashboard once, load a course page once. All work → done.
- [ ] 8.4 Ctrl+S in KeePassXC one last time. Delete this file or keep it — it has no secrets.

---

**If health check fails after Phase 8:** the most likely cause is a typo'd DATABASE_URL
in Vercel. Re-do 2.4 carefully (pooled URL + the pgbouncer suffix), redeploy.
