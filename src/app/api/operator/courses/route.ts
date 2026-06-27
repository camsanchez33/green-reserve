import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findUnique({ where: { id: session.courseId } });
  return NextResponse.json(course);
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const course = await prisma.course.findUnique({ where: { id: session.courseId } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const updated = await prisma.course.update({
    where: { id: session.courseId },
    data: {
      name: body.name ?? course.name,
      type: body.type ?? course.type,
      city: body.city ?? course.city,
      state: body.state ?? course.state,
      address: body.address ?? course.address,
      phone: body.phone ?? course.phone,
      website: body.website ?? course.website,
      bookingUrl: body.bookingUrl ?? course.bookingUrl,
      description: body.description ?? course.description,
      holes: body.holes ? Number(body.holes) : course.holes,
      par: body.par ? Number(body.par) : course.par,
      yardage: body.yardage ? Number(body.yardage) : course.yardage,
      slope: body.slope ? Number(body.slope) : course.slope,
      active: body.active !== undefined ? body.active : course.active,
    },
  });
  return NextResponse.json(updated);
}
