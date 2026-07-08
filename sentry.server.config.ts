import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    // Money-path transactions always captured
    tracesSampler: (ctx) => {
      const op = ctx.name ?? '';
      if (op.includes('/api/bookings') || op.includes('/api/checkin') || op.includes('/api/cron')) {
        return 1.0;
      }
      return 0.2;
    },
  });
}
