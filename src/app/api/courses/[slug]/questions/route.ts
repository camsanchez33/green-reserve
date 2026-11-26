// ASSIST-1 (Cam 2026-11-24; lanes/build.md "AI assistant overhaul" item 5): golfer questions on a course's booking
// page. Public: no sign-in, so every cap is checked here and the course is the one the URL names.
//
// POST { messages } → NDJSON (lib/assistant/run): {"t":"text"} answer text, {"t":"end"} — or a JSON error.
//
// What it never does: book, cancel, move, refund or take payment (there are no tools; it can only write text), read
// a booking or a golfer, or read any other course. It answers only from this course's golfer brief
// (lib/assistant/brief) and quotes the booking policy word for word. Off until the course turns it on.
//
// Caps, in order: the per-visitor hourly cap (before the body is read), the course's own daily limit (at most 300,
// course-local day), then the platform's golfer cap. Over the course or platform cap, the golfer gets the course's
// "when it doesn't know" line, as an ordinary answer with no model call.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { clientIp } from '@/lib/rate-limit';
import { todayIn } from '@/lib/course-time';
import { getCourseBrief } from '@/lib/assistant/brief';
import { assistantClient, assistantKeyPresent, logAssistant, systemBlocks } from '@/lib/assistant/prompt';
import { golferDayAllows, platformAllows, publicIpAllows } from '@/lib/assistant/caps';
import { readAssistantSettings } from '@/lib/assistant/settings';
import { sanitizeTurns, streamAssistant, STREAM_HEADERS } from '@/lib/assistant/run';
import { GOLFER_PERSONA, GOLFER_MAX_CHARS, GOLFER_MAX_TURNS, GOLFER_MAX_TOKENS, golferBotKilled, golferCourseBlock } from '@/lib/assistant/golfer';

export const dynamic = 'force-dynamic';

const OFF = 'Questions are not available on this page right now.';

/** A plain answer with no model call (over a cap): the same stream shape the box already reads. */
function plainAnswer(text: string, reason: string): Response {
  const body = [JSON.stringify({ t: 'text', d: text }), JSON.stringify({ t: 'end', d: { reason } })].join('\n') + '\n';
  return new Response(body, { headers: STREAM_HEADERS });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!assistantKeyPresent() || golferBotKilled()) return NextResponse.json({ error: OFF }, { status: 503 });
  // Per visitor, before anything else is read. The 'birdie:' prefix makes the counter fail CLOSED.
  if (!(await publicIpAllows('golfer', clientIp(req)))) {
    return NextResponse.json({ error: 'That is a lot of questions. Try again in a little while.' }, { status: 429 });
  }

  const { slug } = await params;
  if (typeof slug !== 'string' || !slug || slug.length > 120) return NextResponse.json({ error: OFF }, { status: 404 });
  const course = await prisma.course.findUnique({
    where: { slug },
    select: {
      id: true, active: true, liveStatus: true, archivedAt: true, timezone: true,
      assistantStaffOn: true, assistantGolferOn: true, assistantTone: true, assistantGolferTopics: true, assistantUnknownLine: true, assistantGolferDailyLimit: true,
    },
  });
  // Only a live course's page has a Questions box, and only when the course turned it on.
  if (!course || !course.active || course.liveStatus !== 'live' || course.archivedAt) return NextResponse.json({ error: OFF }, { status: 404 });
  const settings = readAssistantSettings(course);
  if (!settings.golferOn) return NextResponse.json({ error: OFF }, { status: 403 });

  const body = await req.json().catch(() => null) as { messages?: unknown } | null;
  const history = sanitizeTurns(body?.messages, { maxChars: GOLFER_MAX_CHARS, maxTurns: GOLFER_MAX_TURNS });
  if (!history.length) return NextResponse.json({ error: 'Type a question first.' }, { status: 400 });

  // The brief is this course's, golfer audience: the topics it allowed, golfer notes only, no member rates or dues.
  const brief = await getCourseBrief(course.id, 'golfer');
  if (!brief) return NextResponse.json({ error: OFF }, { status: 404 });

  // Cam 2026-11-24: at most 300 golfer questions per course per day (a course may set lower), then the hand-off line.
  if (!(await golferDayAllows(course.id, course.timezone, settings.golferDailyLimit))) {
    logAssistant({ persona: 'golfer', courseId: course.id, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, stopReason: null, ms: 0, capped: 'course_day' });
    return plainAnswer(brief.unknownLine, 'capped');
  }
  if (!(await platformAllows('golfer'))) {
    logAssistant({ persona: 'golfer', courseId: course.id, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, stopReason: null, ms: 0, capped: 'platform' });
    return plainAnswer(brief.unknownLine, 'capped');
  }

  const client = assistantClient();
  if (!client) return NextResponse.json({ error: OFF }, { status: 503 });

  const courseBlock = golferCourseBlock({ courseName: brief.courseName, settings: brief.settings, unknownLine: brief.unknownLine, briefText: brief.text });
  return streamAssistant({
    persona: 'golfer', courseId: course.id, client,
    system: systemBlocks(GOLFER_PERSONA, courseBlock, `Today at the course: ${todayIn(course.timezone)}`),
    messages: history,
    maxTokens: GOLFER_MAX_TOKENS,
    refusalLine: brief.unknownLine,
    errorLine: `I can't answer right now. ${brief.unknownLine}`,
    keyRejectedLine: `I can't answer right now. ${brief.unknownLine}`,
  });
}
