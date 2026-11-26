// BIRDIE_AI_SPEC B1, ASSIST-1 (Cam 2026-11-24) — the dashboard assistant. Persona and knowledge come from WHERE the
// request lands and WHO is asking (the session), never from the client.
//
// GET  → { enabled, persona, greeting, chips, knows }   (the widget decides whether to render; knows = "What it knows")
// POST → streams NDJSON events, one per line (lib/assistant/run) — {"t":"text"} reply text, {"t":"status"} while a
//        lookup runs, {"t":"card","d":ProposalCard} for a drafted change, {"t":"end"} — or a JSON error.
// PUT  → { applied: { title, path, method, ok, error? } } — the widget reports a confirm card's outcome so every
//        drafted change is logged.
//
// ASSIST-1: every turn runs on the current model (lib/assistant/prompt: ASSISTANT_MODEL, effort low, server-side
// refusal fallback). The prompt is persona → this course's brief (lib/assistant/brief, staff audience) behind a cache
// breakpoint → today's date and this login. Live numbers come through the read tools (lib/birdie/tools); changes are
// only ever DRAFTED as confirm cards (lib/birdie/proposals) that the operator saves — the assistant never saves.
import { NextRequest, NextResponse } from 'next/server';
import { resolveDashboardSession, can } from '@/lib/session';
import { todayIn } from '@/lib/course-time';
import { READ_TOOLS, runReadTool, type ToolContext } from '@/lib/birdie/tools';
import { PROPOSE_TOOLS, runProposeTool, isProposeTool } from '@/lib/birdie/proposals';
import { OPERATOR_PERSONA } from '@/lib/birdie/persona-operator';
import { birdieEnabled, checkCaps, MAX_USER_CHARS, MAX_HISTORY_TURNS } from '@/lib/birdie/guardrails';
import { getCourseBrief, type CourseBrief } from '@/lib/assistant/brief';
import { assistantClient, systemBlocks } from '@/lib/assistant/prompt';
import { sanitizeTurns, streamAssistant, type ToolOutput } from '@/lib/assistant/run';

export const dynamic = 'force-dynamic';

// B4b: one fixed tool list for every session (the front of the cached prefix); each tool re-checks the login's
// permission when it runs.
const TOOLS = [...READ_TOOLS, ...PROPOSE_TOOLS];
const MAX_CARDS_PER_TURN = 2;

const OPERATOR_GREETING = "Hi. I'm your course's assistant. Ask me how to do anything on your dashboard, or what your course is set to.";
const OPERATOR_CHIPS = [
  'How did the last 30 days go?',
  "What's on the tee sheet today?",
  'Which hours go unbooked the most?',
  'How do I change my weekend rate?',
];


/** "What it knows" for the panel: the brief's sections and when its text last changed. No brief text. */
function knowsFor(b: (CourseBrief & { builtAt: Date }) | null) {
  if (!b) return null;
  const notes = b.sections.find(s => s.key === 'notes');
  return { courseName: b.courseName, notes: Number(notes?.count ?? 0), sections: b.sections, builtAt: b.builtAt.toISOString() };
}

/** Off when the platform switch or the key is off, or the course turned its staff assistant off. */
function staffAssistantOn(brief: CourseBrief | null): boolean {
  return birdieEnabled() && !!brief && brief.settings.staffOn;
}

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ enabled: false }, { status: 401 });
  if (!birdieEnabled()) return NextResponse.json({ enabled: false });
  const brief = await getCourseBrief(session.courseId, 'staff');
  if (!staffAssistantOn(brief)) return NextResponse.json({ enabled: false });
  return NextResponse.json({
    enabled: true,
    persona: 'operator',
    greeting: OPERATOR_GREETING,
    chips: OPERATOR_CHIPS,
    helpsWith: 'how to do anything on this dashboard, and what your course is set to',
    knows: knowsFor(brief),
  });
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Sign in to use the assistant.' }, { status: 401 });
  if (!birdieEnabled()) return NextResponse.json({ error: 'The assistant is switched off right now.' }, { status: 503 });

  // Caps BEFORE the body is read: a course that is over its budget must not be able to make the server parse
  // anything at all.
  const capped = await checkCaps(session.courseId);
  if (capped) return NextResponse.json({ error: capped }, { status: 429 });

  let body: { messages?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const history = sanitizeTurns(body?.messages, { maxChars: MAX_USER_CHARS, maxTurns: MAX_HISTORY_TURNS });
  if (!history.length) return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });

  // The course is the session's, never the request's.
  const brief = await getCourseBrief(session.courseId, 'staff');
  if (!brief) return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  if (!brief.settings.staffOn) return NextResponse.json({ error: 'The assistant is turned off for your course. Turn it on in Settings → Assistant.' }, { status: 403 });

  const client = assistantClient();
  if (!client) return NextResponse.json({ error: 'The assistant is not set up yet.' }, { status: 503 });

  const toolCtx: ToolContext = { courseId: session.courseId, timezone: brief.timezone, can: key => can(session, key) };
  const sees = (key: Parameters<typeof can>[1]) => (can(session, key) ? 'yes' : 'no');
  // Volatile facts go AFTER the cached brief: today's date and what this login may see.
  const volatile = `Today (course-local): ${todayIn(toolCtx.timezone)}
This login: ${session.isStaff ? 'staff' : 'course owner'}. Can see analytics: ${sees('analytics.view')}; schedule: ${sees('schedule.view')}; tee sheet: ${sees('sheet.view')}`;

  let cards = 0;
  const runTool = async (name: string, input: unknown): Promise<ToolOutput> => {
    if (isProposeTool(name)) {
      if (cards >= MAX_CARDS_PER_TURN) return { content: 'Only two changes can be drafted at once. Ask the operator to save or dismiss these first.', isError: true };
      const p = await runProposeTool(name, input, toolCtx);
      if (p.card) { cards++; return { content: p.content, isError: p.isError, event: { t: 'card', d: p.card } }; }
      return { content: p.content, isError: p.isError };
    }
    const r = await runReadTool(name, input, toolCtx);
    return { content: r.content, isError: r.isError };
  };

  return streamAssistant({
    persona: 'operator', courseId: session.courseId, client,
    system: systemBlocks(OPERATOR_PERSONA, brief.text, volatile),
    messages: history, tools: TOOLS, runTool,
    refusalLine: "I can't help with that one. Ask me anything about running your course on GreenReserve.",
    errorLine: 'The assistant could not answer just now. Try again in a moment.',
    keyRejectedLine: 'The assistant is not configured correctly (its API key was rejected). Tell GreenReserve and we will fix it.',
  });
}

// B4b: the widget reports what happened when the operator pressed Save (or the route refused it). The change itself
// went through the page's own route; this only writes the log line, scoped to the session's course.
export async function PUT(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { applied?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const a = body?.applied;
  if (!a || typeof a !== 'object') return NextResponse.json({ error: 'Nothing to log.' }, { status: 400 });
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
  console.log(JSON.stringify({
    ev: 'birdie.applied', courseId: session.courseId, actor: session.isStaff ? `staff:${session.staffId ?? ''}` : `op:${session.operatorId ?? ''}`,
    title: str(a.title, 200), method: str(a.method, 10), path: str(a.path, 100), ok: a.ok === true, error: str(a.error, 300),
  }));
  return NextResponse.json({ ok: true });
}
