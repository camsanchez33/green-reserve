import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findUnique({ where: { id: session.courseId } });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 2FA settings live on CourseOperator, not Course — staff have no such setting.
  // Exposed as twoFactorPhone (not phone) to avoid clobbering the course's business phone number.
  let twoFactorMethod = 'email';
  let twoFactorPhone = '';
  if (session.operatorId) {
    const operator = await prisma.courseOperator.findUnique({ where: { id: session.operatorId }, select: { twoFactorMethod: true, phone: true } });
    twoFactorMethod = operator?.twoFactorMethod ?? 'email';
    twoFactorPhone = operator?.phone ?? '';
  }

  return NextResponse.json({ ...course, twoFactorMethod, twoFactorPhone });
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

  // 2FA settings live on CourseOperator, not Course — can't go in the whitelist above.
  if (session.operatorId && ('twoFactorMethod' in body || 'twoFactorPhone' in body)) {
    const operatorData: Record<string, unknown> = {};
    if ('twoFactorMethod' in body) operatorData.twoFactorMethod = body.twoFactorMethod === 'sms' ? 'sms' : 'email';
    if ('twoFactorPhone' in body) operatorData.phone = String(body.twoFactorPhone || '');
    await prisma.courseOperator.update({ where: { id: session.operatorId }, data: operatorData });
  }

  return NextResponse.json(updated);
}
