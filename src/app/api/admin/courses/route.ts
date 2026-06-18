import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function checkAdmin(req: NextRequest) {
  return req.headers.get('x-admin-key') === process.env.ADMIN_SECRET;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const courses = await prisma.course.findMany({
    include: { operator: { select: { email: true, name: true, onboardingStep: true, emailVerified: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(courses);
}
