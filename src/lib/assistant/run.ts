// ASSIST-1 (Cam 2026-11-24): one streamed answer, shared by every assistant persona (dashboard, admin, homepage,
// golfer). Server only.
//
// What it holds so no route has to remember it:
//  - the current model with effort low and the server-side refusal fallback (lib/assistant/prompt);
//  - the cached prompt layout the route built with systemBlocks() (tools render before system, so the persona's
//    breakpoint covers them too);
//  - a capped tool loop where a persona has tools (the dashboard's read and draft tools, the admin's read tools).
//    A tool can only do what its runner does: the runner closes over the session's course or role, and the model
//    never names a course;
//  - every turn's stop_reason checked: a refusal or a cut-off answer shows the persona's plain line instead;
//  - one log line per answer with sizes, cache use and how it ended — never the question, the answer or a key.
//
// The response is NDJSON, one {"t","d"} event per line: "text" answer text, "status" a short note while a lookup
// runs, "card" a drafted change (dashboard only), "end" how the turn ended ({ reason }).
import Anthropic from '@anthropic-ai/sdk';
import {
  ASSISTANT_MODEL, ASSISTANT_EFFORT, ASSISTANT_MAX_TOKENS, FALLBACK_BETA, logAssistant, stopFallback,
  type AssistantPersona, type SystemBlock,
} from './prompt';

export type AssistantTurn = { role: 'user' | 'assistant'; content: string };
export type ToolOutput = { content: string; isError: boolean; /** sent to the client as-is (a draft's confirm card) */ event?: { t: 'card'; d: unknown } };
export type ToolRunner = (name: string, input: unknown) => Promise<ToolOutput>;

export type AssistantStreamOptions = {
  persona: AssistantPersona;
  /** For the log line only. */
  courseId: string | null;
  client: Anthropic;
  system: SystemBlock[];
  messages: AssistantTurn[];
  tools?: Anthropic.Beta.BetaTool[];
  runTool?: ToolRunner;
  maxToolRounds?: number;
  /** Shown when the model declines and nothing has been said yet. */
  refusalLine: string;
  /** Shown when the answer could not be produced (network, API). */
  errorLine: string;
  /** Shown when the key is rejected. */
  keyRejectedLine: string;
  /** Shown when the tool loop hits its cap. */
  tooManyLookupsLine?: string;
  maxTokens?: number;
};

/** Keep the client's history honest: roles whitelisted, text only, capped, alternating, ends on a user turn. */
export function sanitizeTurns(raw: unknown, opts: { maxChars: number; maxTurns: number }): AssistantTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: AssistantTurn[] = [];
  for (const m of raw.slice(-opts.maxTurns * 2)) {
    if (!m || typeof m !== 'object') continue;
    const r = (m as { role?: unknown }).role;
    const c = (m as { content?: unknown }).content;
    if ((r !== 'user' && r !== 'assistant') || typeof c !== 'string') continue;
    const text = c.trim().slice(0, opts.maxChars);
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === r) last.content = `${last.content}\n${text}`.slice(0, opts.maxChars * 2);
    else turns.push({ role: r, content: text });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  while (turns.length && turns[turns.length - 1].role !== 'user') turns.pop();
  const kept = turns.slice(-opts.maxTurns);
  while (kept.length && kept[0].role !== 'user') kept.shift();
  return kept;
}

/** The request every persona sends. Exported for the tests, which check the model, effort and fallback. */
export function assistantRequestParams(o: { system: SystemBlock[]; messages: Anthropic.Beta.BetaMessageParam[]; tools?: Anthropic.Beta.BetaTool[]; maxTokens?: number }) {
  return {
    model: ASSISTANT_MODEL,
    max_tokens: o.maxTokens ?? ASSISTANT_MAX_TOKENS,
    system: o.system,
    ...(o.tools?.length ? { tools: o.tools } : {}),
    messages: o.messages,
    output_config: { effort: ASSISTANT_EFFORT },
    // A declined turn is re-run on the model the API picks, inside the same call, rather than dead-ending.
    betas: [FALLBACK_BETA],
    fallbacks: 'default' as const,
  };
}

