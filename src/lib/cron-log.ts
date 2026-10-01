// MP-8b: every scheduled job writes one CronRunLog row per run, so Admin →
// System can say "the hourly job last ran at 14:00 and charged 3 holds" or
// turn red when it failed, never finished, or stopped running — instead of
// "check the Vercel logs". The table shipped in MP-3a and sat unwritten.
//
// Stripe webhook receipts are logged in the same table under the job name
// `webhook:stripe` (one row per verified event) — the System card used to
// guess from a course's updatedAt. Same shape (when, ok/error, what), no new
// table.
//
// Logging is best effort: a failed log write is reported to the function log
// and never changes what the job or webhook returns.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { cronAuthFailure } from './cron-auth';

export const STRIPE_WEBHOOK_JOB = 'webhook:stripe';
const KEEP_DAYS = 90;
const MAX_DETAIL = 500;

const clip = (s: string) => (s.length > MAX_DETAIL ? s.slice(0, MAX_DETAIL - 1) + '…' : s);

async function safe<T>(what: string, job: string, fn: () => Promise<T>): Promise<T | null> {
  try { return await fn(); } catch (err) {
    console.error(JSON.stringify({ ev: 'cron_log.write_failed', what, job, error: err instanceof Error ? err.message : String(err) }));
    return null;
  }
}

/** A response body counts as a failure when it says so: ok/success false, an
 *  error string, or a non-zero error/failed count. Everything else is ok. */
function judge(status: number, body: unknown): { outcome: 'ok' | 'error'; error: string } {
  if (status >= 400) return { outcome: 'error', error: `HTTP ${status}` };
  if (!body || typeof body !== 'object') return { outcome: 'ok', error: '' };
  const b = body as Record<string, unknown>;
  if (b.ok === false || b.success === false) return { outcome: 'error', error: typeof b.error === 'string' ? b.error : 'reported failure' };
  if (typeof b.error === 'string' && b.error) return { outcome: 'error', error: b.error };
  const count = (v: unknown) => (typeof v === 'number' ? v : Array.isArray(v) ? v.length : 0);
  const n = count(b.errorCount) || count(b.failed);
  if (n > 0) return { outcome: 'error', error: `${n} item${n === 1 ? '' : 's'} failed` };
  return { outcome: 'ok', error: '' };
}

/** "charged 3 · emailed 2" from the numeric fields of a job's JSON reply. */
function summarise(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  return Object.entries(body as Record<string, unknown>)
    .filter(([k, v]) => k !== 'success' && k !== 'ok' && (typeof v === 'number' || Array.isArray(v)))
    .map(([k, v]) => `${k} ${typeof v === 'number' ? v : (v as unknown[]).length}`)
    .join(' · ');
}

/**
 * Wrap a cron route: authorises first (an unauthorised call writes nothing),
 * then records start, finish, outcome and a one-line summary of the reply.
 * A thrown error is recorded and rethrown so Vercel still shows the 500.
 */
export function cronRoute(job: string, handler: (req: NextRequest) => Promise<NextResponse>) {
  return async function GET(req: NextRequest): Promise<NextResponse> {
    const denied = cronAuthFailure(req);
    if (denied) return denied;
    const row = await safe('start', job, () => prisma.cronRunLog.create({ data: { job }, select: { id: true } }));
    const finish = (data: { outcome: string; detail?: string; error?: string }) => row
      ? safe('finish', job, () => prisma.cronRunLog.update({ where: { id: row.id }, data: { finishedAt: new Date(), outcome: data.outcome, detail: clip(data.detail ?? ''), error: clip(data.error ?? '') } }))
      : null;
    let res: NextResponse;
    try {
      res = await handler(req);
    } catch (err) {
      await finish({ outcome: 'error', error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
    const body = await res.clone().json().catch(() => null);
    const { outcome, error } = judge(res.status, body);
    await finish({ outcome, detail: summarise(body), error });
    // The hourly job prunes the log so it stays a few thousand rows.
    if (job === 'hourly') {
      await safe('prune', job, () => prisma.cronRunLog.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } }));
    }
    return res;
  };
}

/** One row per verified Stripe webhook event; best effort. */
export async function logStripeWebhook(eventType: string, eventId: string, error?: string) {
  await safe('webhook', STRIPE_WEBHOOK_JOB, () => prisma.cronRunLog.create({
    data: { job: STRIPE_WEBHOOK_JOB, finishedAt: new Date(), outcome: error ? 'error' : 'ok', detail: clip(`${eventType} ${eventId}`), error: clip(error ?? '') },
  }));
}

export type CronHealth = {
  path: string; job: string;
  status: 'ok' | 'bad' | 'warn';
  /** Plain English for the card. */
  note: string;
  last: { startedAt: string; finishedAt: string | null; outcome: string; detail: string; error: string } | null;
};

/** Expected gap between runs for the cron shapes this project uses. */
function intervalMs(schedule: string): number {
  return /^\S+ \* \* \* \*$/.test(schedule) ? 3_600_000 : 86_400_000;
}

export async function cronHealth(crons: { path: string; schedule: string }[], now = new Date()): Promise<CronHealth[]> {
  return Promise.all(crons.map(async c => {
    const job = c.path.replace('/api/cron/', '');
    const last = await prisma.cronRunLog.findFirst({ where: { job }, orderBy: { startedAt: 'desc' } });
    const lastFinished = last?.finishedAt ? last : await prisma.cronRunLog.findFirst({ where: { job, finishedAt: { not: null } }, orderBy: { startedAt: 'desc' } });
    const gap = intervalMs(c.schedule);
    const out = (status: CronHealth['status'], note: string): CronHealth => ({
      path: c.path, job, status, note,
      last: lastFinished ? { startedAt: lastFinished.startedAt.toISOString(), finishedAt: lastFinished.finishedAt?.toISOString() ?? null, outcome: lastFinished.outcome, detail: lastFinished.detail, error: lastFinished.error } : null,
    });
    if (!last) return out('warn', 'No run recorded yet — runs are logged from this release on.');
    // Vercel stops a function at its max duration; a row that never finished
    // past that is a run that died mid-way.
    if (!last.finishedAt && now.getTime() - last.startedAt.getTime() > 15 * 60_000) return out('bad', `The run that started ${last.startedAt.toISOString()} never finished — it timed out or crashed.`);
    if (now.getTime() - last.startedAt.getTime() > gap * 1.5 + 10 * 60_000) return out('bad', 'Overdue — the last scheduled run did not happen.');
    if (lastFinished?.outcome === 'error') return out('bad', `Last run failed: ${lastFinished.error || 'see the function log'}`);
    return out('ok', '');
  }));
}

export async function lastStripeWebhook() {
  const r = await prisma.cronRunLog.findFirst({ where: { job: STRIPE_WEBHOOK_JOB }, orderBy: { startedAt: 'desc' } });
  return r ? { at: r.startedAt.toISOString(), outcome: r.outcome, detail: r.detail, error: r.error } : null;
}
