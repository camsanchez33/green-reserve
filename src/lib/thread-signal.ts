// MP-7a. ONE answer to "is this course waiting on us, and for how long?"
//
// The Overview's action queue had its own version of this (last message is
// from the operator and older than two days) and the Messages list had none —
// so the Overview could say "unanswered · 38d" about a thread the inbox showed
// as just another row. Both read from here now.
//
// Announcements are ignored on purpose. A broadcast used to insert an
// admin-authored message into every thread (MP-7b stopped that; old copies remain), so without this rule sending one would make every
// operator's open question look answered.

import { REPLY_BUSINESS_DAYS, replyDueAt } from './support-ticket';

/** SUPPORT (Cam 2026-11-12): overdue = the reply promise (2 BUSINESS days, lib/support-ticket) has passed for the
 *  first message still waiting — not 2 calendar days after the last one. */
export const UNANSWERED_AFTER_DAYS = REPLY_BUSINESS_DAYS;

export interface SignalMessage {
  senderType: string;            // 'admin' | 'operator'
  createdAt: Date | string;
  isBroadcast?: boolean;
}

export interface ThreadSignal {
  /** The last real (non-broadcast) message came from the operator. */
  waitingOnUs: boolean;
  /** Days since that last real message; 0 when there is none. */
  ageDays: number;
  /** Waiting on us and past the reply promise for the first unanswered message (lib/support-ticket replyDueAt). */
  overdue: boolean;
  /** When that reply is due; null when not waiting on us. */
  dueAt: Date | null;
  lastHumanAt: Date | null;
}

/** `messages` newest-first — the order every list query already uses.
 *  MP-7b: a CLOSED thread is never waiting on us — closing is the admin
 *  saying it's finished; a new message from either side reopens it. */
export function threadSignal(messages: SignalMessage[], now: Date = new Date(), closedAt?: Date | string | null): ThreadSignal {
  const last = messages.find(m => !m.isBroadcast) ?? null;
  if (closedAt) return { waitingOnUs: false, ageDays: 0, overdue: false, dueAt: null, lastHumanAt: last ? new Date(last.createdAt) : null };
  if (!last) return { waitingOnUs: false, ageDays: 0, overdue: false, dueAt: null, lastHumanAt: null };
  const at = new Date(last.createdAt);
  const ageDays = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86400000));
  const waitingOnUs = last.senderType === 'operator';
  if (!waitingOnUs) return { waitingOnUs, ageDays, overdue: false, dueAt: null, lastHumanAt: at };
  // The first course message after our last real reply (messages are newest-first).
  const lastReply = messages.findIndex(m => !m.isBroadcast && m.senderType === 'admin');
  const waiting = (lastReply === -1 ? messages : messages.slice(0, lastReply)).filter(m => !m.isBroadcast && m.senderType === 'operator');
  const first = waiting[waiting.length - 1] ?? last;
  const dueAt = replyDueAt(first.createdAt);
  return { waitingOnUs, ageDays, overdue: now.getTime() >= dueAt.getTime(), dueAt, lastHumanAt: at };
}

/**
 * Inbox order: threads waiting on us first (oldest wait at the top), then
 * everything else by most recent activity. Stable for equal keys.
 */
export function compareThreads<T extends { signal: ThreadSignal; updatedAt: Date | string }>(a: T, b: T): number {
  if (a.signal.waitingOnUs !== b.signal.waitingOnUs) return a.signal.waitingOnUs ? -1 : 1;
  if (a.signal.waitingOnUs) return b.signal.ageDays - a.signal.ageDays;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
