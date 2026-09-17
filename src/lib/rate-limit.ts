import { prisma } from './prisma';

// DB-backed fixed-window rate limiter. A single atomic upsert means it counts
// correctly across all serverless instances (in-memory counters do not).
// Returns true if the request is allowed.
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  // Keys that gate money (BIRDIE B1) fail CLOSED — a broken counter must not
  // uncap paid API spend. Everything else (login, forms) still fails open.
  const failClosed = key.startsWith('birdie:');
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "windowStart")
      VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds})
          THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE
          WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds})
          THEN now() ELSE "RateLimit"."windowStart" END
      RETURNING "count"
    `;
    return Number(rows[0]?.count ?? 0) <= limit;
  } catch (err) {
    // Fail open: a broken rate limiter must never take down login itself.
    // Per-account lockout still protects individual accounts.
    console.error('rateLimit error:', err);
    return !failClosed;
  }
}

/**
 * Same counter, but says how far in you are. SD-11 needs it to tell someone how
 * many code attempts remain — a number the limiter already had and threw away,
 * so the lockout used to arrive with no warning that it was coming.
 * Additive on purpose: rateLimit()'s boolean signature is used in 20+ places.
 */
export async function rateLimitCount(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; used: number }> {
  const failClosed = key.startsWith('birdie:');
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("key", "count", "windowStart")
      VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds})
          THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE
          WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds})
          THEN now() ELSE "RateLimit"."windowStart" END
      RETURNING "count"
    `;
    const used = Number(rows[0]?.count ?? 0);
    return { allowed: used <= limit, used };
  } catch (err) {
    console.error('rateLimitCount error:', err);
    return { allowed: !failClosed, used: 0 };
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'unknown';
}

/**
 * For records that carry evidentiary weight (a signed agreement): prefer the
 * header the platform sets over the client-writable leftmost hop.
 */
export function evidentiaryIp(req: Request): string {
  const platform = req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-real-ip');
  if (platform) return platform.split(',')[0].trim();
  const fwd = req.headers.get('x-forwarded-for');
  if (!fwd) return 'unknown';
  const hops = fwd.split(',').map(h => h.trim()).filter(Boolean);
  return hops[hops.length - 1] || 'unknown';
}
