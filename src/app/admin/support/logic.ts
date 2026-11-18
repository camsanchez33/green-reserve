// Course support (ADMIN-REDO, Cam approved the mockup 2026-11-12): the page's pure rules. The chats are Build's
// (GET /api/admin/support, …/[id], POST …/[id]/reply). Run: npx tsx scripts/admin-support-test.ts

// The shapes are Build's own (type-only imports are erased, so nothing server-side reaches the browser); a change there
// breaks tsc here instead of drifting.
import type { AdminThread, AdminMessage } from '@/lib/support-chats';

export type ThreadRow = AdminThread;
export type Message = AdminMessage;
export interface Thread extends Omit<ThreadRow, 'lastAt' | 'lastFrom' | 'lastText'> { messages: Message[] }

/** The same limit as lib/support-chats MAX_MESSAGE (pinned by the test). */
export const MAX_REPLY = 5000;

/** ?courseId= (a link from a course's page, its emails or the old Messages screen): the chat to open on its own, or null.
 *  Only from a list loaded with no search (`loadedQ` is the query the shown result was fetched with, so a list that is
 *  still the last search's never counts), only once, and only when that course has exactly one chat. */
export function autoOpenChat(courseId: string, loadedQ: string | null, rows: { id: string; courseId: string }[], alreadyOpened: boolean): string | null {
  if (!courseId || alreadyOpened || loadedQ === null || loadedQ.trim() !== '') return null;
  const mine = rows.filter(r => r.courseId === courseId);
  return mine.length === 1 ? mine[0].id : null;
}

export const isList = (v: unknown): v is { threads: ThreadRow[] } => !!v && Array.isArray((v as { threads?: unknown }).threads);
export const isThread = (v: unknown): v is Thread => {
  const t = v as Thread | null;
  return !!t && typeof t.id === 'string' && Array.isArray(t.messages);
};

/** "now", "5m ago", "3h ago", "2d ago", then the date. */
export function ago(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
}

/** A message's time, Eastern: "Nov 11, 5:03 PM". */
export const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The reply as sent: trimmed; null when empty or too long. */
export function replyText(s: string): string | null {
  const t = s.trim();
  return t && t.length <= MAX_REPLY ? t : null;
}

/** The list's preview line: "You: …" when the last message is ours. */
export const preview = (t: Pick<ThreadRow, 'lastFrom' | 'lastText'>) => (t.lastFrom === 'us' ? `You: ${t.lastText}` : t.lastText);
