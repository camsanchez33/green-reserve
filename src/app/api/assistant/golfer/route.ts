import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { clientIp } from '@/lib/rate-limit';
import { getCourseBrief } from '@/lib/assistant/brief';
import { readAssistantSettings, unknownLineFor } from '@/lib/assistant/settings';
import { platformAllows, golferDayAllows, publicIpAllows } from '@/lib/assistant/caps';
import { assistantClient, systemBlocks, logAssistant, ASSISTANT_MODEL, ASSISTANT_EFFORT, FALLBACK_BETA } from '@/lib/assistant/prompt';
import { GOLFER_PERSONA, GOLFER_MAX_TOKENS, golferCourseBlock, sanitizeGolferHistory } from '@/lib/assistant/golfer';

// ASSIST-6 (Cam 2026-11-24): the golfer question bot on a course's booking page. Public, no sign-in, no tools.
//
// GET  ?course=<slug> → { enabled, courseName, unknownLine }   (the page shows the launcher only when enabled)
// POST { course: <slug>, messages } → { reply, handOff }        (handOff = the reply is the course's hand-off line)
//
// The course is the one whose booking page this is (its public slug); the bot reads only that course's golfer brief.
// It is OFF until the course turns it on, and fails closed without ANTHROPIC_API_KEY. Caps, cheapest first: per IP
// per hour, the platform's golfer budget, then the course's own day (Cam: 300 at most) — past the course's limit the
// golfer gets the course's hand-off line instead of a model call. Logs carry tokens and how the turn ended, never the
// question or the answer.

export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9-]{1,80}$/;
const COURSE_SELECT = {
  id: true, name: true, phone: true, proShopPhone: true, timezone: true, active: true, liveStatus: true, archivedAt: true,
  assistantStaffOn: true, assistantGolferOn: true, assistantTone: true, assistantGolferTopics: true, assistantUnknownLine: true, assistantGolferDailyLimit: true,
} as const;

/** The course the page is for, only while golfers can see it and only if it switched golfer questions on. */
async function courseFor(slug: unknown) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) return null;
  const c = await prisma.course.findUnique({ where: { slug }, select: COURSE_SELECT });
  if (!c || !c.active || c.liveStatus !== 'live' || c.archivedAt) return null;
  const settings = readAssistantSettings(c);
  if (!settings.golferOn) return null;
  return { ...c, settings, unknownLine: unknownLineFor(settings, c) };
}

const off = () => NextResponse.json({ enabled: false }, { headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  const c = assistantClient() ? await courseFor(req.nextUrl.searchParams.get('course')) : null;
  if (!c) return off();
  return NextResponse.json({ enabled: true, courseName: c.name, unknownLine: c.unknownLine }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  // Fail closed before anything else: no key, no bot.
  const client = assistantClient();
  if (!client) return NextResponse.json({ error: 'Questions are not available right now.' }, { status: 503 });

  if (!(await publicIpAllows('golfer', clientIp(req)))) {
    return NextResponse.json({ error: 'That is a lot of questions — try again in a little while.' }, { status: 429 });
  }
  let body: { course?: unknown; messages?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const c = await courseFor(body?.course);
  if (!c) return NextResponse.json({ error: 'Questions are not available on this page.' }, { status: 404 });
  const history = sanitizeGolferHistory(body?.messages);
  if (!history.length) return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });

  const handOff = (capped: string) => {
    logAssistant({ persona: 'golfer', courseId: c.id, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, stopReason: null, ms: 0, capped });
    return NextResponse.json({ reply: c.unknownLine, handOff: true });
  };
  // Cam 2026-11-24: past the course's daily limit (at most 300), the answer is the course's own hand-off line.
  if (!(await golferDayAllows(c.id, c.timezone, c.settings.golferDailyLimit))) return handOff('course_day');
  if (!(await platformAllows('golfer'))) return handOff('platform_day');

  const brief = await getCourseBrief(c.id, 'golfer');
  if (!brief) return NextResponse.json({ error: 'Questions are not available on this page.' }, { status: 404 });

  const started = Date.now();
  // persona (frozen) → course block: tone, hand-off line, brief (breakpoint). No volatile text, no tools.
  const system = systemBlocks(GOLFER_PERSONA, golferCourseBlock(c.name, c.settings.tone, c.unknownLine, brief.text), '');
  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await client.beta.messages.create({
      model: ASSISTANT_MODEL, max_tokens: GOLFER_MAX_TOKENS, system, messages: history,
      output_config: { effort: ASSISTANT_EFFORT },
      betas: [FALLBACK_BETA], fallbacks: 'default',
    });
  } catch (err) {
    console.error('[assistant] golfer call failed:', err instanceof Anthropic.APIError ? `${err.status} ${err.name}` : err instanceof Error ? err.name : 'error');
    return NextResponse.json({ reply: c.unknownLine, handOff: true });
  }
  const text = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('').trim();
  logAssistant({
    persona: 'golfer', courseId: c.id, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens,
    cacheRead: msg.usage.cache_read_input_tokens ?? 0, cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
    stopReason: msg.stop_reason, ms: Date.now() - started,
  });
  // A refusal, a cut-off answer or an empty one: the course's hand-off line, never half an answer about policy.
  if (msg.stop_reason !== 'end_turn' || !text) return NextResponse.json({ reply: c.unknownLine, handOff: true });
  return NextResponse.json({ reply: text.slice(0, 2000), handOff: text === c.unknownLine });
}
