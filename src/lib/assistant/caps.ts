// ASSIST-1: what the assistant may spend. Every counter key starts with "birdie:", so rateLimit() fails CLOSED on
// these — a broken counter must never uncap paid API spend (lib/rate-limit).
import { prisma } from '../prisma';
import { rateLimit } from '../rate-limit';
import { todayIn } from '../course-time';
import type { AssistantPersona } from './prompt';
import { clampLimit } from './settings';

/**
 * Platform-wide questions per UTC day, per persona, so a busy golfer day can't starve the course staff's assistant.
 * The operator figure is the old PLATFORM_PER_DAY.
 */
export const PLATFORM_PER_DAY: Record<AssistantPersona, number> = { operator: 600, golfer: 3000, homepage: 500, admin: 200 };
/** Per visitor (IP) per hour on the public bots. */
export const PUBLIC_PER_IP_PER_HOUR = 20;

const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);
export const golferDayKey = (courseId: string, timezone: string | null | undefined, now = new Date()) => `birdie:golfer:${courseId}:${todayIn(timezone, now)}`;

/** Counts one question against the persona's platform budget. False = over it (or the counter is broken). */
export function platformAllows(persona: AssistantPersona, now = new Date()): Promise<boolean> {
  return rateLimit(`birdie:platform:${persona}:${utcDay(now)}`, PLATFORM_PER_DAY[persona], 86_400);
}

/** Counts one golfer question against the course's own day (course-local). False = the course's limit is reached. */
export function golferDayAllows(courseId: string, timezone: string | null | undefined, limit: number, now = new Date()): Promise<boolean> {
  return rateLimit(golferDayKey(courseId, timezone, now), clampLimit(limit), 86_400);
}

/** How many golfer questions the course has had today, for Settings → Assistant ("37 of 300"). Reads only. */
export async function golferQuestionsToday(courseId: string, timezone: string | null | undefined, now = new Date()): Promise<number> {
  try {
    const rows = await prisma.rateLimit.findUnique({ where: { key: golferDayKey(courseId, timezone, now) }, select: { count: true, windowStart: true } });
    if (!rows) return 0;
    // A row older than a day is yesterday's window, about to reset.
    return now.getTime() - rows.windowStart.getTime() > 86_400_000 ? 0 : rows.count;
  } catch { return 0; }
}

/** Per-IP budget on a public bot. */
export function publicIpAllows(persona: 'golfer' | 'homepage', ip: string): Promise<boolean> {
  return rateLimit(`birdie:ip:${persona}:${ip}`, PUBLIC_PER_IP_PER_HOUR, 3600);
}
