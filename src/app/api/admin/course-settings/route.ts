import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { logSettingsChanged } from '@/lib/course-timeline';

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
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  // A-05 item 4c (full mirror, no drift) — every admin-side edit here is
  // logged to the course timeline so the operator's change history stays
  // honest even when Cam makes the fix on the phone with them.
  const keys = Object.keys(data);
  const before = keys.length > 0
    ? await prisma.course.findUnique({ where: { id: courseId }, select: Object.fromEntries(keys.map(k => [k, true])) })
    : null;
  const updated = await prisma.course.update({ where: { id: courseId }, data });

  if (before) {
    const changes = keys
      .filter(k => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(data[k]))
      .map(k => ({ field: k, from: (before as Record<string, unknown>)[k], to: data[k] }));
    if (changes.length > 0) await logSettingsChanged(courseId, changes, session.name);
  }

  return NextResponse.json(updated);
}
