import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { ACCESS_FEE_CENTS } from '@/lib/booking-fees';
import vercelConfig from '../../../../../vercel.json';

// MP-8a: System used to be five cards with hardcoded neutral dots and two
// links that did not reach their target (Sentry → marketing homepage, Vercel →
// generic dashboard). This returns everything the page can say truthfully
// without a schema change: project-deep links built from the env the deploy
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

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2d: the nav hides System at MANAGER_PLUS; hiding a link is not a gate, so make the claim true.
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // We don't log raw Stripe webhook receipts anywhere, so this is a proxy
  // signal, not a real log: the most recently updated course that has a
  // Stripe account attached. Good enough for a 30-second sanity check, not
  // precise — a real webhook-received timestamp needs a schema change.
  const lastStripeTouch = await prisma.course.findFirst({
    where: { stripeAccountId: { not: '' } },
    orderBy: { updatedAt: 'desc' },
    select: { name: true, updatedAt: true },
  });

  const env = process.env;
  const repoOwner = env.VERCEL_GIT_REPO_OWNER || 'camsanchez33';
  const repoSlug = env.VERCEL_GIT_REPO_SLUG || 'green-reserve';
  const github = `https://github.com/${repoOwner}/${repoSlug}`;
  const sentryOrg = env.SENTRY_ORG || '';
  const sentryProject = env.SENTRY_PROJECT || '';
  // Vercel does not expose the team slug to the runtime, so a project-deep
  // Vercel link has to be configured. Absent that, the page says so instead of
  // pretending the generic dashboard is a deep link.
  const vercelProjectUrl = env.ADMIN_VERCEL_PROJECT_URL || '';

  return NextResponse.json({
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
    },
    crons: CRONS.map(c => ({ path: c.path, schedule: c.schedule, human: describeSchedule(c.schedule) })),
    platform: {
      accessFeeCents: ACCESS_FEE_CENTS,
      env: env.VERCEL_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development'),
      commitSha: (env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7),
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
      },
    },
  });
}
