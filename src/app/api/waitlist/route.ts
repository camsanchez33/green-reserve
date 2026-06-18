import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGolferSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { teeTimeId, name, email, phone, players } = await req.json();
  if (!teeTimeId || !name || !email) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const teeTime = await prisma.teeTime.findUnique({ where: { id: teeTimeId } });
  if (!teeTime) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const golferSession = await getGolferSession();

  // Check not already on waitlist
  const existing = await prisma.waitlist.findFirst({ where: { teeTimeId, email } });
  if (existing) return NextResponse.json({ error: 'Already on waitlist' }, { status: 409 });

  const entry = await prisma.waitlist.create({
    data: {
      teeTimeId,
      courseId: teeTime.courseId,
      golferId: golferSession?.golferId || null,
      name, email, phone: phone || '',
      players: players || 1,
    },
  });

  return NextResponse.json({ success: true, id: entry.id });
}
