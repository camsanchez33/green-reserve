import { prisma } from './prisma';

// DB-backed fixed-window rate limiter. A single atomic upsert means it counts
// correctly across all serverless instances (in-memory counters do not).
// Returns true if the request is allowed.
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
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
    return true;
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'unknown';
}
