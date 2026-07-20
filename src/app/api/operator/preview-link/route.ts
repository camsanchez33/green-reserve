import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { signPreviewToken } from '@/lib/preview-token';

// Lets an operator open their own booking-page preview from the Getting
// Started checklist (V13) — reuses the same stateless preview token (V10)
// admin sends by email, just self-served since they're already logged in.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { id: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const token = await signPreviewToken(course.id);
  const base = process.env.NEXT_PUBLIC_URL || '';
  return NextResponse.json({ url: `${base}/preview/${course.id}?token=${token}` });
}
