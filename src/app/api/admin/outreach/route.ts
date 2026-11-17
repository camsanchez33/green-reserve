// Inquiries data (Cam 2026-11-17, lanes/admin.md "Inquiries"): the Outreach tab — courses in outreach
// (status 'lead') grouped by their derived stage, with the next step, plus "said yes this month" and the
// Not now list. Read-only. Pipeline area, viewer+.
import { NextResponse } from 'next/server';
import { resolveAdminSession, areaGate } from '@/lib/admin-session';
import { listOutreach } from '@/lib/outreach-server';
import { signedOut, outreachRole, viewerOf } from './gate';

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, false);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  return NextResponse.json(await listOutreach());
}
