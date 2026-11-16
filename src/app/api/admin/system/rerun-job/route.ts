import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS, areaGate } from '@/lib/admin-session';
import { auditAdmin } from '@/lib/admin-audit';
import { cronHealth } from '@/lib/cron-log';
import { canRerun, CHARGING_JOBS } from '@/lib/platform-status';
import { GET as generateTeeTimes } from '../../../cron/generate-tee-times/route';
import { GET as chaseOnboarding } from '../../../cron/chase-onboarding/route';
import { GET as monthlyReview } from '../../../cron/monthly-review/route';
import vercelConfig from '../../../../../../vercel.json';

// Platform activity (Cam 2026-11-15, lanes/admin.md): "Re-run job" on a failed or
// overdue scheduled job. Manager+ with the Company area, like the board; audited.
//
// It runs the job's OWN exported handler — the cronRoute() wrapper included — so the
// run is checked, logged in CronRunLog and reported to Sentry exactly like the
// scheduled one.
//
// Only jobs that move no money: the admin never charges or retries a golfer's payment
// (Cam 2026-11-12), and hourly, cancellation-cutoff and send-reminders charge saved
// cards and retry renewals (CHARGING_JOBS in lib/platform-status). Those are refused
// here and NOT imported, so this route cannot reach a charge even by mistake
// (scripts/admin-never-charges-test.ts pins it). They catch up on their next run.
//
// Refused with 409 while a run of the same job started in the last 15 minutes has
// not finished.

// The monthly review may use its full five minutes.
export const maxDuration = 300;

type Cron = { path: string; schedule: string };
const CRONS: Cron[] = ((vercelConfig as { crons?: Cron[] }).crons ?? []);

// Keep in step with RERUN_JOBS (lib/platform-status); admin-never-charges-test pins both.
const HANDLERS: Record<string, (req: NextRequest) => Promise<NextResponse>> = {
  '/api/cron/generate-tee-times': generateTeeTimes,
  '/api/cron/chase-onboarding': chaseOnboarding,
  '/api/cron/monthly-review': monthlyReview,
};

const RUNNING_MS = 15 * 60_000;

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const noArea = areaGate(session, 'company');
  if (noArea) return noArea;
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ ok: false, error: 'Only a manager can re-run a job.' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const path = typeof body.path === 'string' ? body.path : '';
  const cron = CRONS.find(c => c.path === path);
  if (!cron) return NextResponse.json({ ok: false, error: 'That isn’t one of the scheduled jobs.' }, { status: 404 });
  const handler = HANDLERS[cron.path];
  if (!canRerun(cron.path.replace('/api/cron/', '')) || !handler) {
    const charges = CHARGING_JOBS.has(cron.path.replace('/api/cron/', ''));
    return NextResponse.json({ ok: false, error: charges
      ? 'This job charges saved cards, so it only runs on its schedule. Fix the cause and it catches up on its next run.'
      : 'This job can’t be re-run from here. It runs on its schedule.' }, { status: 403 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'Scheduled jobs aren’t configured (CRON_SECRET is not set).' }, { status: 503 });

  const job = cron.path.replace('/api/cron/', '');
  const running = await prisma.cronRunLog.findFirst({
    where: { job, finishedAt: null, startedAt: { gt: new Date(Date.now() - RUNNING_MS) } },
    select: { startedAt: true },
  });
  if (running) return NextResponse.json({ ok: false, error: `This job is already running (started ${running.startedAt.toISOString()}). Wait for it to finish.` }, { status: 409 });

  // Recorded before it runs: a run that outlives the function still leaves the record.
  await auditAdmin(session, { action: 'cron_rerun', targetType: 'cron', targetId: job, detail: `Re-ran ${cron.path}` });

  // The same request Vercel Cron sends, built in-process: the secret never leaves the server.
  const cronReq = new NextRequest(new URL(cron.path, req.nextUrl.origin), { method: 'GET', headers: { authorization: `Bearer ${secret}` } });
  try {
    await handler(cronReq);
  } catch (err) {
    // cronRoute already logged the failure; the board reads it from the health below.
    console.error(JSON.stringify({ ev: 'admin.cron_rerun.threw', job, error: err instanceof Error ? err.message : String(err) }));
  }
  const [health] = await cronHealth([cron]);
  return NextResponse.json({ ok: true, health });
}
