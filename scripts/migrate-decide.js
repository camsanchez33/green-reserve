/**
 * Pure decision for scripts/migrate-prod.js: given the build's environment, should this
 * build run `prisma migrate deploy`? No I/O; pinned by scripts/migrate-prod-test.ts.
 *
 *   production                              → migrate (unchanged since 2026-09)
 *   preview of branch `staging`, with
 *   MIGRATE_ON_BUILD set to the staging
 *   database host, and BOTH DIRECT_URL and
 *   DATABASE_URL on that host               → migrate-staging (migrate-prod.js then also
 *                                              refuses a database holding any real course)
 *   the same, but a URL on another host     → refuse (fail the build)
 *   anything else                           → skip
 *
 * docs/RELEASES.md §2 (Build OK 2026-11-18).
 */
'use strict';

/** Hostname of a Postgres URL, lower-cased, with Neon's "-pooler" suffix on the endpoint removed. */
function dbHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^([^.]+)-pooler\./, '$1.');
  } catch {
    return '';
  }
}

function decide(env) {
  const vercelEnv = env.VERCEL_ENV;
  const branch = env.VERCEL_GIT_COMMIT_REF;
  const want = String(env.MIGRATE_ON_BUILD || '').trim().toLowerCase();

  if (vercelEnv === 'production') return { action: 'migrate', label: 'VERCEL_ENV=production' };

  if (vercelEnv === 'preview' && branch === 'staging' && want) {
    const direct = dbHost(env.DIRECT_URL || '');
    const pooled = dbHost(env.DATABASE_URL || '');
    if (direct !== want || pooled !== want) {
      return {
        action: 'refuse',
        reason: `staging: DIRECT_URL host (${direct || 'none'}) and DATABASE_URL host (${pooled || 'none'}) must both be MIGRATE_ON_BUILD (${want}). Refusing to migrate; fix staging's database variables.`,
      };
    }
    return { action: 'migrate-staging', label: `staging preview, database ${direct}` };
  }

  return { action: 'skip', label: `VERCEL_ENV=${vercelEnv ?? '(none)'}${branch ? `, branch ${branch}` : ''}` };
}

module.exports = { decide, dbHost };
