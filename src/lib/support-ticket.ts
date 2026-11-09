// MSG-1 (Cam 2026-11-09): a course's message to GreenReserve is a ticket until we reply. Pure, browser-safe.
/** How long GreenReserve has to reply (Cam: "take away one business day — say 48 hours"). */
export const REPLY_HOURS = 48;

type Msg = { id: string; senderType: string; createdAt: string; isBroadcast?: boolean };

/** The first of the course's messages still waiting on a reply (after our last direct reply), or null. */
export function waitingSince<T extends Msg>(messages: T[]): T | null {
  let lastReply = -1;
  messages.forEach((m, i) => { if (m.senderType === 'admin' && !m.isBroadcast) lastReply = i; });
  return messages.slice(lastReply + 1).find(m => m.senderType === 'operator') ?? null;
}

/** A ticket's short reference: the last 6 of the message id, upper case. */
export const ticketRef = (id: string) => id.slice(-6).toUpperCase();

/** Time left before the reply is due: "31h 12m", "45m"; overdue once it's past. */
export function dueIn(createdAt: string, now: number): { label: string; overdue: boolean } {
  const ms = Date.parse(createdAt) + REPLY_HOURS * 3600_000 - now;
  if (!Number.isFinite(ms) || ms <= 0) return { label: '0m', overdue: true };
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60), m = mins % 60;
  return { label: h > 0 ? `${h}h ${m}m` : `${m}m`, overdue: false };
}
