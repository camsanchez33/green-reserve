#!/usr/bin/env node
/**
 * Runs `prisma migrate deploy` on production Vercel builds, and on the `staging`
 * branch's preview build when it is explicitly set up for it (docs/RELEASES.md §2).
 * Skips on every other preview and on local builds, so a branch push can never
 * migrate the production database. The env decision is scripts/migrate-decide.js
 * (pure, tested by scripts/migrate-prod-test.ts).
 *
 * Staging (Build OK 2026-11-18): set MIGRATE_ON_BUILD, scoped Preview + branch
 * `staging` only, to the staging branch's host AS SHOWN IN THE NEON CONSOLE for
 * the `staging` branch. Never copy it out of the URL you just pasted: if that URL
 * was production's, the check would match production. Two guards then apply:
 *   1. DIRECT_URL and DATABASE_URL must both be on that host, or the build fails.
 *   2. Config-free: before migrating, the target must hold no real course
 *      (Course.isTest = false). Staging is test courses only, so a real course
 *      means this is production's data, and the build fails.
 *
 * Used in package.json: "build": "prisma generate && node scripts/migrate-prod.js && next build"
 */
const { execSync } = require('child_process');
const { decide } = require('./migrate-decide');

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

/** Real (non-test) courses on the target database. 0 on a database with no Course table yet. */
async function realCourses() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM "Course" WHERE "isTest" = false');
    return rows[0].n;
  } catch (err) {
    // A brand-new staging database before its first migration has no Course table: nothing real in it.
    if (/relation "Course" does not exist|P2010.*42P01|42P01/.test(String(err && err.message))) return 0;
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const d = decide(process.env);
  if (d.action === 'skip') {
    console.log(`[migrate-prod] ${d.label} — skipping prisma migrate deploy.`);
    return;
  }
  if (d.action === 'refuse') {
    console.error(`[migrate-prod] ${d.reason}`);
    process.exit(1);
  }
  if (d.action === 'migrate-staging') {
    let n;
    try {
      n = await realCourses();
    } catch (err) {
      console.error(`[migrate-prod] staging: could not check the database for real courses (${err && err.message}). Refusing to migrate.`);
      process.exit(1);
    }
    if (n > 0) {
      console.error(`[migrate-prod] staging: the target database holds ${n} real course(s), so it is not the staging database. Refusing to migrate.`);
      process.exit(1);
    }
  }
  migrate(d.label);
}

main();
