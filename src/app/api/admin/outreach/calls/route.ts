// Inquiries data (Cam 2026-11-17): the Calls tab — every discovery call (Cal.com bookings, matched to the
// course by the webhook, and calls set by hand), upcoming first by time, then past. Read-only.
// Pipeline area, viewer+ (emails and phones support+).
import { NextResponse } from 'next/server';
import { resolveAdminSession, areaGate } from '@/lib/admin-session';
import { listCalls } from '@/lib/outreach-server';
import { calcomBookingUrl } from '@/lib/calcom';
import { signedOut, outreachRole, viewerOf } from '../gate';

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, false);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  const base = calcomBookingUrl();
  return NextResponse.json({ ...(await listCalls(g.viewer)), calcomUrl: base ? new URL(base).origin : null });
}
