import { NextRequest } from 'next/server';
import { createRole, deleteRole, reorderRoles, updateRole } from '@/lib/team';
import { jsonBody, teamOwner, teamResponse } from '@/lib/team-route';

// Team roles (Cam 2026-11-17). Owner only (lib/team-route). The Owner role ('owner') is not a row: every write on it is 404.

// POST { fromSuggested } adds a Suggested role; POST { name, permissions? | areas? } makes one (either may override the suggestion).
export async function POST(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await createRole(g.ctx, await jsonBody(req)));
}

// PATCH { id, name?, permissions? | areas?, dryRun? } — changes everyone in the role; answers { people, affected, saved }.
//   dryRun: true answers without saving, so the editor can say how many people a save changes.
// PATCH { order: roleId[] } — the rank order on Team.
export async function PATCH(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  const body = await jsonBody(req);
  if ('order' in body) return teamResponse(await reorderRoles(g.ctx, body.order));
  return teamResponse(await updateRole(g.ctx, body.id, body));
}

// DELETE { id } — refused (409, with a sentence) while anyone on the team has the role.
export async function DELETE(req: NextRequest) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await deleteRole(g.ctx, (await jsonBody(req)).id));
}
