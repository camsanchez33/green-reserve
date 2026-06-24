import { NextResponse } from 'next/server';
import { getOperatorSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateTeeTimes } from '@/lib/tee-sheet-engine';

/**
 * POST /api/operator/regenerate-tee-times
 * Replays tee time generation for the next 8 days using current schedules.
 * Safe to run at any time — booked and manually-blocked slots are never touched.
 */
export async function POST() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findFirst({ where: { operator: { id: session.operatorId } } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const today = new Date();
  let created = 0;
  const errors: string[] = [];

  for (let i = 0; i < 8; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    try {
      created += await generateTeeTimes(course.id, dateStr);
    } catch (err) {
      errors.push(`${dateStr}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ success: true, created, errors });
}
