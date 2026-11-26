// BIRDIE_AI_SPEC B1 — scope, caps and the kill switch. These are cost
// controls as much as safety controls: the API key costs money.
import { prisma } from '../prisma';
import { rateLimit } from '../rate-limit';
import { platformAllows, PLATFORM_PER_DAY as PERSONA_PER_DAY } from '../assistant/caps';

/** The golfer-message draft (lib/notice-draft) only. The assistant itself runs on lib/assistant/prompt's ASSISTANT_MODEL (ASSIST-1). */
export const BIRDIE_MODEL = 'claude-haiku-4-5';
export const MAX_REPLY_TOKENS = 600;
export const MAX_USER_CHARS = 1500;
export const MAX_HISTORY_TURNS = 12;      // user+assistant messages kept from the client
export const PER_SESSION_PER_HOUR = 20;
/** ASSIST-1: the dashboard assistant's platform cap per UTC day (lib/assistant/caps, per persona). */
export const PLATFORM_PER_DAY = PERSONA_PER_DAY.operator;

export function birdieEnabled(): boolean {
  return process.env.BIRDIE_ENABLED === 'true' && !!process.env.ANTHROPIC_API_KEY;
}

export type BirdieTurn = { role: 'user' | 'assistant'; content: string };

/** Keep the client's history honest: roles whitelisted, text only, capped, last turns only, ends on a user turn. */
export function sanitizeHistory(raw: unknown): BirdieTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: BirdieTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const r = (m as { role?: unknown }).role;
    const c = (m as { content?: unknown }).content;
    if ((r !== 'user' && r !== 'assistant') || typeof c !== 'string') continue;
    const text = c.trim().slice(0, MAX_USER_CHARS);
    if (!text) continue;
    // Merge consecutive same-role turns so the API always alternates.
    const last = turns[turns.length - 1];
    if (last && last.role === r) last.content = `${last.content}\n${text}`.slice(0, MAX_USER_CHARS * 2);
    else turns.push({ role: r, content: text });
  }
  while (turns.length && turns[0].role !== 'user') turns.shift();
  while (turns.length && turns[turns.length - 1].role !== 'user') turns.pop();
  return turns.slice(-MAX_HISTORY_TURNS);
}

const dayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Both caps in one place. Returns the reason to refuse, or null.
 * `courseKey` is the COURSE, not the person: staff and owner share one hourly
 * budget, which is what PER_SESSION_PER_HOUR has always claimed.
 */
export async function checkCaps(courseKey: string): Promise<string | null> {
  if (!(await rateLimit(`birdie:course:${courseKey}`, PER_SESSION_PER_HOUR, 3600))) {
    return 'The assistant has answered a lot in the last hour — give it a little while, or write to us on Support.';
  }
  if (!(await platformAllows('operator'))) {
    return "The assistant is resting for today. Everything it can help with is a page away in the sidebar, or write to us on Support.";
  }
  return null;
}

/** Today's platform-wide message count, for /admin/system. Reads the same counter the cap uses. */
export async function birdieUsageToday(): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<{ count: number }[]>`SELECT "count" FROM "RateLimit" WHERE "key" = ${`birdie:platform:operator:${dayKey()}`}`;
    return Number(rows[0]?.count ?? 0);
  } catch { return 0; }
}
