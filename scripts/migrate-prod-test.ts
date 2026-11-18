// docs/RELEASES.md §2 (Build OK 2026-11-18): which builds may run `prisma migrate deploy`.
// Production always migrates and fails the build on a migrate error; only a staging preview
// that is explicitly set up migrates, and never a database holding a real course.
// Also pins the commit /api/health reports (scripts/release.mjs check --expect-sha).
// Pure parts always run. The database parts run when DIRECT_URL reaches a Postgres
// (CI's tests job has one, migrated and empty); they're skipped, and say so, otherwise.
// Run: npx tsx scripts/migrate-prod-test.ts
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';
import { PrismaClient } from '@prisma/client';
import { liveCommit } from '../src/lib/build-info';

const require_ = createRequire(import.meta.url);
const { decide, dbHost } = require_('./migrate-decide.js') as {
  decide: (env: Record<string, string | undefined>) => { action: string };
  dbHost: (url: string) => string;
};

let failed = 0;
const check = (label: string, ok: boolean, note = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && note ? `  (${note})` : ''}`); if (!ok) failed++; };

const STG = 'ep-stg-123.us-east-2.aws.neon.tech';
const PROD = 'ep-prod-456.us-east-2.aws.neon.tech';
const url = (host: string) => `postgresql://u:p@${host}/neondb?sslmode=require`;
const pooled = (host: string) => url(host.replace(/^([^.]+)\./, '$1-pooler.'));
const staging = (over: Record<string, string> = {}) => ({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'staging', MIGRATE_ON_BUILD: STG, DIRECT_URL: url(STG), DATABASE_URL: pooled(STG), ...over });

// ---- pure decision
check('production migrates', decide({ VERCEL_ENV: 'production' }).action === 'migrate');
check('production migrates whatever MIGRATE_ON_BUILD or the branch say', decide({ VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'staging', MIGRATE_ON_BUILD: STG, DIRECT_URL: url(PROD) }).action === 'migrate');
check('local build skips', decide({}).action === 'skip');
check('development on branch staging skips', decide({ VERCEL_ENV: 'development', VERCEL_GIT_COMMIT_REF: 'staging', MIGRATE_ON_BUILD: STG, DIRECT_URL: url(STG), DATABASE_URL: pooled(STG) }).action === 'skip');
check('no VERCEL_ENV on branch staging skips', decide({ VERCEL_GIT_COMMIT_REF: 'staging', MIGRATE_ON_BUILD: STG, DIRECT_URL: url(STG), DATABASE_URL: pooled(STG) }).action === 'skip');
check('another preview skips even with the variable leaked and prod URLs', decide({ ...staging({ VERCEL_GIT_COMMIT_REF: 'build/x', DIRECT_URL: url(PROD), DATABASE_URL: pooled(PROD) }) }).action === 'skip');
check('a branch named staging-2 skips', decide(staging({ VERCEL_GIT_COMMIT_REF: 'staging-2' })).action === 'skip');
check('staging without MIGRATE_ON_BUILD skips', decide(staging({ MIGRATE_ON_BUILD: '' })).action === 'skip');
check('staging on its own host migrates (pooled URL matches after -pooler)', decide(staging()).action === 'migrate-staging');
check('staging accepts the pooled host from the Neon console in MIGRATE_ON_BUILD', decide(staging({ MIGRATE_ON_BUILD: STG.replace(/^([^.]+)\./, '$1-pooler.') })).action === 'migrate-staging');
check('staging host match ignores case and spaces', decide(staging({ MIGRATE_ON_BUILD: `  ${STG.toUpperCase()} ` })).action === 'migrate-staging');
check('staging refuses a prod DIRECT_URL', decide(staging({ DIRECT_URL: url(PROD) })).action === 'refuse');
check('staging refuses a prod DATABASE_URL beside a staging DIRECT_URL', decide(staging({ DATABASE_URL: pooled(PROD) })).action === 'refuse');
check('staging refuses MIGRATE_ON_BUILD=1', decide(staging({ MIGRATE_ON_BUILD: '1' })).action === 'refuse');
check('staging refuses a full URL in MIGRATE_ON_BUILD', decide(staging({ MIGRATE_ON_BUILD: url(STG) })).action === 'refuse');
check('staging refuses missing URLs', decide(staging({ DIRECT_URL: '', DATABASE_URL: '' })).action === 'refuse');
check('staging refuses an unparseable URL', decide(staging({ DIRECT_URL: 'not a url' })).action === 'refuse');
check('dbHost strips -pooler only from the endpoint label', dbHost(pooled(STG)) === STG && dbHost('postgresql://u@a-pooler-b.x.tech/d') === 'a-pooler-b.x.tech');

