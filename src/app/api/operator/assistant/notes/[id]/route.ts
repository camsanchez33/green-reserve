import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { readNote } from '@/lib/assistant/settings';
import { actorFor, deleteNote, updateNote } from '@/lib/assistant/save';

// ASSIST-1: edit or remove one of the course's notes. The id only matches inside the session's own course.

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const denied = requirePermission(session, 'settings.edit'); if (denied) return { res: denied } as const;
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return { res: agreementBlock } as const;
  return { session } as const;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await gate(); if ('res' in g) return g.res;
  const { id } = await ctx.params;
  const input = readNote(await req.json().catch(() => null));
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const note = await updateNote(g.session.courseId, String(id ?? ''), input.data, await actorFor(g.session));
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ note });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await gate(); if ('res' in g) return g.res;
  const { id } = await ctx.params;
  const ok = await deleteNote(g.session.courseId, String(id ?? ''), await actorFor(g.session));
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
