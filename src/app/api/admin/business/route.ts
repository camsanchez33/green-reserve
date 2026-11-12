import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, MANAGER_PLUS, areaGate } from '@/lib/admin-session';
import { REAL_COURSE } from '@/lib/real-courses';
import { hasArea } from '@/lib/admin-areas';
import { PLATFORM_TZ } from '@/lib/admin-day';
import { parseFinancePeriod, resolveFinancePeriod } from '@/lib/finance-period';
import { milestones, joiningFunnel, averageFill, fillPct } from '@/lib/business-analytics';
import { ACTIVE_STATUSES, queueSignal } from '@/lib/inquiry-status';

// ADMIN-REDO Business analytics (Cam 2026-11-12, ADMIN_REDO_SPEC "Business analytics: APPROVED"; decisions relayed
// by Build 2026-11-12). Course-focused, nothing about who is golfing. Manager+ in Courses. Read-only; every figure is
// counted, never estimated; TEST-2 throughout (test courses, and inquiries built into one, are left out).
// Periods are Finance's (lib/finance-period): y12 · m6 · m3 · ytd, each with the stretch before.
//
//   liveCourses        live now (active, liveStatus 'live', not archived). prior: null — nothing records when a
//                      course was switched off and on (as Revenue).
//   onlineBookings     source 'online', confirmed or completed, made in the window ("still on"); a split-off part
//                      (splitFromId) is part of its group, not a booking made (as Analytics and Admin Home).
//   teeSheetFill       per live course, players ÷ spots on its times that went off in the window (lib/day-fill's
//                      rule), averaged across courses (lib/business-analytics averageFill).
//   months             bookings made in each month by channel: online · phone & counter (phone, walk_in).
//   value              "What courses get from us" in the period, counted:
//     onlineGreenFeesCents  green fees on those online bookings (booked, not collected)
//     afterHours            online bookings made outside that day's tee-sheet hours — before its first tee time,
//                           after its last, or on a day with no times offered (blocked ones aren't), on the course's clock ("Booked outside
//                           tee-sheet hours"; we keep no shop hours)
//     paidBeforeArrival     rounds the golfer paid themselves (pay link: checked_in by the golfer) at or before the
//                           tee time, with paidAt in the window; cents = the course's share of those round payments
//                           (GreenReserve's fee riding along taken out, as for the fees below)
//     noShowLateFeesCents   the course's own no-show, late-cancel and kept-hold money (course account, given back
//                           subtracted; a hold refunded at check-in nets to 0). GreenReserve's booking fee excluded.
//   joining            the courses-joining funnel (lib/business-analytics), cohort = first contact in the period;
//                      inProgress / waitingOnUs are now (active inquiries; waiting on us = the Pipeline queue's rule).
//   courses            per real course live now or with online bookings in the period (or, with Money, revenue).
//                      ourRevenueCents: GreenReserve's revenue from the course (platformFeeCents in − out), only
//                      for a login with the Money area; null otherwise.
//
// Timestamps: the tables' DateTime columns are zone-less UTC, so every bound instant is compared as
// (${d}::timestamptz AT TIME ZONE 'UTC'), never by the session's TimeZone.

