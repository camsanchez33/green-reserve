import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { auditAdmin } from '@/lib/admin-audit';

// BRAIN-1b (Cam 2026-10-22): "Send a test error" on Admin → Health — proves the
// server half of Sentry is loaded and reporting, instead of trusting it.
export async function POST() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Health is for managers and the owner.' }, { status: 403 });
  if (!Sentry.getClient()) {
    return NextResponse.json({ error: 'Sentry isn’t loaded on the server — SENTRY_DSN is missing in Vercel, or the site hasn’t been redeployed since it was added.' }, { status: 503 });
  }
  const eventId = Sentry.captureException(new Error(`Test error from Admin → Health (sent by ${session.name})`), { tags: { area: 'sentry_test' } });
  const delivered = await Sentry.flush(3000);
  await auditAdmin(session, { action: 'sentry_test', targetType: 'system', targetId: eventId });
  if (!delivered) return NextResponse.json({ error: 'Sentry didn’t confirm it received the test in 3 seconds — check sentry.io → Issues in a minute.' }, { status: 504 });
  return NextResponse.json({ ok: true, eventId });
}
