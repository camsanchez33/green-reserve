// MP-7a. ONE answer to "is this course waiting on us, and for how long?"
//
// The Overview's action queue had its own version of this (last message is
// from the operator and older than two days) and the Messages list had none —
// so the Overview could say "unanswered · 38d" about a thread the inbox showed
// as just another row. Both read from here now.
//
// Announcements are ignored on purpose. A broadcast inserts an admin-authored
// message into every thread, so without this rule sending one would make every
// operator's open question look answered.

export const UNANSWERED_AFTER_DAYS = 2;

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
  /** waitingOnUs for at least UNANSWERED_AFTER_DAYS. */
  overdue: boolean;
  lastHumanAt: Date | null;
}

/** `messages` newest-first — the order every list query already uses. */
export function threadSignal(messages: SignalMessage[], now: Date = new Date()): ThreadSignal {
  const last = messages.find(m => !m.isBroadcast) ?? null;
  if (!last) return { waitingOnUs: false, ageDays: 0, overdue: false, lastHumanAt: null };
  const at = new Date(last.createdAt);
  const ageDays = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86400000));
  const waitingOnUs = last.senderType === 'operator';
  return { waitingOnUs, ageDays, overdue: waitingOnUs && ageDays >= UNANSWERED_AFTER_DAYS, lastHumanAt: at };
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
