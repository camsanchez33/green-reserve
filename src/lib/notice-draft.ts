// MSG-2 (Cam 2026-11-06, Message golfers: "should we have a little ai thing there to help them craft
// something"): the course assistant tidies a note staff wrote for the day's golfers. It only rewrites —
// it never adds a fact. Every number (times, holes, prices, dates) in the draft must already be in what
// staff typed, or the draft is refused and they keep their own words. Nothing is sent from here.
import Anthropic from '@anthropic-ai/sdk';
import { BIRDIE_MODEL } from './birdie/guardrails';

const digits = (s: string) => new Set(s.match(/\d+/g) ?? []);

/** The numbers a draft carries that staff never wrote — empty means the draft is safe to offer. */
export function addedNumbers(draft: string, typed: string): string[] {
  const ok = digits(typed);
  return [...digits(draft)].filter(n => !ok.has(n));
}

const SYSTEM = `You tidy a short notice a golf course's staff wrote for the golfers booked that day.
Rewrite it so it is clear, friendly and short. Keep every fact exactly: times, numbers, holes, places, what golfers must do.
Never add a fact, a time, a number, a price, a promise, a link or a phone number that is not in the note.
Plain text, no emojis, no greeting and no sign-off (the email adds those). Reply with the notice only.`;

export async function draftNotice(typed: string, opts: { courseName: string; maxChars: number }): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  const msg = await client.messages.create({
    model: BIRDIE_MODEL, max_tokens: 400, system: SYSTEM,
    messages: [{ role: 'user', content: `Course: ${opts.courseName}\nKeep it under ${opts.maxChars} characters.\n\nStaff note:\n${typed}` }],
  });
  if (msg.stop_reason === 'refusal') return { ok: false, error: 'The assistant couldn’t help with that one — send it as you wrote it.' };
  const text = msg.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('').trim().replace(/^["“]|["”]$/g, '');
  if (!text) return { ok: false, error: 'The assistant came back empty — try again or send it as you wrote it.' };
  if (addedNumbers(text, typed).length) return { ok: false, error: 'The assistant changed a time or number, so its version was thrown out — send it as you wrote it.' };
  // Never cut it to fit: a cut can turn "9:30" into "9:3" (review 2026-11-06).
  if (text.length > opts.maxChars) return { ok: false, error: 'The assistant’s version was too long — send it as you wrote it, or shorten it.' };
  return { ok: true, text };
}
