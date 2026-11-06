import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission, can } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { smsConfigured } from '@/lib/twilio';
import { birdieEnabled } from '@/lib/birdie/guardrails';
import { courseNoticeEmail } from '@/lib/email';
import { formatTeeDay, formatTeeTime } from '@/lib/format';
import { audience, withTextConsent, reach, toCall, checkWindow, sendCourseMessage, smsRoom, noticeText, isVia, MAX_MESSAGE_CHARS, type Via } from '@/lib/golfer-messages';

// MSG-1 (PLATFORM_ROADMAP_SPEC §5): message the golfers booked on a day.
// GET  ?date&from&to&via → who it would reach (counts), who it won't (names to call; their
//      number only with sheet.golfer_contact), whether the assistant can help write it, recent sends.
// POST { date, from?, to?, body, via } → sends, logs, and reports exactly how many went by
//      email / text and who failed — never a silent partial send.
// POST { date, body, preview: true } → the email and the text exactly as they'd go out; sends nothing.
// MSG-2 (Cam 2026-11-06): `via` is Email · Text · Both; the old `sms` boolean still means email + text.
// Permission sheet.message_golfers; always the session's course.
// Sends are sequential and awaited; a full day can take a minute or more.
export const maxDuration = 300;

const win = (o: Record<string, unknown>) => ({ date: String(o.date ?? ''), from: o.from ? String(o.from) : null, to: o.to ? String(o.to) : null });
const viaOf = (o: Record<string, unknown>): Via => isVia(o.via) ? o.via : o.sms === true ? 'both' : 'email';

export async function GET(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const d = requirePermission(session, 'sheet.message_golfers'); if (d) return d; }
  const sp = req.nextUrl.searchParams;
  const w = win({ date: sp.get('date'), from: sp.get('from'), to: sp.get('to') });
  const bad = checkWindow(w);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const via = viaOf({ via: sp.get('via') });
  const contact = can(session, 'sheet.golfer_contact');
  const [list, recent, course] = await Promise.all([
    audience(session.courseId, w).then(withTextConsent),
    prisma.courseMessage.findMany({ where: { courseId: session.courseId }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, date: true, fromTime: true, toTime: true, body: true, sentEmail: true, sentSms: true, failed: true, createdAt: true } }),
    prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true } }),
  ]);
  const texting = smsConfigured();
  return NextResponse.json({
    reach: reach(list, texting, via), smsAvailable: texting, smsMaxChars: smsRoom(course?.name ?? ''), recent,
    // MSG-2 "counts + who to call": names and tee times; a number only for logins that see golfer contact.
    toCall: toCall(list, texting, via).slice(0, 50).map(r => ({ name: r.name, teeTime: r.teeTime, ...(contact && r.rawPhone ? { phone: r.rawPhone } : {}) })),
    draftAvailable: birdieEnabled(),
  }, { headers: { 'Cache-Control': 'no-store' } });
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
  if (body.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: `Keep it under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true } });
  const courseName = course?.name ?? '';

  // MSG-2: the email and the text as the golfer gets them. Sends nothing, writes nothing.
  if (b.preview === true) {
    const first = (await audience(session.courseId, w))[0];
    const teeTime = formatTeeTime(first?.teeTime ?? '08:00');
    const email = courseNoticeEmail({ courseName, dateLabel: formatTeeDay(w.date), teeTime, body: body || '…' });
    return NextResponse.json({ subject: email.subject, html: email.html, text: noticeText(courseName, body || '…'), teeTime });
  }

  if (body.length < 3) return NextResponse.json({ error: 'Write the message first.' }, { status: 400 });
  const via = viaOf(b);
  const texting = smsConfigured();
  if (via === 'text' && !texting) return NextResponse.json({ error: 'Texting isn’t on yet — send it by email.' }, { status: 400 });
  const sms = via !== 'email' && texting;
  if (sms) {
    const room = smsRoom(courseName);
    if (body.length > room) return NextResponse.json({ error: `A text fits ${room} characters — shorten the message or send it by email only.` }, { status: 400 });
  }
  // Revamp 3 fix 12: a send that reaches nobody is refused, never answered "ok" with 0 sent.
  const r0 = reach(await withTextConsent(await audience(session.courseId, w)), texting, via);
  if (r0.golfers > 0 && r0.email + r0.sms === 0) return NextResponse.json({ error: `None of the ${r0.golfers} golfer${r0.golfers === 1 ? '' : 's'} booked can be reached ${via === 'text' ? 'by text' : via === 'email' ? 'by email' : 'by email or text'}. Tell them at the counter.` }, { status: 400 });
  // A course can't flood its golfers by accident: six notices an hour.
  if (!(await rateLimit(`golfer-msg:${session.courseId}`, 6, 3600))) {
    return NextResponse.json({ error: 'That’s six messages in the last hour — wait a bit before sending another.' }, { status: 429 });
  }
  const sentBy = session.isStaff ? `staff:${session.staffId ?? ''}` : `op:${session.operatorId ?? ''}`;
  const r = await sendCourseMessage({ courseId: session.courseId, window: w, body, sms, email: via !== 'text', sentBy });
  return NextResponse.json({ ok: r.failed.length === 0, ...r });
}
