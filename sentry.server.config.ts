import * as Sentry from '@sentry/nextjs';
import { SENTRY_DATA_COLLECTION } from './sentry.privacy';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    dataCollection: SENTRY_DATA_COLLECTION,
    tracesSampleRate: 0.2,
    // Money-path transactions always captured. v11 samples before the span is
    // named, so the request path comes from the attributes first.
    tracesSampler: (ctx) => {
      const op = String(ctx.attributes?.['url.path'] ?? ctx.normalizedRequest?.url ?? ctx.name ?? '');
      if (op.includes('/api/bookings') || op.includes('/api/checkin') || op.includes('/api/cron')) {
        return 1.0;
      }
      return 0.2;
    },
  });
}
