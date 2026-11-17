import { NextRequest } from 'next/server';
import { createRole, reorderRoles } from '@/lib/team';
import { jsonBody, teamOwner, teamResponse } from '@/lib/team-route';

// POST { suggestedKey } adds a Suggested role; POST { name, description?, permissions? | areas? } makes one.
export async function POST(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await createRole(g.ctx, await jsonBody(req)));
}

// PATCH { order: roleId[] } — the rank order on Team.
export async function PATCH(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await reorderRoles(g.ctx, (await jsonBody(req)).order));
}
