import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { birdieEnabled } from '@/lib/birdie/guardrails';
import { draftNotice } from '@/lib/notice-draft';
import { MAX_MESSAGE_CHARS, smsRoom } from '@/lib/golfer-messages';

// MSG-2: "Help me write it" in Message golfers. POST { body, forText } → { text }, the assistant's tidy
// of what staff typed (lib/notice-draft — it may not add a number). Sends nothing, stores nothing.
// Same permission as sending; behind the assistant's kill switch; 20 drafts an hour per course, on a
// `birdie:` key so the counter fails CLOSED (lib/rate-limit: a broken counter must not uncap paid API spend).
export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const d = requirePermission(session, 'sheet.message_golfers'); if (d) return d; }
  if (!birdieEnabled()) return NextResponse.json({ error: 'The assistant is off right now — write it yourself.' }, { status: 503 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  const typed = typeof b.body === 'string' ? b.body.trim() : '';
  if (typed.length < 3) return NextResponse.json({ error: 'Write a few words first — the assistant tidies what you wrote.' }, { status: 400 });
  if (typed.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: `Keep it under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });
  if (!(await rateLimit(`birdie:msg-draft:${session.courseId}`, 20, 3600))) return NextResponse.json({ error: 'That’s 20 drafts this hour — write this one yourself.' }, { status: 429 });
  const course = await prisma.course.findUnique({ where: { id: session.courseId }, select: { name: true } });
  const courseName = course?.name ?? '';
  try {
    const r = await draftNotice(typed, { courseName, maxChars: b.forText === true ? smsRoom(courseName) : MAX_MESSAGE_CHARS });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
    return NextResponse.json({ text: r.text });
  } catch {
    return NextResponse.json({ error: 'The assistant didn’t answer — try again, or send it as you wrote it.' }, { status: 502 });
  }
}
