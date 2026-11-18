import { NextRequest, NextResponse } from 'next/server';
import { teamHistory } from '@/lib/team';
import { teamOwner } from '@/lib/team-route';

// Team audit log (Cam 2026-11-17): every invite, role and access change,
// disable, remove and reset link, newest first. ?target=<person or role id>
// for one; ?take= up to 200. Owner only; always this course's rows.
export async function GET(req: NextRequest) {
  const g = await teamOwner(req, { write: false }); if ('error' in g) return g.error;
  const target = req.nextUrl.searchParams.get('target') || undefined;
  const take = Number(req.nextUrl.searchParams.get('take')) || 50;
  return NextResponse.json({ changes: await teamHistory(g.ctx.courseId, target, take) });
}
