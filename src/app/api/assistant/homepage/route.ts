import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { clientIp } from '@/lib/rate-limit';
import { platformAllows, publicIpAllows } from '@/lib/assistant/caps';
import { assistantClient, systemBlocks, logAssistant, personaOff, ASSISTANT_MODEL, ASSISTANT_EFFORT, FALLBACK_BETA } from '@/lib/assistant/prompt';
import { HOMEPAGE_PERSONA, HOMEPAGE_MAX_TOKENS, HOMEPAGE_UNSURE, sanitizeHomepageHistory, homepageReply } from '@/lib/assistant/homepage';
import { shopFeeVersionLive } from '@/lib/shop-fee';

// ASSIST-5 (Cam 2026-11-24): "Ask about GreenReserve" on greenreserve.app. Public, no sign-in, no tools, no account or
// course data: the whole prompt is the frozen persona plus the approved site copy, so it caches as one block.
//
// GET  → { enabled }
// POST { messages } → { reply }
//
// Fails closed without ANTHROPIC_API_KEY. Per-IP per hour, then the platform's homepage budget. Anything but a normal
// answer becomes the "Book a call" line. Logs carry tokens and how the turn ended, never the words.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  return NextResponse.json({ enabled: !!assistantClient() && !personaOff('homepage') }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const client = assistantClient();
  if (!client || personaOff('homepage')) return NextResponse.json({ error: 'Questions are not available right now.' }, { status: 503 });
  // Only this site's own page may ask: a JSON body and no cross-site fetch.
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '') || req.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!(await publicIpAllows('homepage', clientIp(req)))) {
    return NextResponse.json({ error: 'That is a lot of questions — book a call and we will answer them all.' }, { status: 429 });
  }
  let body: { messages?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const history = sanitizeHomepageHistory(body?.messages);
  if (!history.length) return NextResponse.json({ error: 'Ask something first.' }, { status: 400 });
  if (!(await platformAllows('homepage'))) {
    logAssistant({ persona: 'homepage', courseId: null, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, stopReason: null, ms: 0, capped: 'platform_day' });
    return NextResponse.json({ reply: HOMEPAGE_UNSURE });
  }

  const started = Date.now();
  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await client.beta.messages.create({
      model: ASSISTANT_MODEL, max_tokens: HOMEPAGE_MAX_TOKENS, system: systemBlocks(HOMEPAGE_PERSONA, '', ''), messages: history,
      output_config: { effort: ASSISTANT_EFFORT },
      betas: [FALLBACK_BETA], fallbacks: 'default',
    }, { timeout: 12_000, maxRetries: 0 });
  } catch (err) {
    const kind = err instanceof Anthropic.APIConnectionTimeoutError ? 'timeout' : err instanceof Anthropic.APIConnectionError ? 'connection' : err instanceof Anthropic.APIError ? `api ${err.status ?? ''}` : 'error';
    console.error('[assistant] homepage call failed:', kind);
    return NextResponse.json({ reply: HOMEPAGE_UNSURE });
  }
  const text = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('').trim();
  logAssistant({
    persona: 'homepage', courseId: null, inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens,
    cacheRead: msg.usage.cache_read_input_tokens ?? 0, cacheWrite: msg.usage.cache_creation_input_tokens ?? 0,
    stopReason: msg.stop_reason, ms: Date.now() - started,
  });
  if (msg.stop_reason !== 'end_turn' || !text) return NextResponse.json({ reply: HOMEPAGE_UNSURE });
  // Fee wording is written by the server, never the model; anything off-copy about money gets Book a call.
  return NextResponse.json({ reply: homepageReply(text, await shopFeeVersionLive().catch(() => false)) });
}