/** The NDJSON response headers every assistant route answers with. */
export const STREAM_HEADERS = { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' };

/** A failure's kind for the log, never its message (which could echo a request). */
function errorKind(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `api_${err.status ?? 'none'}`;
  return err instanceof Error ? err.name : 'unknown';
}

/** Stream one answer. Never throws; every failure ends as a plain line in the stream. */
export function streamAssistant(o: AssistantStreamOptions): Response {
  const encoder = new TextEncoder();
  const started = Date.now();
  const maxRounds = o.maxToolRounds ?? 4;
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (t: 'text' | 'status' | 'card' | 'end', d: unknown) => controller.enqueue(encoder.encode(JSON.stringify({ t, d }) + '\n'));
      let reply = '';
      const say = (d: string) => { reply += d; send('text', d); };
      const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      const toolNames: string[] = [];
      let stopReason: string | null = null;
      let ended = 'end_turn';
      let messages: Anthropic.Beta.BetaMessageParam[] = o.messages.map(m => ({ role: m.role, content: m.content }));
      try {
        for (let round = 0; ; round++) {
          const stream = o.client.beta.messages.stream(assistantRequestParams({ system: o.system, messages, tools: o.tools, maxTokens: o.maxTokens }));
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') say(event.delta.text);
          }
          const msg = await stream.finalMessage();
          usage.input += msg.usage.input_tokens; usage.output += msg.usage.output_tokens;
          usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0; usage.cacheWrite += msg.usage.cache_creation_input_tokens ?? 0;
          stopReason = msg.stop_reason;

          const fallback = stopFallback(msg.stop_reason, reply, msg.stop_reason === 'refusal' ? o.refusalLine : o.errorLine);
          if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') {
            if (fallback) say(fallback);
            ended = msg.stop_reason;
            break;
          }
          const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
          if (msg.stop_reason !== 'tool_use' || !uses.length || !o.runTool) break;
          if (round >= maxRounds) { say(o.tooManyLookupsLine ?? '\n\n(That needed more lookups than I do in one go. Ask a narrower question.)'); ended = 'tool_cap'; break; }

          send('status', 'Looking that up…');
          const runTool = o.runTool;
          // All results for one assistant turn go back in ONE user message.
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(uses.map(async tu => {
            let out: ToolOutput;
            try { out = await runTool(tu.name, tu.input); }
            catch (e) { console.error(JSON.stringify({ ev: 'assistant.tool_failed', persona: o.persona, tool: tu.name, kind: errorKind(e) })); out = { content: 'That lookup failed on our side. Try again in a moment.', isError: true }; }
            toolNames.push(tu.name);
            if (out.event) send(out.event.t, out.event.d);
            return { type: 'tool_result' as const, tool_use_id: tu.id, content: out.content, is_error: out.isError || undefined };
          }));
          messages = [...messages, { role: 'assistant', content: msg.content }, { role: 'user', content: results }];
          if (reply && !/\s$/.test(reply)) say('\n\n');
        }
      } catch (err) {
        // Headers are sent: the stream is the only channel left. A bad key surfaces here, not at construction.
        const keyRejected = err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError;
        console.error(JSON.stringify({ ev: 'assistant.failed', persona: o.persona, courseId: o.courseId, kind: errorKind(err) }));
        ended = keyRejected ? 'key_rejected' : 'error';
        say(keyRejected ? o.keyRejectedLine : reply ? '\n\n(Lost the connection there. Ask again.)' : o.errorLine);
      } finally {
        logAssistant({
          persona: o.persona, courseId: o.courseId, inputTokens: usage.input, outputTokens: usage.output,
          cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, stopReason, ms: Date.now() - started,
          ...(toolNames.length ? { tools: toolNames } : {}),
        });
        send('end', { reason: ended });
        controller.close();
      }
    },
  });
  return new Response(readable, { headers: STREAM_HEADERS });
}

/** A plain JSON refusal in the same voice, before any streaming starts. */
export function assistantRefusal(error: string, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}
