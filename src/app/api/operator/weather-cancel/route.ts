import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { todayIn } from '@/lib/course-time';
import { formatTeeTime, formatTeeDate } from '@/lib/format';
import { planWeatherCancel, applyWeatherCancel, isWeatherTime } from '@/lib/weather-cancel';

// WX-1 weather cancel. POST { date, from?, to?, reason?, apply }. No from/to =
// the whole day. Without `apply` it returns the plan (which groups would be
// cancelled) and changes nothing; with `apply: true` it re-plans from the
// current sheet and applies that. Staff can run it — they can already cancel a
// booking one at a time, and on a storm day they are the ones at the counter.
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { date?: unknown; from?: unknown; to?: unknown; reason?: unknown; apply?: unknown };
  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '';
  if (!date) return NextResponse.json({ error: 'Pick the day.' }, { status: 400 });
  const from = typeof body.from === 'string' ? body.from.slice(0, 5) : '';
  const to = typeof body.to === 'string' ? body.to.slice(0, 5) : '';
  let window: { from: string; to: string } | null = null;
  if (from || to) {
    // "To" may be 24:00 — end of day.
    if (!isWeatherTime(from) || !(isWeatherTime(to) || to === '24:00')) return NextResponse.json({ error: 'Pick a start and end time.' }, { status: 400 });
    if (to <= from) return NextResponse.json({ error: 'The end time has to be after the start time.' }, { status: 400 });
    window = { from, to };
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';

  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { timezone: true, name: true } });
  if (date < todayIn(course?.timezone)) return NextResponse.json({ error: 'That day has already passed.' }, { status: 409 });

  const plan = await planWeatherCancel(session.courseId, date, window, course?.timezone);
  if (body.apply !== true) return NextResponse.json({ plan });

  const agreementBlock = await requireAgreementCurrent(session.courseId); if (agreementBlock) return agreementBlock; // AG-3 §3
  if (plan.teeTimeIds.length === 0) return NextResponse.json({ error: 'There are no upcoming tee times in that window.' }, { status: 409 });

  const name = course?.name ?? 'The course';
  const span = window ? `from ${formatTeeTime(window.from)}${window.to === '24:00' ? '' : ` to ${formatTeeTime(window.to)}`}` : 'for the day';
  const why = `${name} has called off play on ${formatTeeDate(date)} ${span} because of the weather${reason ? ` (${reason})` : ''}, so your round has been cancelled. Nothing is owed — any hold already taken is refunded. Sorry for the day.`;
  const result = await applyWeatherCancel(session.courseId, plan, { type: 'staff', id: session.staffId ?? session.operatorId }, why, reason);
  console.log(JSON.stringify({ ev: 'weather_cancel.applied', courseId: session.courseId, date, from: plan.from, to: plan.to, cancelled: result.cancelled.length, failed: result.failed.length, blocked: result.blocked, by: session.email }));
  return NextResponse.json(result);
}
