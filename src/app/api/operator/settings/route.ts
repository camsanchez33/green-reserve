import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { courseToWire, courseMoneyFromWire } from '@/lib/course-wire';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { validateSettingsPatch } from '@/lib/settings-validation';

// Never cache — the dashboard's live/draft status must reflect the DB the
// moment admin flips it, not a stale response served to an already-open tab.
export const dynamic = 'force-dynamic';

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

  // MP-3 B2b: cents at rest, dollars on the wire — the settings form was not
  // changed and still sends/receives dollar field names.
  return NextResponse.json({ ...operatorSafe(courseToWire(course)), twoFactorMethod, twoFactorPhone });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  const body = await req.json();
  // Whitelist what can be updated
  const allowed = [
    // SD-8: name/address/city/state/zipCode are NOT here. They are what
    // GreenReserve listed and what golfers search for, so an operator asks us
    // (Settings shows them read-only with a Request a change button) and admin
    // makes the change through /api/admin/courses. Without this the read-only
    // row would be decoration a crafted request walks straight past.
    'phone','website','description',
    'holes','par','yardage','slope','courseRating','type',
    'hasMemberPricing','memberAdvanceDays',
    'hasResidentPricing','residentCounty','residentState','residentProofRequired',
    'walkingAllowed','walkingNote','cartRequired',
    'cancellationHours','checkInWindowHours','rainCheckPolicy','publicAdvanceDays','timezone',
    'dresscode','minPlayers','maxPlayers',
    'hasDrivingRange','drivingRangeType','rangeBallsFree','hasPuttingGreen','hasShortGameArea',
    'hasProShop','proShopPhone','restaurantType','hasCartGirl','hasLessons','hasClubRental',
    'hasPushCartRental','hasBagStorage','hasLockerRoom','hasGpsCarts',
    'hasTournaments','tournamentFrequency','hasCaddies','caddieType','caddieNote',
    'amenities',
    'brandColor','establishedYear','giftCardUrl',
  ];
  // SD-1: this used to copy every allow-listed key straight into the row —
  // negative hole counts, a 40KB description, a javascript: gift-card URL that
  // the golfer page renders as a raw href. The API is the boundary.
  const checked = validateSettingsPatch(body, allowed);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const data: Record<string, unknown> = checked.data;
  // Money arrives in dollars under its old field names; courseMoneyFromWire
  // maps each to its *Cents column. They are deliberately OUT of the allowlist
  // above so a raw dollar value can never be written into a cents column.
  // SD review: the dollar→cents conversion accepts any magnitude and sign.
  // Bound the one that becomes a card charge without a person in the loop.
  const money = courseMoneyFromWire(body);
  // SD-8 review (LOW): only the fee that becomes a card charge was bounded.
  // The other seven accepted negatives and any magnitude — they are only shown
  // to golfers, never charged, but a -$5,000 club rental is still nonsense on
  // a public page. dollarsToCentsOr0 coerces anything finite, sign included.
  for (const [k, c] of Object.entries(money)) {
    // The cancellation fee becomes an automatic card charge, so it keeps the
    // tight ceiling. The rest are ancillary rates shown to golfers and never
    // charged here — a caddie at a top club can legitimately exceed $500, so
    // they get a loose ceiling that still rules out nonsense.
    const isCharge = k === 'lateCancellationFeeCents';
    const max = isCharge ? 50000 : 500000;
    if (!Number.isFinite(c) || c < 0 || c > max) {
      const label = isCharge ? 'Late-cancellation fee' : 'That rate';
      return NextResponse.json({ error: `${label} must be between $0 and $${(max / 100).toLocaleString()}.` }, { status: 400 });
    }
  }
  Object.assign(data, money);
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

// SD-8 review (MEDIUM): courseToWire spreads the whole Course row. Two columns
// on it are internal: `adminNotes` is GreenReserve's own build commentary (the
// admin console renders it as [BUILD NOTES]) and `stripeAccountId` is the
// connected account id. The admin API already strips both for lower-role
// admins; the operator API was shipping them to every dashboard session,
// staff included. Stripped here rather than in courseToWire, because the admin
// routes that share that helper legitimately render them.
function operatorSafe(wire: Record<string, unknown>) {
  const { adminNotes: _adminNotes, stripeAccountId: _stripeAccountId, ...rest } = wire;
  return rest;
}
