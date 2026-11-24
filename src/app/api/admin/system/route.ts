import { NextRequest, NextResponse } from 'next/server';
import { birdieEnabled, birdieUsageToday } from '@/lib/birdie/guardrails';
import { PLATFORM_PER_DAY } from '@/lib/assistant/caps';
import { ASSISTANT_MODEL } from '@/lib/assistant/prompt';
import { prisma } from '@/lib/prisma';
import { calcomStatus } from '@/lib/calcom';
import { resolveAdminSession, requireRole, MANAGER_PLUS, areaGate } from '@/lib/admin-session';
import { ACCESS_FEE_CENTS } from '@/lib/booking-fees';
import { cronHealth, lastStripeWebhook } from '@/lib/cron-log';
import { githubStatus, neonStatus, resendStatus, twilioStatus, serviceStates, repoOf, canRerun } from '@/lib/platform-status';
import vercelConfig from '../../../../../vercel.json';

// MP-8a: System used to be five cards with hardcoded neutral dots and two
// links that did not reach their target (Sentry → marketing homepage, Vercel →
// generic dashboard). This returns everything the page can say truthfully
// without a schema change (MP-8b adds real cron runs and webhook receipts): project-deep links built from the env the deploy
// already has, the real cron schedules, and a read-only Platform card — the
// fee in force, what is deployed, which integrations hold keys. Secrets are
// never returned; only whether one is set.

type Cron = { path: string; schedule: string };

// vercel.json is the source of truth for schedules — reading it here means
// the card cannot drift from what is actually configured.
const CRONS: Cron[] = ((vercelConfig as { crons?: Cron[] }).crons ?? []);

