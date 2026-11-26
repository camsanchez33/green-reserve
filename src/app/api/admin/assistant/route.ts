import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { resolveAdminSession, areaGate } from '@/lib/admin-session';
import { dayKey } from '@/lib/admin-day';
import { runAskTool } from '@/lib/admin-ask';
import { platformAllows } from '@/lib/assistant/caps';
import { rateLimit } from '@/lib/rate-limit';
import { assistantClient, systemBlocks, logAssistant, ASSISTANT_MODEL, ASSISTANT_EFFORT, ASSISTANT_MAX_TOKENS, FALLBACK_BETA } from '@/lib/assistant/prompt';
import { ADMIN_PERSONA, ADMIN_ASSISTANT_TOOLS, ADMIN_ASSISTANT_TOOL_NAMES, adminDocsBlock } from '@/lib/assistant/admin';
import { sanitizeHistory } from '@/lib/birdie/guardrails';

// ASSIST-4 (Cam 2026-11-24): the owner's assistant in the admin. OWNER ONLY (a live gr_owner session — never an admin
// employee) and read-only: the docs Cam marked plus two course-level aggregate tools. No customer data, no audit
// notes, no writes. Fails closed without the key. Logs carry tokens and tool names, never the words.
//
// GET  → { enabled, knows }
// POST { messages } → { reply }

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const MAX_TOOL_ROUNDS = 4;
const PER_OWNER_PER_HOUR = 40;

async function ownerOnly() {
  const session = await resolveAdminSession();
  if (!session) return { res: NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 }) } as const;
  if (session.role !== 'owner' || !session.ownerSessionId) return { res: NextResponse.json({ error: 'Owner only.' }, { status: 403 }) } as const;
  const gate = areaGate(session, 'company');
  if (gate) return { res: gate };
  return { session } as const;
}

export async function GET() {
  const g = await ownerOnly(); if ('res' in g) return g.res;
  if (!assistantClient()) return NextResponse.json({ enabled: false, knows: null });
  const { knows } = await adminDocsBlock();
  return NextResponse.json({ enabled: true, knows }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const g = await ownerOnly(); if ('res' in g) return g.res;
  const client = assistantClient();
  if (!client) return NextResponse.json({ error: 'The assistant isn’t set up yet (no AI key on the server).' }, { status: 503 });
  if (!(await rateLimit(`birdie:admin-assistant:${g.session.adminId}`, PER_OWNER_PER_HOUR, 3600)) || !(await platformAllows('admin'))) {
    return NextResponse.json({ error: 'That’s a lot of questions for now — try again in a little while.' }, { status: 429 });
  }
  const body = await req.json().catch(() => null) as { messages?: unknown } | null;
  let messages: Anthropic.Beta.BetaMessageParam[] = sanitizeHistory(body?.messages);
  if (!messages.length) return NextResponse.json({ error: 'Type a question first.' }, { status: 400 });

  const docs = await adminDocsBlock();
  // tools → persona → the marked docs (breakpoint) → today.
  const system = systemBlocks(ADMIN_PERSONA, docs.text, `Today (US Eastern): ${dayKey(new Date())}.`);
  const started = Date.now();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const tools: string[] = [];
  let reply = '';
  let stopReason: string | null = null;
  try {
    for (let round = 0; ; round++) {
      const msg = await client.beta.messages.create({
        model: ASSISTANT_MODEL, max_tokens: ASSISTANT_MAX_TOKENS, system, tools: ADMIN_ASSISTANT_TOOLS, messages,
        output_config: { effort: ASSISTANT_EFFORT }, betas: [FALLBACK_BETA], fallbacks: 'default',
      }, { timeout: Math.max(5_000, 50_000 - (Date.now() - started)), maxRetries: 0 });
      usage.input += msg.usage.input_tokens; usage.output += msg.usage.output_tokens;
      usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0; usage.cacheWrite += msg.usage.cache_creation_input_tokens ?? 0;
      stopReason = msg.stop_reason;
      reply += msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('');
      if (msg.stop_reason === 'refusal') { if (!reply) reply = 'I can’t answer that one.'; break; }
      if (msg.stop_reason === 'max_tokens') { reply += '\n\n(That ran long — ask a narrower question.)'; break; }
      const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (msg.stop_reason !== 'tool_use' || !uses.length) break;
      if (round >= MAX_TOOL_ROUNDS || Date.now() - started > 45_000) { reply += '\n\n(That needed more lookups than I do in one go — ask a narrower question.)'; break; }
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(uses.map(async tu => {
        // Only the two aggregate tools exist here, whatever the model asks for; each re-checks the role.
        const out = ADMIN_ASSISTANT_TOOL_NAMES.has(tu.name)
          ? await runAskTool(tu.name, tu.input, g.session.role, g.session.areas ?? null).catch(() => ({ content: 'That lookup failed — try again.', isError: true }))
          : { content: 'Unknown tool.', isError: true };
        tools.push(`${tu.name}${out.isError ? ':error' : ''}`);
        return { type: 'tool_result' as const, tool_use_id: tu.id, content: out.content, is_error: out.isError || undefined };
      }));
      messages = [...messages, { role: 'assistant', content: msg.content }, { role: 'user', content: results }];
      if (reply && !/\s$/.test(reply)) reply += '\n\n';
    }
  } catch (err) {
    // Labelled by instanceof: class names are minified in the production build.
    const kind = err instanceof Anthropic.APIConnectionTimeoutError ? 'timeout' : err instanceof Anthropic.APIConnectionError ? 'connection' : err instanceof Anthropic.APIError ? `api ${err.status ?? ''}` : 'error';
    console.error('[assistant] admin call failed:', kind);
    logAssistant({ persona: 'admin', courseId: null, inputTokens: usage.input, outputTokens: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, stopReason: 'error', ms: Date.now() - started, tools });
    return NextResponse.json({ error: 'Couldn’t answer just now — try again in a moment.' }, { status: 502 });
  }
  logAssistant({ persona: 'admin', courseId: null, inputTokens: usage.input, outputTokens: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, stopReason, ms: Date.now() - started, tools });
  return NextResponse.json({ reply: reply.trim() || 'I can’t answer that one.' });
}
