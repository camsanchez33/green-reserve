import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { courseWeather } from '@/lib/weather';

// HOME-W (Cam 2026-11-05): the hourly forecast at the course for Home's top bar (src/lib/weather.ts).
// Any login that sees the tee sheet. Its own request so Home never waits on weather.gov.
export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'sheet.view'); if (denied) return denied; }
  const c = await prisma.course.findUnique({ where: { id: session.courseId }, select: { address: true, city: true, state: true, zipCode: true } });
  return NextResponse.json(await courseWeather(c ?? {}), { headers: { 'Cache-Control': 'no-store' } });
}
