#!/usr/bin/env node
/**
 * Runs `prisma migrate deploy` on production Vercel builds, and on the `staging`
 * branch's preview build when it is explicitly set up for it (docs/RELEASES.md §2).
 * Skips silently on every other preview and on local builds, so a branch push can
 * never migrate the production database.
 *
 * Staging (Build OK 2026-11-18): set MIGRATE_ON_BUILD to the staging database's
 * HOST (the host in DIRECT_URL, e.g. ep-xxx.us-east-2.aws.neon.tech), scoped to
 * Preview + branch `staging` only. It migrates only when all three hold:
 *   VERCEL_ENV=preview, VERCEL_GIT_COMMIT_REF=staging, and DIRECT_URL's host equals
 *   MIGRATE_ON_BUILD. So the production URL pasted into staging's variables by
 *   mistake fails the staging build instead of applying unreleased migrations to
 *   production, and the variable leaking to other previews does nothing.
 *
 * Used in package.json: "build": "prisma generate && node scripts/migrate-prod.js && next build"
 */
const { execSync } = require('child_process');

const env = process.env.VERCEL_ENV;
const branch = process.env.VERCEL_GIT_COMMIT_REF;
const stagingHost = (process.env.MIGRATE_ON_BUILD || '').trim().toLowerCase();

function dbHost(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function migrate(label) {
  console.log(`[migrate-prod] ${label} — running prisma migrate deploy...`);
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('[migrate-prod] Migration completed successfully.');
  } catch {
    console.error('[migrate-prod] prisma migrate deploy FAILED — aborting build to prevent deploying unmigrated code.');
    process.exit(1);
  }
}

if (env === 'production') {
  migrate('VERCEL_ENV=production');
} else if (env === 'preview' && branch === 'staging' && stagingHost) {
  const host = dbHost(process.env.DIRECT_URL || process.env.DATABASE_URL || '');
  if (host !== stagingHost) {
    console.error(`[migrate-prod] staging: the database host (${host || 'none'}) is not MIGRATE_ON_BUILD (${stagingHost}). Refusing to migrate; fix staging's DATABASE_URL/DIRECT_URL.`);
    process.exit(1);
  }
  migrate(`staging preview, database ${host}`);
} else {
  console.log(`[migrate-prod] VERCEL_ENV=${env ?? '(none)'}${branch ? `, branch ${branch}` : ''} — skipping prisma migrate deploy.`);
  process.exit(0);
}
