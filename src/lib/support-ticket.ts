// MSG-1 (Cam 2026-11-09): a course's message to GreenReserve is a ticket until we reply. Pure, browser-safe.
// SUPPORT (Cam 2026-11-12, via Build): the reply promise is 2 business days (Eastern, weekends skipped), reversing
// MSG-1's 48 hours. ONE definition, lib/business-days; the course's page, the admin overdue check and every
// support email read it from here.
import { addBusinessDays } from './business-days';

/** How long GreenReserve has to reply, in business days. */
export const REPLY_BUSINESS_DAYS = 2;
/** The promise in words, for every page and email that states it. */
export const REPLY_PROMISE = '2 business days';

/** When the reply to a message sent at `sentAt` is due. */
export const replyDueAt = (sentAt: Date | string): Date => addBusinessDays(new Date(sentAt), REPLY_BUSINESS_DAYS);

type Msg = { id: string; senderType: string; createdAt: string | Date; isBroadcast?: boolean };

/** The first of the course's messages still waiting on a reply (after our last direct reply), or null. */
export function waitingSince<T extends Msg>(messages: T[]): T | null {
  let lastReply = -1;
  messages.forEach((m, i) => { if (m.senderType === 'admin' && !m.isBroadcast) lastReply = i; });
  return messages.slice(lastReply + 1).find(m => m.senderType === 'operator') ?? null;
}

/** A ticket's short reference: the last 6 of the message id, upper case. */
export const ticketRef = (id: string) => id.slice(-6).toUpperCase();

/** Time left before the reply is due: "31h 12m", "45m"; overdue once it's past. */
export function dueIn(createdAt: string | Date, now: number): { label: string; overdue: boolean } {
  const ms = replyDueAt(createdAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return { label: '0m', overdue: true };
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60), m = mins % 60;
  return { label: h > 0 ? `${h}h ${m}m` : `${m}m`, overdue: false };
}