// Plain-English cron, for the five shapes this project uses. Anything else
// falls back to the raw expression rather than guessing.
function describeSchedule(s: string): string {
  const m = s.match(/^(\d+) (\d+|\*) \* \* \*$/);
  if (!m) return s;
  const [, min, hour] = m;
  if (hour === '*') return min === '0' ? 'Every hour' : `Every hour at :${min.padStart(2, '0')}`;
  const h = Number(hour);
  return `Daily at ${h.toString().padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
}

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const noArea = areaGate(session, 'company');
  if (noArea) return noArea;
  // MP-2d: the nav hides System at MANAGER_PLUS; hiding a link is not a gate, so make the claim true.
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // MP-8b: real receipts now (lib/cron-log.ts). The course-updatedAt proxy
  // stays only as context for deploys that predate the log.
  // Platform activity: Re-check is this same read with ?fresh=1 (skips the GitHub/Resend cache).
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';
  const [lastStripeTouch, stripeWebhook, cronRuns, gh, resend] = await Promise.all([
    prisma.course.findFirst({
      where: { stripeAccountId: { not: '' } },
      orderBy: { updatedAt: 'desc' },
      select: { name: true, updatedAt: true },
    }),
    lastStripeWebhook(),
    cronHealth(CRONS),
    githubStatus(fresh),
    resendStatus(fresh),
  ]);
  const neon = await neonStatus(gh);

  const env = process.env;
  const github = repoOf(env).url;
  const sentryOrg = env.SENTRY_ORG || '';
  const sentryProject = env.SENTRY_PROJECT || '';
  // Vercel does not expose the team slug to the runtime, so a project-deep
  // Vercel link has to be configured. Absent that, the page says so instead of
  // pretending the generic dashboard is a deep link.
  const vercelProjectUrl = env.ADMIN_VERCEL_PROJECT_URL || '';

  const birdie = { enabled: birdieEnabled(), keySet: !!process.env.ANTHROPIC_API_KEY, flag: process.env.BIRDIE_ENABLED === 'true', todayReplies: await birdieUsageToday(), dailyCap: Object.values(PLATFORM_PER_DAY).reduce((a, b) => a + b, 0), model: ASSISTANT_MODEL };
  const calcom = calcomStatus();
  const twilio = twilioStatus(env);
  const commitSha = (env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
  const services = serviceStates({
    now: new Date(),
    crons: cronRuns.map(c => ({ job: c.job, status: c.status, ran: !!c.last })),
    commitSha, neon, github: gh, resend, twilio,
    stripe: { keySet: !!env.STRIPE_SECRET_KEY, webhookSecretSet: !!env.STRIPE_WEBHOOK_SECRET, lastWebhook: stripeWebhook ? { at: stripeWebhook.at, outcome: stripeWebhook.outcome } : null },
    calcom: calcom.state === 'on' ? { state: 'on', webhookSecretSet: calcom.webhookSecretSet } : { state: calcom.state },
    sentry: !!(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN),
    assistant: { enabled: birdie.enabled, flag: birdie.flag, keySet: birdie.keySet },
    blob: { publicSet: !!env.BLOB_READ_WRITE_TOKEN, privateSet: !!env.BLOB_PRIVATE_READ_WRITE_TOKEN },
  });

  return NextResponse.json({
    // Platform activity (Cam 2026-11-15): one dot per service, from lib/platform-status (the page never re-derives it).
    services,
    neon,
    github: gh,
    resend,
    twilio,
    vercel: {
      env: env.VERCEL_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development'),
      commitSha,
      commitMessage: (env.VERCEL_GIT_COMMIT_MESSAGE || '').split('\n')[0].slice(0, 90),
      branch: env.VERCEL_GIT_COMMIT_REF || '',
      commitUrl: env.VERCEL_GIT_COMMIT_SHA ? `${github}/commit/${env.VERCEL_GIT_COMMIT_SHA}` : '',
    },
    // CAL-2: what the booking page will do. The booking URL is public (it is
    // the link courses open); the webhook secret is reported only as set/unset.
    calcom,
    // BIRDIE_AI_SPEC B1: the kill switch and today's platform-wide reply count (the daily cap reads the same counter).
    birdie,
    lastStripeTouch: lastStripeTouch
      ? { courseName: lastStripeTouch.name, updatedAt: lastStripeTouch.updatedAt.toISOString() }
      : null,
    links: {
      backups: `${github}/actions/workflows/db-backup.yml`,
      ci: `${github}/actions`,
      commits: `${github}/commits/main`,
      vercel: vercelProjectUrl || 'https://vercel.com/dashboard',
      vercelIsDeep: !!vercelProjectUrl,
      sentry: sentryOrg
        ? `https://${sentryOrg}.sentry.io/issues/${sentryProject ? `?project=${encodeURIComponent(sentryProject)}` : ''}`
        : 'https://sentry.io',
      sentryIsDeep: !!sentryOrg,
      stripeWebhooks: 'https://dashboard.stripe.com/webhooks',
      resendDashboard: 'https://resend.com/domains',
      twilioConsole: 'https://console.twilio.com/',
      neonConsole: 'https://console.neon.tech/',
      vercelEnv: vercelProjectUrl ? `${vercelProjectUrl.replace(/\/$/, '')}/settings/environment-variables` : 'https://vercel.com/dashboard',
      vercelEnvIsDeep: !!vercelProjectUrl,
      vercelCrons: vercelProjectUrl ? `${vercelProjectUrl.replace(/\/$/, '')}/settings/cron-jobs` : 'https://vercel.com/dashboard',
      vercelCronsIsDeep: !!vercelProjectUrl,
    },
    crons: CRONS.map(c => ({ path: c.path, schedule: c.schedule, human: describeSchedule(c.schedule), health: cronRuns.find(r => r.path === c.path) ?? null, canRerun: canRerun(c.path.replace('/api/cron/', '')) })),
    stripeWebhook,
    platform: {
      accessFeeCents: ACCESS_FEE_CENTS,
      env: env.VERCEL_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development'),
      commitSha,
      commitMessage: (env.VERCEL_GIT_COMMIT_MESSAGE || '').split('\n')[0].slice(0, 90),
      branch: env.VERCEL_GIT_COMMIT_REF || '',
      publicUrl: env.NEXT_PUBLIC_URL || '',
      // Presence only — never the value.
      integrations: {
        stripe: !!env.STRIPE_SECRET_KEY,
        stripeWebhook: !!env.STRIPE_WEBHOOK_SECRET,
        resend: !!env.RESEND_API_KEY,
        twilio: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER),
        sentry: !!(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN),
        blob: !!env.BLOB_READ_WRITE_TOKEN,
        privateBlob: !!env.BLOB_PRIVATE_READ_WRITE_TOKEN,
      },
    },
  });
}
