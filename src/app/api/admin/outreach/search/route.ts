// Inquiries data (Cam 2026-11-17): "Find the course" in Add a course — public OpenStreetMap listings
// (lib/course-lookup: 1 request a second platform-wide, a generic User-Agent, public business facts only),
// each with whether it is already on the outreach list or on GreenReserve.
// GET ?q=<course name>&near=<town, state>. Pipeline area, manager+ (only managers add courses).
import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminSession, areaGate } from '@/lib/admin-session';
import { lookupCourses } from '@/lib/course-lookup';
import { duplicatePool, dupFlags } from '@/lib/outreach-server';
import { findDuplicates } from '@/lib/outreach';
import { signedOut, outreachRole, viewerOf } from '../gate';

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return signedOut();
  const noArea = areaGate(session, 'pipeline');
  if (noArea) return noArea;
  const denied = outreachRole(session, true);
  if (denied) return denied;
  const g = { session, viewer: viewerOf(session) };
  const r = await lookupCourses(req.nextUrl.searchParams.get('q') ?? '', req.nextUrl.searchParams.get('near') ?? '', g.session.adminId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const pool = r.results.length ? await duplicatePool() : [];
  return NextResponse.json({
    attribution: r.attribution,
    results: r.results.map(x => ({ ...x, ...dupFlags(findDuplicates(x, pool)) })),
  });
}
