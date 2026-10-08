import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { smsConfigured } from '@/lib/twilio';
import { audience, reach, checkWindow, sendCourseMessage, MAX_MESSAGE_CHARS } from '@/lib/golfer-messages';

// MSG-1 (PLATFORM_ROADMAP_SPEC §5): message the golfers booked on a day.
// GET  ?date&from&to → who it would reach (counts only) + the last messages sent.
// POST { date, from?, to?, body, sms } → sends, logs, and reports exactly how
//      many went by email / text and who failed — never a silent partial send.
// Permission sheet.message_golfers; always the session's course.
// Sends are sequential and awaited; a full day can take a minute or more.
export const maxDuration = 300;

const win = (o: Record<string, unknown>) => ({ date: String(o.date ?? ''), from: o.from ? String(o.from) : null, to: o.to ? String(o.to) : null });

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const d = requirePermission(session, 'sheet.message_golfers'); if (d) return d; }
  const sp = req.nextUrl.searchParams;
  const w = win({ date: sp.get('date'), from: sp.get('from'), to: sp.get('to') });
  const bad = checkWindow(w);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const [list, recent] = await Promise.all([
    audience(session.courseId, w),
    prisma.courseMessage.findMany({ where: { courseId: session.courseId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, date: true, fromTime: true, toTime: true, body: true, sentEmail: true, sentSms: true, failed: true, createdAt: true } }),
  ]);
  return NextResponse.json({ reach: reach(list), smsAvailable: smsConfigured(), recent }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const d = requirePermission(session, 'sheet.message_golfers'); if (d) return d; }
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const w = win(b);
  const bad = checkWindow(w);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const body = typeof b.body === 'string' ? b.body.trim() : '';
  if (body.length < 3) return NextResponse.json({ error: 'Write the message first.' }, { status: 400 });
  if (body.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: `Keep it under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });
  // A course can't flood its golfers by accident: six notices an hour.
  if (!(await rateLimit(`golfer-msg:${session.courseId}`, 6, 3600))) {
    return NextResponse.json({ error: 'That’s six messages in the last hour — wait a bit before sending another.' }, { status: 429 });
  }
  const sentBy = session.isStaff ? `staff:${session.staffId ?? ''}` : `op:${session.operatorId ?? ''}`;
  const r = await sendCourseMessage({ courseId: session.courseId, window: w, body, sms: b.sms === true, sentBy });
  return NextResponse.json({ ok: r.failed.length === 0, ...r });
}
