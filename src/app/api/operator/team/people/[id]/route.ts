import { NextRequest, NextResponse } from 'next/server';
import { removePerson, setAccess, setActive, updateDetails } from '@/lib/team';
import { jsonBody, teamOwner, teamResponse } from '@/lib/team-route';

// One change per call:
//  PATCH { active: boolean }                         — Disable / turn back on
//  PATCH { roleId?, permissions? | areas? }          — their role and their own access
//  PATCH { name?, phone? }                           — details
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  const id = (await params).id;
  const body = await jsonBody(req);
  const kinds = [
    'active' in body,
    'roleId' in body || 'permissions' in body || 'areas' in body,
    'name' in body || 'phone' in body,
  ].filter(Boolean).length;
  if (kinds !== 1) return NextResponse.json({ error: 'Send one change at a time.' }, { status: 400 });
  if ('active' in body) {
    if (typeof body.active !== 'boolean') return NextResponse.json({ error: 'active must be true or false.' }, { status: 400 });
    return teamResponse(await setActive(g.ctx, id, body.active));
  }
  if ('name' in body || 'phone' in body) return teamResponse(await updateDetails(g.ctx, id, body));
  return teamResponse(await setAccess(g.ctx, id, body));
}

// DELETE — Remove: off the list and signed out; their history keeps their name.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await teamOwner(req, { write: true }); if ('error' in g) return g.error;
  return teamResponse(await removePerson(g.ctx, (await params).id));
}
