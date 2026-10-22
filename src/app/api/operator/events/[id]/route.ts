import { NextRequest, NextResponse } from 'next/server';

// Emailing the pairings sends one email per player (up to 1,000).
export const maxDuration = 300;
/** Stop sending with time to spare and report who wasn't emailed (as lib/golfer-messages does). */
const SEND_BUDGET_MS = 240_000;
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import {
  updateEvent, cancelEvent, applyHold, unheldTimes, previewEvent, autoPairings, parsePlayers, isDate, EventError, type EventInput,
} from '@/lib/course-events';
import { sendEventPairingsEmail, isPlaceholderEmail } from '@/lib/email';
import { formatTeeDay, formatTeeTime } from '@/lib/format';
import { todayIn } from '@/lib/course-time';

// W2-9 Events: one event — its details, the tee times it holds, its checklist
// and its players. Needs "Run events"; every write also needs the current
// agreement (AG-3 §3). Tasks and players are always looked up through the
// event, which is looked up through the session's course.

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'events.manage');
  if (denied) return { res: denied };
  return { session };
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** The distinct times the event holds, in order — group N tees off at the Nth (tee-times events). */
async function heldTimes(eventId: string) {
  const rows = await prisma.teeTime.findMany({ where: { eventId }, select: { time: true }, orderBy: { time: 'asc' } });
  return [...new Set(rows.map(r => r.time))];
}

