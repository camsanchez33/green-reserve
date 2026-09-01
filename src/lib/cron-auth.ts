import { NextRequest, NextResponse } from 'next/server';

/**
 * The cron bearer check, in one place.
 *
 * Every cron route in this app can move money or mutate the tee sheet for every
 * course, so they are only ever invoked by Vercel Cron with a shared secret.
 *
 * generate-tee-times had this as:
 *
 *   if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`)
 *
 * — which FAILS OPEN. With the env var unset the condition short-circuits to
 * false and the route runs for anyone. The other four omitted that guard and so
 * failed closed, but only by accident of comparing against "Bearer undefined".
 * Neither is something to leave to chance on five separate routes, hence this.
 *
 * Returns a NextResponse to return immediately, or null when the caller is
 * authorised.
 */
export function cronAuthFailure(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  // No secret configured is a deployment error, not an open door. 503 rather
  // than 401 so a misconfiguration is distinguishable from a bad caller in the
  // logs — and it is loud, because a silently unprotected cron is the failure
  // mode this exists to prevent.
  if (!secret) {
    console.error(JSON.stringify({ ev: 'cron.misconfigured', detail: 'CRON_SECRET is not set — refusing to run' }));
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  }

  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
