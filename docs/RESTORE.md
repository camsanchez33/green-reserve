# Database Restore Guide

GreenReserve has two independent recovery paths. Prefer Neon PITR for anything in
the last few days; use the pg_dump artifact as a second copy or for older restores.

---

## Path 1: Neon Point-in-Time Recovery (PITR)

Neon retains WAL history for your plan's retention window.

**Where to find it:**
1. Neon console → your project → Branches
2. Click the branch → "Restore" (or "Reset from parent")
3. Select a point in time or a specific transaction
4. This creates a NEW branch at that point — your original branch is untouched

**When to use:** Accidental deletion, bad migration, data corruption within the PITR window.

**After verifying the restored branch:**
1. Swap `DATABASE_URL` and `DIRECT_URL` in Vercel to point to the restored branch
2. Test on the preview or staging deployment
3. Once verified: promote the restored branch to become the new primary, or copy data back

---

## Path 2: pg_dump Artifact Restore

**Step 1 — Download the backup**

1. GitHub → Actions → "Nightly Database Backup"
2. Click the run for the date you want
3. Download the artifact zip → extract `greenreserve-db-YYYY-MM-DD.dump.enc`

**Step 2 — Decrypt**

```bash
# You need BACKUP_PASSPHRASE from your password manager
openssl enc -d -aes-256-cbc -pbkdf2 \
  -pass pass:"YOUR_PASSPHRASE_HERE" \
  -in  greenreserve-db-YYYY-MM-DD.dump.enc \
  -out greenreserve-db-YYYY-MM-DD.dump
```

**Step 3 — Create a fresh Neon branch for testing**

1. Neon console → Branches → Create branch from main (name it `restore-test`)
2. Copy the branch's direct connection string

**Step 4 — Restore into the test branch**

```bash
pg_restore \
  --dbname="postgresql://user:pass@host/neondb?sslmode=require" \
  --clean --if-exists --no-owner --no-privileges \
  greenreserve-db-YYYY-MM-DD.dump
```

**Step 5 — Verify**

```bash
# Connect and check row counts
psql "postgresql://user:pass@host/neondb?sslmode=require" \
  -c "SELECT COUNT(*) FROM \"Booking\"; SELECT COUNT(*) FROM \"Course\";"
```

**Step 6 — Promote to production (only after verifying)**

1. Point `DATABASE_URL` and `DIRECT_URL` in Vercel to the restored branch
2. Trigger a new Vercel deployment to pick up the new URLs
3. Delete the original corrupted branch once stable

---

## Quarterly Restore Drill

Run steps 1–5 above against a throwaway Neon branch every quarter to prove the
backups actually restore. Schedule it in your calendar.

Checklist:
- [ ] Downloaded artifact and decrypted successfully
- [ ] `pg_restore` completed with no fatal errors
- [ ] Row counts in key tables look correct (Booking, Course, GolferAccount)
- [ ] Deleted the throwaway branch after the drill
- [ ] Updated this doc with the drill date: ___________

---

## Notes

- The backup uses `pg_dump --format=custom` (compressed). Do NOT use `psql <` to
  restore — it requires `pg_restore`.
- `--no-owner --no-privileges` avoids permission errors on the target DB.
- The `BACKUP_PASSPHRASE` must be stored in your password manager, not in the repo.
  If lost, the encrypted backups are unrecoverable.