async function load(courseId: string, id: string) {
  const event = await prisma.courseEvent.findFirst({
    where: { id, courseId },
    include: {
      tasks: { orderBy: [{ sortOrder: 'asc' }, { dueDate: 'asc' }] },
      entrants: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  if (!event) return null;
  const [held, inWindow, course] = await Promise.all([
    prisma.teeTime.findMany({ where: { eventId: id }, select: { id: true, time: true, product: { select: { label: true } } }, orderBy: { time: 'asc' } }),
    // Booked times inside the window that the event could not hold (groups to move).
    prisma.teeTime.findMany({
      where: { courseId, date: event.date, time: { gte: event.holdFrom, lte: event.holdTo }, OR: [{ eventId: null }, { eventId: { not: id } }] },
      select: { time: true, productId: true, playersBooked: true, eventId: true, bookings: { where: { status: { not: 'cancelled' } }, select: { golferName: true } } },
      orderBy: { time: 'asc' },
    }),
    prisma.course.findUnique({ where: { id: courseId }, select: { timezone: true, holes: true } }),
  ]);
  const inScope = inWindow.filter(s => event.format === 'shotgun' || !event.productId || s.productId === event.productId);
  return {
    event,
    today: todayIn(course?.timezone),
    courseHoles: course?.holes ?? 18,
    held: held.map(h => ({ id: h.id, time: h.time, round: h.product?.label ?? null })),
    toMove: event.status === 'planned'
      ? inScope.filter(s => s.playersBooked > 0 || s.bookings.length > 0).map(s => ({ time: s.time, golfers: s.bookings.map(b => b.golferName).join(', ') || 'booked' }))
      : [],
    blockedOther: inScope.filter(s => s.eventId && s.eventId !== id).length,
    unheld: await unheldTimes({ ...event, courseId }),
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ('res' in g) return g.res;
  const { id } = await params;
  const data = await load(g.session.courseId, id);
  if (!data) return bad('Event not found', 404);
  return NextResponse.json(data);
}

type Body = EventInput & {
  action?: string; preview?: boolean;
  taskId?: string; label?: string; dueDate?: string | null; done?: boolean;
  playerId?: string; text?: string; groupNo?: number | null; startHole?: number | null; size?: number;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate();
  if ('res' in g) return g.res;
  const { id } = await params;
  const courseId = g.session.courseId;
  const body = await req.json().catch(() => ({})) as Body;
  const event = await prisma.courseEvent.findFirst({ where: { id, courseId } });
  if (!event) return bad('Event not found', 404);

  // A preview changes nothing, so it doesn't need the agreement.
  if (body.action === 'update' && body.preview) {
    try { return NextResponse.json({ preview: await previewEvent(courseId, body, id) }); }
    catch (err) { if (err instanceof EventError) return bad(err.message); throw err; }
  }
  const agreementBlock = await requireAgreementCurrent(courseId); if (agreementBlock) return agreementBlock;
  if (event.status !== 'planned') return bad('This event was cancelled. Set up a new one to run it again.');

  try {
    switch (body.action) {
      case 'update': {
        const r = await updateEvent(courseId, id, body);
        if (!r) return bad('Event not found', 404);
        return NextResponse.json({ ...(await load(courseId, id)), hold: r.hold });
      }
      case 'cancel': {
        const r = await cancelEvent(courseId, id);
        return NextResponse.json({ ...(await load(courseId, id)), released: r?.released ?? 0 });
      }
      case 'rehold': {
        // After the course moves a group out, hold the times that are now free.
        const hold = await applyHold(event);
        return NextResponse.json({ ...(await load(courseId, id)), hold });
      }

      case 'task_add': {
        const label = String(body.label ?? '').trim().slice(0, 200);
        if (!label) return bad('Say what needs doing.');
        if (body.dueDate && !isDate(body.dueDate)) return bad('Pick a real due date.');
        const last = await prisma.courseEventTask.findFirst({ where: { eventId: id }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
        await prisma.courseEventTask.create({ data: { eventId: id, label, dueDate: body.dueDate || null, sortOrder: (last?.sortOrder ?? -1) + 1 } });
        break;
      }
      case 'task_edit': case 'task_toggle': case 'task_remove': {
        const task = await prisma.courseEventTask.findFirst({ where: { id: String(body.taskId ?? ''), eventId: id } });
        if (!task) return bad('That checklist item is gone — refresh the page.', 404);
        if (body.action === 'task_remove') await prisma.courseEventTask.delete({ where: { id: task.id } });
        else if (body.action === 'task_toggle') {
          await prisma.courseEventTask.update({ where: { id: task.id }, data: body.done ? { doneAt: new Date(), doneBy: g.session.email } : { doneAt: null, doneBy: '' } });
        } else {
          const label = String(body.label ?? '').trim().slice(0, 200);
          if (!label) return bad('Say what needs doing.');
          if (body.dueDate && !isDate(body.dueDate)) return bad('Pick a real due date.');
          await prisma.courseEventTask.update({ where: { id: task.id }, data: { label, dueDate: body.dueDate || null } });
        }
        break;
      }

      case 'players_add': {
        const rows = parsePlayers(String(body.text ?? ''));
        if (!rows.length) return bad('Add at least one name — one player per line.');
        const count = await prisma.courseEventPlayer.count({ where: { eventId: id } });
        if (count + rows.length > 1000) return bad('An event can have up to 1,000 players.');
        await prisma.courseEventPlayer.createMany({ data: rows.map((r, i) => ({ ...r, eventId: id, sortOrder: count + i })) });
        break;
      }
      case 'player_remove': {
        const r = await prisma.courseEventPlayer.deleteMany({ where: { id: String(body.playerId ?? ''), eventId: id } });
        if (!r.count) return bad('That player is gone — refresh the page.', 404);
        break;
      }
      case 'player_set': {
        const groupNo = body.groupNo == null ? null : Number(body.groupNo);
        const startHole = body.startHole == null ? null : Number(body.startHole);
        if (groupNo !== null && !(Number.isInteger(groupNo) && groupNo >= 1 && groupNo <= 250)) return bad('Group has to be a number from 1.');
        if (startHole !== null && !(Number.isInteger(startHole) && startHole >= 1 && startHole <= 36)) return bad('Starting hole has to be a hole on the course.');
        const r = await prisma.courseEventPlayer.updateMany({ where: { id: String(body.playerId ?? ''), eventId: id }, data: { groupNo, startHole } });
        if (!r.count) return bad('That player is gone — refresh the page.', 404);
        break;
      }
      case 'pairings_auto': {
        const players = await prisma.courseEventPlayer.findMany({ where: { eventId: id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
        if (!players.length) return bad('Add the players first.');
        const course = await prisma.course.findUnique({ where: { id: courseId }, select: { holes: true } });
        const holes = Math.min(event.holes, course?.holes ?? event.holes);
        const plan = autoPairings(players, Number(body.size ?? 4), event.format === 'shotgun', holes);
        await prisma.$transaction(plan.map(p => prisma.courseEventPlayer.update({ where: { id: p.id }, data: { groupNo: p.groupNo, startHole: p.startHole } })));
        break;
      }
      case 'pairings_clear':
        await prisma.courseEventPlayer.updateMany({ where: { eventId: id }, data: { groupNo: null, startHole: null } });
        break;

      case 'pairings_send': {
        const [players, course, times] = await Promise.all([
          prisma.courseEventPlayer.findMany({ where: { eventId: id }, orderBy: [{ groupNo: 'asc' }, { sortOrder: 'asc' }] }),
          prisma.course.findUnique({ where: { id: courseId }, select: { name: true, phone: true } }),
          heldTimes(id),
        ]);
        const grouped = players.filter(p => p.groupNo != null);
        if (!grouped.length) return bad('Put the players into groups first.');
        const to = grouped.filter(p => p.email && !isPlaceholderEmail(p.email));
        if (!to.length) return bad('None of the grouped players has an email. Print the pairings instead.');
        let sent = 0; const failed: string[] = []; const notSent: string[] = [];
        const started = Date.now();
        for (const p of to) {
          if (Date.now() - started > SEND_BUDGET_MS) { notSent.push(p.name); continue; }
          const g2 = p.groupNo!;
          const start = event.format === 'shotgun' ? event.startTime : (times[g2 - 1] ?? event.startTime);
          try {
            await sendEventPairingsEmail({
              courseId, name: p.name, email: p.email, courseName: course?.name ?? '', coursePhone: course?.phone ?? '', replyTo: g.session.email,
              eventName: event.name, dateLabel: formatTeeDay(event.date), startLabel: formatTeeTime(start),
              groupNo: g2, startHole: event.format === 'shotgun' ? p.startHole : null,
              groupmates: grouped.filter(o => o.groupNo === g2 && o.id !== p.id).map(o => o.name),
            });
            sent++;
          } catch { failed.push(p.name); }
        }
        return NextResponse.json({
          ...(await load(courseId, id)),
          sent, failed, notSent, noEmail: grouped.length - to.length,
        });
      }
      default:
        return bad('Unknown action.');
    }
  } catch (err) {
    if (err instanceof EventError) return bad(err.message);
    throw err;
  }
  return NextResponse.json(await load(courseId, id));
}
