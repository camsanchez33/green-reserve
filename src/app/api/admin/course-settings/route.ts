import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { courseToWire, courseMoneyFromWire } from '@/lib/course-wire';
import { resolveAdminSession, requireRole, MANAGER_PLUS, SUPPORT_PLUS } from '@/lib/admin-session';
import { logSettingsChanged } from '@/lib/course-timeline';

// GET /api/admin/course-settings?courseId=X — full course record for the admin editor
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // MP-2c: findUnique with no select ships the whole Course row, stripeAccountId included.
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const courseId = req.nextUrl.searchParams.get('courseId');
  if (!courseId) return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // MP-3 B2b: cents at rest, dollars on the wire — the admin settings form
  // was not changed and still reads dollar field names.
  return NextResponse.json(courseToWire(course));
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
    'hasProShop','proShopPhone','restaurantType','hasCartGirl','hasLessons','hasClubRental',
    'hasPushCartRental','hasBagStorage','hasLockerRoom','hasGpsCarts',
    'hasTournaments','tournamentFrequency','hasCaddies','caddieType','caddieNote',
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
  // MP-3 B2b: money arrives in dollars under its old field names and is
  // mapped to the *Cents columns here. Deliberately out of the allowlist so a
  // raw dollar value can never be written straight into a cents column.
  Object.assign(data, courseMoneyFromWire(body));
  const updated = await prisma.course.update({ where: { id: courseId }, data });

  if (before) {
    const changes = keys
      .filter(k => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(data[k]))
      .map(k => ({ field: k, from: (before as Record<string, unknown>)[k], to: data[k] }));
    if (changes.length > 0) await logSettingsChanged(courseId, changes, session.name);
  }

  return NextResponse.json(updated);
}