// ---- liveCommit (/api/health "commit")
check('commit is the first 7 characters of the Vercel SHA', liveCommit({ VERCEL_GIT_COMMIT_SHA: 'D40DA557ab12cd34ef' }) === 'd40da55');
check('commit is null outside Vercel', liveCommit({}) === null);
check('commit is null for anything that is not a SHA', liveCommit({ VERCEL_GIT_COMMIT_SHA: 'main; rm -rf' }) === null);

// ---- the real script, with npx stubbed so nothing touches a database it shouldn't
const bin = mkdtempSync(join(tmpdir(), 'migrate-test-'));
const stub = (ok: boolean) => { writeFileSync(join(bin, 'npx'), `#!/bin/sh\necho STUB-NPX "$@"\nexit ${ok ? 0 : 1}\n`); chmodSync(join(bin, 'npx'), 0o755); };
function run(env: Record<string, string>, npxOk = true) {
  stub(npxOk);
  const r = spawnSync(process.execPath, ['scripts/migrate-prod.js'], { encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME ?? '', ...env } as unknown as NodeJS.ProcessEnv });
  return { code: r.status, out: `${r.stdout}${r.stderr}`, migrated: r.stdout.includes('STUB-NPX prisma migrate deploy') };
}
let r = run({ VERCEL_ENV: 'production' });
check('script: production runs migrate deploy', r.code === 0 && r.migrated, r.out);
r = run({ VERCEL_ENV: 'production' }, false);
check('script: a failed production migrate fails the build', r.code === 1 && /FAILED/.test(r.out), r.out);
r = run({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'build/x', MIGRATE_ON_BUILD: STG, DIRECT_URL: url(PROD), DATABASE_URL: pooled(PROD) });
check('script: another preview never migrates', r.code === 0 && !r.migrated, r.out);
r = run(staging({ DIRECT_URL: url(PROD) }));
check('script: staging with a prod URL fails the build and never migrates', r.code === 1 && !r.migrated, r.out);
r = run({});
check('script: local build skips', r.code === 0 && !r.migrated, r.out);

// ---- the config-free guard, against a real Postgres when one is reachable
async function dbCases() {
  const base = process.env.DIRECT_URL;
  // These cases CREATE and DROP a database, so they only ever run against a local server, never a
  // DIRECT_URL left exported from production work. In CI they must run: a skip there is a failure.
  const skip = (why: string) => { if (process.env.CI) check(`database cases ran in CI`, false, why); else console.log(`SKIP  database cases (${why})`); };
  if (!base) { skip('no DIRECT_URL'); return; }
  const h = new URL(base).hostname;
  if (h !== 'localhost' && h !== '127.0.0.1') { skip(`DIRECT_URL is ${h}, not a local server`); return; }
  const admin = new PrismaClient({ datasources: { db: { url: base } } });
  try {
    await admin.$queryRawUnsafe('SELECT 1');
  } catch {
    skip('DIRECT_URL not reachable');
    await admin.$disconnect().catch(() => {});
    return;
  }
  const host = new URL(base).hostname;
  const name = `migrate_guard_${process.pid}`;
  const withDb = (db: string) => { const u = new URL(base); u.pathname = `/${db}`; return u.toString(); };
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    const env = (db: string) => ({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'staging', MIGRATE_ON_BUILD: host, DIRECT_URL: withDb(db), DATABASE_URL: withDb(db) });

    // A brand-new staging database (no tables yet) migrates.
    let x = run(env(name));
    check('script: a fresh, empty staging database migrates', x.code === 0 && x.migrated, x.out);

    // Test courses only: still staging, migrates.
    const scratch = new PrismaClient({ datasources: { db: { url: withDb(name) } } });
    await scratch.$executeRawUnsafe('CREATE TABLE "Course" ("id" text PRIMARY KEY, "isTest" boolean NOT NULL DEFAULT false)');
    await scratch.$executeRawUnsafe(`INSERT INTO "Course" ("id", "isTest") VALUES ('t1', true)`);
    x = run(env(name));
    check('script: a staging database with only test courses migrates', x.code === 0 && x.migrated, x.out);

    // One real course: this is production's data, so refuse.
    await scratch.$executeRawUnsafe(`INSERT INTO "Course" ("id", "isTest") VALUES ('r1', false)`);
    await scratch.$disconnect();
    x = run(env(name));
    check('script: a database holding a real course is refused, even with every host matching', x.code === 1 && !x.migrated && /real course/.test(x.out), x.out);

    // Unreachable database: refuse rather than guess.
    const dead = new URL(withDb(name)); dead.port = '1';
    x = run({ ...env(name), DIRECT_URL: dead.toString(), DATABASE_URL: dead.toString() });
    check('script: a staging database that cannot be checked is refused', x.code === 1 && !x.migrated, x.out);
  } finally {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => {});
    await admin.$disconnect();
  }
}

dbCases()
  .catch((e) => { check('database cases ran', false, String(e?.message ?? e)); })
  .finally(() => {
    rmSync(bin, { recursive: true, force: true });
    console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
    process.exit(failed === 0 ? 0 : 1);
  });
