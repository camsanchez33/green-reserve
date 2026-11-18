'use client';
// Inquiries (Cam approved the mockup 2026-11-17): what the list, the course page and the call page share — the one
// fetch helper (keeps the server's error, code and extra fields, which the add and Said yes flows need), dates in
// Eastern, the load-error strip and the toast. Data: /api/admin/outreach (Build, lanes/build.md "Inquiries data").
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminSession } from '@/lib/admin-session-context';
import { MANAGER_PLUS } from '@/lib/admin-roles';
import g from '../admin-glass.module.css';
import iq from './inquiries.module.css';

export type Res<T> = { ok: true; data: T } | { ok: false; status: number; error: string; body: Record<string, unknown> };

/** fetch → JSON, never throws. A failure keeps the status, the server's words and its body (code, duplicates…). */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<Res<T>> {
  try {
    const r = await fetch(url, {
      method: init?.method ?? 'GET', cache: 'no-store',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const body = await r.json().catch(() => null) as Record<string, unknown> | null;
    if (r.ok && body) return { ok: true, data: body as T };
    const fallback = r.status === 401 ? 'Your session ended — sign in again.'
      : r.status === 403 ? "Your login can't do that here."
      : `It didn't work (${r.status}). Try again.`;
    return { ok: false, status: r.status, error: typeof body?.error === 'string' ? body.error : fallback, body: body ?? {} };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach GreenReserve. Check the connection and try again.", body: {} };
  }
}

/** Writes are manager and up (the routes refuse the rest; this only hides the controls). */
export function useCanWrite(): boolean {
  const { role } = useAdminSession();
  return MANAGER_PLUS.includes(role);
}

const TZ = 'America/New_York';
const ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
export const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
export const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });
export const whenLabel = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(/, (\d)/, ' · $1');
export const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** "Today", "Tomorrow" or "Nov 20", by the Eastern calendar. */
export function dueLabel(iso: string, now = new Date()): string {
  const d = ymd(new Date(iso)), today = ymd(now), tomorrow = ymd(new Date(now.getTime() + 86_400_000));
  if (d < today) return `${dayLabel(iso)}, overdue`;
  return d === today ? 'Today' : d === tomorrow ? 'Tomorrow' : dayLabel(iso);
}
/** A date input's value → noon Eastern that day, as ISO (a date, never a time that slides across midnight). */
export const dateInputToIso = (v: string) => (v ? new Date(`${v}T12:00:00-05:00`).toISOString() : '');
export const todayInput = (plusDays = 0) => ymd(new Date(Date.now() + plusDays * 86_400_000));
/** "in 2 days, 21 hours" / "in 40 minutes" / "started 5 minutes ago". */
export function countdown(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now;
  const m = Math.round(Math.abs(ms) / 60_000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  const parts = d ? [`${d} day${d === 1 ? '' : 's'}`, h ? `${h} hour${h === 1 ? '' : 's'}` : ''] : h ? [`${h} hour${h === 1 ? '' : 's'}`, mm ? `${mm} min` : ''] : [`${mm} minute${mm === 1 ? '' : 's'}`];
  const t = parts.filter(Boolean).join(', ');
  return ms >= 0 ? `in ${t}` : `started ${t} ago`;
}
export const directionLabel = (d: string, past = false) => (d === 'they_call' ? (past ? 'They called us' : 'They call us') : past ? 'We called' : 'We call them');

export function LoadError({ error, status, retry, busy }: { error: string; status: number; retry: () => void; busy: boolean }) {
  return (
    <div className={`${g.glass} ${g.note}`} role="alert">
      <span className={g.down}>{error}</span>
      {status === 401 ? <Link href="/admin/login">Sign in</Link> : status === 403 ? null : <button type="button" onClick={retry} disabled={busy}>{busy ? 'Trying…' : 'Try again'}</button>}
    </div>
  );
}

/** `const [toast, say] = useToast()`: a short line at the foot of the screen that clears itself. */
export function useToast(): [React.ReactNode, (m: React.ReactNode) => void] {
  const [msg, setMsg] = useState<React.ReactNode>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((m: React.ReactNode) => {
    setMsg(m);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(null), 4000);
  }, []);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return [msg ? <div className={iq.toast} role="status">{msg}</div> : null, say];
}

export const ICON = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
export const Chevron = () => <svg {...ICON} width={14} height={14}><path d="m9 6 6 6-6 6" /></svg>;
export const ExtIcon = () => <svg {...ICON} width={12} height={12}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
