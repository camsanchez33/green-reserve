import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ipOk = await rateLimit('alert:ip:' + ip, 10, 300);
  if (!ipOk) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json();
  const { courseId, email, name, date, windowStart, windowEnd, players, teeTimeId } = body;

  if (!courseId || !email || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const emailOk = await rateLimit('alert:email:' + normalizedEmail, 20, 3600);
  if (!emailOk) return NextResponse.json({ error: 'Too many alerts from this email' }, { status: 429 });

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  // Idempotent: return existing if same alert already set and not notified
  const existing = await prisma.teeTimeAlert.findFirst({
    where: {
      courseId,
      email: normalizedEmail,
      date,
      teeTimeId: teeTimeId ?? null,
      notifiedAt: null,
    },
  });
  if (existing) return NextResponse.json({ success: true, id: existing.id });

  const alert = await prisma.teeTimeAlert.create({
    data: {
      courseId,
      email: normalizedEmail,
      name: name || '',
      date,
      windowStart: windowStart || '',
      windowEnd: windowEnd || '',
      players: Number(players) || 1,
      teeTimeId: teeTimeId || null,
    },
  });

  return NextResponse.json({ success: true, id: alert.id });
}