type AfterRow = { total: bigint | number; after: bigint | number };
type CourseRow = { courseId: string; online: bigint; onlinePrior: bigint; total: bigint; greenFees: bigint | null };
type MonthRow = { month: string; online: boolean; n: bigint };
type FillRow = { courseId: string; players: bigint | null; spots: bigint | null; playersPrior: bigint | null; spotsPrior: bigint | null };
type RevRow = { courseId: string; cents: bigint };

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const noArea = areaGate(session, 'courses');
  if (noArea) return noArea;

  // GreenReserve's revenue per course stays behind Money, as the Revenue page does (Build 2026-11-12): without the
  // Money area it is not read, and each course's ourRevenueCents is null (the page hides the column).
  const seesRevenue = hasArea(session, 'money');
  const now = new Date();
  const p = resolveFinancePeriod(parseFinancePeriod(req.nextUrl.searchParams.get('period')), now);
  const cur = { start: p.current.start, end: now };
  const prior = p.prior;
  const earliest = prior.start < cur.start ? prior.start : cur.start;
  // A day either side, on the calendar strings tee times are stored by, so the window's instants are covered in any zone.
  const dayFrom = new Date(earliest.getTime() - 86_400_000).toISOString().slice(0, 10);
  const dayTo = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);

  const [byCourse, byMonth, afterRows, paidRows, feeRows, fillRows, revRows, liveCourses, courses] = await Promise.all([
    prisma.$queryRaw<CourseRow[]>`
      SELECT b."courseId",
        COUNT(*) FILTER (WHERE b."splitFromId" IS NULL AND b."source" = 'online' AND b."createdAt" >= (${cur.start}::timestamptz AT TIME ZONE 'UTC'))::bigint AS online,
        COUNT(*) FILTER (WHERE b."splitFromId" IS NULL AND b."source" = 'online' AND b."createdAt" >= (${prior.start}::timestamptz AT TIME ZONE 'UTC') AND b."createdAt" < (${prior.end}::timestamptz AT TIME ZONE 'UTC'))::bigint AS "onlinePrior",
        COUNT(*) FILTER (WHERE b."splitFromId" IS NULL AND b."createdAt" >= (${cur.start}::timestamptz AT TIME ZONE 'UTC'))::bigint AS total,
        -- Green fees include split-off parts: a split moves part of the group's fee onto them, and the parts add up.
        SUM(b."greenFeeTotal") FILTER (WHERE b."source" = 'online' AND b."createdAt" >= (${cur.start}::timestamptz AT TIME ZONE 'UTC'))::bigint AS "greenFees"
      FROM "Booking" b JOIN "Course" c ON c."id" = b."courseId"
      WHERE c."isTest" = false AND b."status" IN ('confirmed', 'completed')
        AND b."createdAt" >= (${earliest}::timestamptz AT TIME ZONE 'UTC') AND b."createdAt" < (${now}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1`,
    prisma.$queryRaw<MonthRow[]>`
      SELECT to_char(b."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${PLATFORM_TZ}, 'YYYY-MM') AS month, (b."source" = 'online') AS online, COUNT(*)::bigint AS n
      FROM "Booking" b JOIN "Course" c ON c."id" = b."courseId"
      WHERE c."isTest" = false AND b."status" IN ('confirmed', 'completed') AND b."splitFromId" IS NULL
        AND b."createdAt" >= (${cur.start}::timestamptz AT TIME ZONE 'UTC') AND b."createdAt" < (${now}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1, 2`,
    prisma.$queryRaw<AfterRow[]>`
      WITH ob AS (
        SELECT b."courseId", to_char(b."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE c."timezone", 'YYYY-MM-DD') AS d,
               to_char(b."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE c."timezone", 'HH24:MI') AS hm
        FROM "Booking" b JOIN "Course" c ON c."id" = b."courseId"
        WHERE c."isTest" = false AND b."source" = 'online' AND b."status" IN ('confirmed', 'completed') AND b."splitFromId" IS NULL
          AND b."createdAt" >= (${cur.start}::timestamptz AT TIME ZONE 'UTC') AND b."createdAt" < (${now}::timestamptz AT TIME ZONE 'UTC')
      ), day AS (
        -- The day's tee-sheet hours: its first and last times that were offered (a blocked time isn't).
        SELECT t."courseId", t."date", MIN(t."time") AS first, MAX(t."time") AS last
        FROM "TeeTime" t WHERE t."status" <> 'blocked' AND (t."courseId", t."date") IN (SELECT DISTINCT "courseId", d FROM ob)
        GROUP BY 1, 2
      )
      SELECT COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE day.first IS NULL OR ob.hm < day.first OR ob.hm > day.last)::bigint AS after
      FROM ob LEFT JOIN day ON day."courseId" = ob."courseId" AND day."date" = ob.d`,
    prisma.$queryRaw<{ n: bigint; cents: bigint | null }[]>`
      SELECT COUNT(*)::bigint AS n, SUM(r.cents)::bigint AS cents
      FROM "Booking" b JOIN "Course" c ON c."id" = b."courseId" JOIN "TeeTime" t ON t."id" = b."teeTimeId"
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(CASE WHEN m."direction" = 'out' THEN -(m."amountCents" - m."platformFeeCents") ELSE m."amountCents" - m."platformFeeCents" END), 0) AS cents
        FROM "MoneyMove" m WHERE m."bookingId" = b."id" AND m."what" = 'round' AND m."account" = 'course'
      ) r
      WHERE c."isTest" = false AND b."paidAt" IS NOT NULL
        AND b."paidAt" >= (${cur.start}::timestamptz AT TIME ZONE 'UTC') AND b."paidAt" < (${now}::timestamptz AT TIME ZONE 'UTC')
        AND (b."paidAt" AT TIME ZONE 'UTC') <= ((t."date" || ' ' || t."time")::timestamp AT TIME ZONE c."timezone")
        AND EXISTS (SELECT 1 FROM "BookingEvent" e WHERE e."bookingId" = b."id" AND e."type" = 'checked_in' AND e."actorType" = 'golfer')`,
    prisma.$queryRaw<{ cents: bigint | null }[]>`
      SELECT SUM(CASE WHEN m."direction" = 'out' THEN -(m."amountCents" - m."platformFeeCents") ELSE m."amountCents" - m."platformFeeCents" END)::bigint AS cents
      FROM "MoneyMove" m JOIN "Course" c ON c."id" = m."courseId"
      WHERE c."isTest" = false AND m."account" = 'course' AND m."what" IN ('no_show_fee', 'late_fee', 'hold')
        AND m."at" >= (${cur.start}::timestamptz AT TIME ZONE 'UTC') AND m."at" < (${now}::timestamptz AT TIME ZONE 'UTC')`,
    // lib/day-fill's rule: players = the time's non-cancelled bookings; a blocked time with nobody on it is not
    // offered; spots = the players on a blocked time, otherwise at least playersAvailable.
    prisma.$queryRaw<FillRow[]>`
      WITH tt AS (
        SELECT t."courseId", t."status", t."playersAvailable",
               ((t."date" || ' ' || t."time")::timestamp AT TIME ZONE c."timezone") AS starts,
               COALESCE(SUM(b."players") FILTER (WHERE b."status" <> 'cancelled'), 0) AS players
        FROM "TeeTime" t JOIN "Course" c ON c."id" = t."courseId" LEFT JOIN "Booking" b ON b."teeTimeId" = t."id"
        WHERE c."isTest" = false AND c."active" = true AND c."liveStatus" = 'live' AND c."archivedAt" IS NULL
          AND t."date" >= ${dayFrom} AND t."date" <= ${dayTo}
        GROUP BY t."id", c."id"
      ), offered AS (
        SELECT "courseId", starts, players, CASE WHEN "status" = 'blocked' THEN players ELSE GREATEST("playersAvailable", players) END AS spots
        FROM tt WHERE NOT ("status" = 'blocked' AND players = 0)
      )
      SELECT "courseId",
        SUM(players) FILTER (WHERE starts >= ${cur.start}::timestamptz AND starts < ${now}::timestamptz)::bigint AS players,
        SUM(spots)   FILTER (WHERE starts >= ${cur.start}::timestamptz AND starts < ${now}::timestamptz)::bigint AS spots,
        SUM(players) FILTER (WHERE starts >= ${prior.start}::timestamptz AND starts < ${prior.end}::timestamptz)::bigint AS "playersPrior",
        SUM(spots)   FILTER (WHERE starts >= ${prior.start}::timestamptz AND starts < ${prior.end}::timestamptz)::bigint AS "spotsPrior"
      FROM offered GROUP BY 1`,
    !seesRevenue ? Promise.resolve([] as RevRow[]) : prisma.$queryRaw<RevRow[]>`
      SELECT m."courseId", SUM(CASE WHEN m."direction" = 'out' THEN -m."platformFeeCents" ELSE m."platformFeeCents" END)::bigint AS cents
      FROM "MoneyMove" m JOIN "Course" c ON c."id" = m."courseId"
      WHERE c."isTest" = false AND m."platformFeeCents" > 0
        AND m."at" >= (${cur.start}::timestamptz AT TIME ZONE 'UTC') AND m."at" < (${now}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1`,
    prisma.course.count({ where: { active: true, liveStatus: 'live', archivedAt: null, ...REAL_COURSE } }),
    prisma.course.findMany({ where: REAL_COURSE, select: { id: true, name: true, number: true, active: true, liveStatus: true, archivedAt: true } }),
  ]);

  // ── Cards ──
  const online = byCourse.reduce((s, r) => s + num(r.online), 0);
  const onlinePrior = byCourse.reduce((s, r) => s + num(r.onlinePrior), 0);
  const fillCur = fillRows.map(r => ({ players: num(r.players), spots: num(r.spots) }));
  const fillPrior = fillRows.map(r => ({ players: num(r.playersPrior), spots: num(r.spotsPrior) }));

  // ── Months ──
  const months = p.months.map(m => ({ month: m.month, partial: m.partial, online: 0, counter: 0 }));
  const monthIdx = new Map(months.map((m, i) => [m.month, i]));
  for (const r of byMonth) {
    const i = monthIdx.get(r.month);
    if (i == null) continue;
    if (r.online) months[i].online += num(r.n); else months[i].counter += num(r.n);
  }

  // ── What courses get from us ──
  const after = afterRows[0] ?? { total: 0, after: 0 };
  const afterTotal = num(after.total);

  // ── Courses joining ──
  const inquiries = await prisma.courseInquiry.findMany({
    select: {
      createdAt: true, status: true, wentLiveAt: true, builtCourseId: true, snoozeUntil: true, nextFollowUpAt: true, callInviteSentAt: true,
      touches: { select: { at: true, direction: true } },
      events: { select: { fromStatus: true, toStatus: true, actorName: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      calls: { where: { kind: 'discovery' }, select: { outcome: true, scheduledAt: true, completedAt: true, bookedByCourse: true } },
    },
  });
  const builtIds = [...new Set(inquiries.map(i => i.builtCourseId).filter((x): x is string => !!x))];
  const [built, signed] = builtIds.length
    ? await Promise.all([
        prisma.course.findMany({ where: { id: { in: builtIds } }, select: { id: true, createdAt: true, isTest: true } }),
        prisma.agreementAcceptance.groupBy({ by: ['courseId'], where: { courseId: { in: builtIds }, document: 'operator_agreement' }, _min: { acceptedAt: true } }),
      ])
    : [[], []];
  const builtBy = new Map(built.map(c => [c.id, c]));
  const signedBy = new Map(signed.map(s => [s.courseId, s._min.acceptedAt]));
  // TEST-2: an inquiry built into a test course is test data.
  const realInquiries = inquiries.filter(i => !(i.builtCourseId && builtBy.get(i.builtCourseId)?.isTest));
  const marks = realInquiries.map(i => milestones({
    createdAt: i.createdAt, status: i.status, wentLiveAt: i.wentLiveAt, touches: i.touches, events: i.events, calls: i.calls,
    builtAt: i.builtCourseId ? builtBy.get(i.builtCourseId)?.createdAt ?? null : null,
    signedAt: i.builtCourseId ? signedBy.get(i.builtCourseId) ?? null : null,
  }));
  const funnel = joiningFunnel(marks, cur.start, cur.end);
  const active = realInquiries.filter(i => (ACTIVE_STATUSES as string[]).includes(i.status));
  const waitingOnUs = active.filter(i => queueSignal(i, now).waitingOn === 'us').length;

  // ── Courses ──
  const rowBy = new Map(byCourse.map(r => [r.courseId, r]));
  const fillBy = new Map(fillRows.map(r => [r.courseId, { players: num(r.players), spots: num(r.spots) }]));
  const revBy = new Map(revRows.map(r => [r.courseId, num(r.cents)]));
  const courseRows = courses
    .filter(c => (c.active && c.liveStatus === 'live' && !c.archivedAt) || num(rowBy.get(c.id)?.online) > 0 || (revBy.get(c.id) ?? 0) !== 0)
    .map(c => {
      const r = rowBy.get(c.id);
      const total = num(r?.total), on = num(r?.online);
      return {
        courseId: c.id, name: c.name, number: c.number,
        online: on, onlinePrior: num(r?.onlinePrior),
        fillPct: fillPct(fillBy.get(c.id)),
        onlineSharePct: total > 0 ? Math.round((on / total) * 100) : null,
        ourRevenueCents: seesRevenue ? revBy.get(c.id) ?? 0 : null,
      };
    })
    .sort((a, b) => b.online - a.online || a.name.localeCompare(b.name));

  return NextResponse.json({
    period: { kind: p.kind, from: p.from, to: p.to, priorFrom: p.priorFrom, priorTo: p.priorTo },
    cards: {
      liveCourses: { now: liveCourses, prior: null },
      onlineBookings: { count: online, prior: onlinePrior },
      teeSheetFill: { pct: averageFill(fillCur), prior: averageFill(fillPrior) },
    },
    months,
    value: {
      onlineGreenFeesCents: byCourse.reduce((s, r) => s + num(r.greenFees), 0),
      afterHours: { count: num(after.after), pctOfOnline: afterTotal > 0 ? Math.round((num(after.after) / afterTotal) * 100) : null },
      paidBeforeArrival: { count: num(paidRows[0]?.n), cents: num(paidRows[0]?.cents) },
      noShowLateFeesCents: num(feeRows[0]?.cents),
    },
    joining: { ...funnel, inProgress: active.length, waitingOnUs },
    courses: courseRows,
  });
}
