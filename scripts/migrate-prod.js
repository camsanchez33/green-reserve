#!/usr/bin/env node
/**
 * Runs `prisma migrate deploy` only on production Vercel builds.
 * Skips silently on preview and local builds so a branch push can never
 * accidentally migrate the production database.
 *
 * Used in package.json: "build": "prisma generate && node scripts/migrate-prod.js && next build"
 */
const { execSync } = require('child_process');

const env = process.env.VERCEL_ENV;

if (env !== 'production') {
  console.log(`[migrate-prod] VERCEL_ENV=${env ?? '(none)'} — skipping prisma migrate deploy (production only).`);
  process.exit(0);
}

console.log('[migrate-prod] VERCEL_ENV=production — running prisma migrate deploy...');
try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('[migrate-prod] Migration completed successfully.');
} catch {
  console.error('[migrate-prod] prisma migrate deploy FAILED — aborting build to prevent deploying unmitigated code.');
  process.exit(1);
}
