import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession } from '@/lib/admin-session';

// GET /api/admin/course-settings?courseId=X — full course record for the admin editor
export async function GET(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(course);
}

export async function PATCH(req: NextRequest) {
  if (!await resolveAdminSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { courseId, ...rest } = body;
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });

  // Same whitelist the operator's own Settings page can edit.
  const allowed = [
    'name','phone','website','description','address','city','state','zipCode',
    'holes','par','yardage','slope','courseRating','type',
    'hasMemberPricing','memberAdvanceDays',
    'hasResidentPricing','residentCounty','residentState','residentProofRequired',
    'walkingAllowed','walkingNote','cartRequired',
    'cancellationHours','rainCheckPolicy','publicAdvanceDays',
    'dresscode','minPlayers','maxPlayers',
    'hasDrivingRange','drivingRangeType','rangeBallsFree','hasPuttingGreen','hasShortGameArea',
    'hasProShop','proShopPhone','restaurantType','hasCartGirl','hasLessons','hasClubRental','clubRentalRate',
    'hasPushCartRental','pushCartRate','hasBagStorage','hasLockerRoom','hasGpsCarts',
    'hasTournaments','tournamentFrequency','hasCaddies','caddieType','caddieLooperRate','caddieForeRate','caddieNote',
    'amenities',
  ];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in rest) data[key] = rest[key];
  }
  const updated = await prisma.course.update({ where: { id: courseId }, data });
  return NextResponse.json(updated);
}
