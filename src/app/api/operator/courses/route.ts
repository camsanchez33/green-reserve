import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOperatorSession } from '@/lib/auth';

export async function GET() {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const course = await prisma.course.findFirst({
    where: { operator: { id: session.operatorId } },
  });
  return NextResponse.json(course);
}

export async function PATCH(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const course = await prisma.course.findFirst({
    where: { operator: { id: session.operatorId } },
  });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  const updated = await prisma.course.update({
    where: { id: course.id },
    data: {
      name: body.name,
      type: body.type,
      city: body.city,
      state: body.state,
      address: body.address,
      phone: body.phone,
      website: body.website,
      description: body.description,
      amenities: body.amenities,
      walkingAllowed: body.walkingAllowed,
      cartRequired: body.cartRequired,
      baseGreenFee: body.baseGreenFee,
      cartFee: body.cartFee,
      holes: body.holes,
      par: body.par,
      active: true,
    },
  });
  return NextResponse.json(updated);
}
