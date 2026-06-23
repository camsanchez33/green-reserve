import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findUnique({ where: { id: session.courseId } });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // twoFactorEnabled lives on CourseOperator, not Course — staff have no such setting.
  let twoFactorEnabled = false;
  if (session.operatorId) {
    const operator = await prisma.courseOperator.findUnique({ where: { id: session.operatorId }, select: { twoFactorEnabled: true } });
    twoFactorEnabled = operator?.twoFactorEnabled ?? false;
  }

  return NextResponse.json({ ...course, twoFactorEnabled });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  // Whitelist what can be updated
  const allowed = [
    'name','phone','website','description','address','city','state','zipCode',
    'holes','par','yardage','slope','courseRating','type',
    'hasMemberPricing','memberAdvanceDays',
    'hasResidentPricing','residentCounty','residentState','residentProofRequired',
    'walkingAllowed','walkingNote','cartRequired',
    'cancellationHours','lateCancellationFee','rainCheckPolicy','publicAdvanceDays',
    'dresscode','minPlayers','maxPlayers',
    'hasDrivingRange','drivingRangeType','rangeBallsFree','hasPuttingGreen','hasShortGameArea',
    'hasProShop','proShopPhone','restaurantType','hasCartGirl','hasLessons','hasClubRental','clubRentalRate',
    'hasPushCartRental','pushCartRate','hasBagStorage','hasLockerRoom','hasGpsCarts',
    'hasTournaments','tournamentFrequency','hasCaddies','caddieType','caddieLooperRate','caddieForeRate','caddieNote',
    'amenities',
  ];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }
  const updated = await prisma.course.update({ where: { id: session.courseId }, data });

  // twoFactorEnabled lives on CourseOperator, not Course — can't go in the whitelist above.
  if ('twoFactorEnabled' in body && session.operatorId) {
    await prisma.courseOperator.update({ where: { id: session.operatorId }, data: { twoFactorEnabled: !!body.twoFactorEnabled } });
  }

  return NextResponse.json(updated);
}
