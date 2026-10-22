// BRAIN-0 (Cam 2026-10-22): load Sentry on the server. With @sentry/nextjs 8 on
// Next 15 the server SDK starts only from this hook — without it
// sentry.server.config.ts never ran, so API route and cron errors (the money
// paths) reached nobody even with a DSN set. No DSN = the config is a no-op.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.server.config');
  }
}

// Next 15 hands every uncaught server error (routes, server components,
// middleware) to this hook.
export const onRequestError = Sentry.captureRequestError;
