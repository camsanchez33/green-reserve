import { NextRequest, NextResponse } from 'next/server';
import { loadTeam } from '@/lib/team';
import { teamOwner } from '@/lib/team-route';

// Team (Cam 2026-11-17): the whole page in one read — Owner, roles in rank
// order with their people, Suggested roles not yet added, and the six areas.
// Owner only (lib/team-route).
export async function GET(req: NextRequest) {
  const g = await teamOwner(req, { write: false }); if ('error' in g) return g.error;
  const data = await loadTeam(g.ctx.courseId, g.ctx.operatorId);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
