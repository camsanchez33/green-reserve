import { NextRequest, NextResponse } from 'next/server';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { prisma } from '@/lib/prisma';
import { courseToWire } from '@/lib/course-wire';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { normalizeHttpUrl, validateSettingsPatch } from '@/lib/settings-validation';
import { CHANGES_REQUESTED_PREFIX, LEGACY_CHANGES_REQUESTED_MARKER, isChangesRequestedEvent } from '@/lib/change-requests';

// Never cache — the dashboard's live/draft banner reads this and must
// reflect the DB the moment admin flips it, not a stale open-tab response.
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const course = await prisma.course.findUnique({ where: { id: session.courseId } });
  if (!course) return NextResponse.json(course);

  let pageApprovalStatus: 'none' | 'approved' | 'changes_requested' = 'none';
  if (!course.active || course.liveStatus !== 'live') {
    const inquiry = await prisma.courseInquiry.findFirst({ where: { builtCourseId: course.id }, select: { id: true } });
    if (inquiry) {
      const [latest] = await prisma.inquiryStatusEvent.findMany({
        where: {
          inquiryId: inquiry.id,
          OR: [
            { actorName: 'Course approved their page' },
            { actorName: LEGACY_CHANGES_REQUESTED_MARKER },
            { actorName: { startsWith: CHANGES_REQUESTED_PREFIX } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      if (latest?.actorName === 'Course approved their page') pageApprovalStatus = 'approved';
      else if (isChangesRequestedEvent(latest?.actorName)) pageApprovalStatus = 'changes_requested';
    }
  }

  // MP-3 B2b: cents at rest, dollars on the wire — the dashboard reads dollar
  // field names (dashboard/settings, dashboard/cancellations).
  return NextResponse.json({ ...operatorSafe(courseToWire(course)), pageApprovalStatus });
}

export async function PATCH(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.isStaff) return NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 });
  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3

  const body = await req.json();
  const course = await prisma.course.findUnique({ where: { id: session.courseId } });
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });

  // SD-1: same rule as the settings route — a URL golfers get sent to is
  // http(s) or nothing.
  for (const k of ['website', 'bookingUrl'] as const) {
    if (body[k] !== undefined && body[k] !== null) {
      const u = normalizeHttpUrl(body[k]);
      if (u === null) return NextResponse.json({ error: `${k} must be a web address starting with http:// or https://.` }, { status: 400 });
      body[k] = u;
    }
  }
  // SD-11: the rest was written raw (holes: "abc" → NaN → 500; type: anything).
  // Same rules as the Settings route, then the checked values replace the body's.
  // SD-8 review (HIGH): 'name', 'city', 'state', 'address' and 'active' are NOT
  // here. Settings shows them read-only behind a Request-a-change button and
  // the settings route already refuses them — but this route wrote them from
  // the RAW body, so the lock was decoration until both lists agreed.
  // 'active' additionally has to go: flipping it false takes the course off the
  // public site while confirmed bookings stand with cards on file, which is
  // exactly what lib/course-closure.ts exists to prevent. The admin archive
  // path goes through that; an operator PATCH never did.
  const checked = validateSettingsPatch(body, ['type', 'phone', 'description', 'holes', 'par', 'yardage', 'slope', 'brandColor', 'establishedYear']);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  Object.assign(body, checked.data);

  const updated = await prisma.course.update({
    where: { id: session.courseId },
    data: {
      // name/city/state/address/active are deliberately absent — see above.
      type: body.type ?? course.type,
      phone: body.phone ?? course.phone,
      website: body.website ?? course.website,
      bookingUrl: body.bookingUrl ?? course.bookingUrl,
      description: body.description ?? course.description,
      holes: body.holes ? Number(body.holes) : course.holes,
      par: body.par ? Number(body.par) : course.par,
      yardage: body.yardage ? Number(body.yardage) : course.yardage,
      slope: body.slope ? Number(body.slope) : course.slope,
      brandColor: body.brandColor ?? course.brandColor,
      establishedYear: body.establishedYear !== undefined ? (body.establishedYear ? Number(body.establishedYear) : null) : course.establishedYear,
    },
  });
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
