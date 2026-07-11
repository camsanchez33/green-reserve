import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const photo = await prisma.coursePhoto.findUnique({ where: { id }, select: { courseId: true, url: true } });
  if (!photo || photo.courseId !== session.courseId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.coursePhoto.delete({ where: { id } });
  try { await del(photo.url); } catch { /* best-effort cleanup, never blocks the delete */ }
  return NextResponse.json({ ok: true });
}
