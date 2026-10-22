'use client';
// BRAIN-2a / ADMIN-C (Cam 2026-10-22): Problems — everything the hourly check
// finds that a person has to fix, as a work list. A problem is never closed by
// hand: it clears when the check stops seeing it. People take it, give it to
// someone, note what they did, or snooze it with a reason. Data and every rule
// about who may do what: /api/admin/problems.
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatRelative as fmtAgo } from '@/lib/format';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';

interface Problem {
  id: string; title: string; detail: string; href: string;
  courseId: string | null; courseName: string | null;
  openedAt: string; clearedAt: string | null;
  ownerId: string | null; ownerName: string;
  snoozedUntil: string | null; snoozeReason: string;
  state: 'open' | 'snoozed' | 'cleared';
  history: { at: string; kind: string; who: string; text: string }[];
}
interface Data {
  open: Problem[]; snoozed: Problem[]; cleared: Problem[];
  admins: { id: string; name: string }[]; canManage: boolean; me: string; snoozeDays: number[];
}
type Tab = 'open' | 'snoozed' | 'cleared';
const TABS: { key: Tab; label: string }[] = [{ key: 'open', label: 'Open' }, { key: 'snoozed', label: 'Snoozed' }, { key: 'cleared', label: 'Cleared, last 30 days' }];
const KIND: Record<string, string> = {
  opened: 'Found', reopened: 'Came back', cleared: 'Cleared', claimed: 'Took it', assigned: 'Assigned',
  note: 'Note', snoozed: 'Snoozed', unsnoozed: 'Woken up',
};
const BTN = 'text-[13px] font-medium px-3 py-1.5 rounded-md border border-line text-ink hover:border-pine/40 disabled:opacity-50';
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function ProblemRow({ p, data, onDone, startOpen }: { p: Problem; data: Data; onDone: () => Promise<void>; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [days, setDays] = useState(String(data.snoozeDays[0] ?? 1));
  const [reason, setReason] = useState('');
  const live = p.state !== 'cleared';

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setErr('');
    try {
      const r = await fetch('/api/admin/problems', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, action, ...extra }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || `That didn’t work (${r.status}). Try again.`); setBusy(''); return; }
      if (action === 'note') setNote('');
      if (action === 'snooze') setReason('');
      await onDone();
    } catch {
      setErr('Network error — nothing was changed. Try again.');
    }
    setBusy('');
  }

  return (
    <div id={p.id} className="py-4 border-b border-line-soft last:border-0 scroll-mt-20">
      <div className="flex items-start gap-3">
        <span className="pt-1.5"><StatusDot status={p.state === 'open' ? 'bad' : p.state === 'snoozed' ? 'warn' : 'ok'} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[14.5px] font-medium text-ink">{p.title}</div>
          <div className="text-[13px] text-ink-soft">
            {p.courseName && p.courseId && <><Link href={`/admin/courses/${p.courseId}`} className="hover:underline underline-offset-2">{p.courseName}</Link> · </>}
            {p.detail}
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-muted">
            {p.state === 'cleared' && p.clearedAt ? `Cleared ${fmtAgo(new Date(p.clearedAt).getTime())} · ` : ''}
            Found {fmtAgo(new Date(p.openedAt).getTime())}
            {' · '}{p.ownerName ? `${p.ownerName} has it` : 'Nobody has it'}
            {p.snoozedUntil && ` · snoozed until ${when(p.snoozedUntil)}: ${p.snoozeReason}`}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {live && p.ownerId !== data.me && (
            <button type="button" onClick={() => act('claim')} disabled={!!busy} className="text-[13px] font-medium px-3 py-1.5 rounded-md bg-pine hover:bg-pine-hover text-white disabled:opacity-50">
              {busy === 'claim' ? 'Taking…' : 'Take it'}
            </button>
          )}
          <Link href={p.href} className={BTN}>Go to it</Link>
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="text-[13px] text-ink-soft hover:text-ink px-1">
            {open ? 'Less' : 'More'}
          </button>
        </div>
      </div>

      {err && <p role="alert" className="mt-2 ml-5 text-[12.5px] text-bad">{err}</p>}

      {open && (
        <div className="mt-3 ml-5 grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            {live && (
              <form onSubmit={e => { e.preventDefault(); if (note.trim()) act('note', { text: note }); }} className="flex flex-col gap-2">
                <label htmlFor={`note-${p.id}`} className="text-[13px] text-ink-soft">What did you do?</label>
                <textarea id={`note-${p.id}`} value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={2000} className={INPUT} placeholder="Called the course, they’ll update the card tonight" />
                <button type="submit" disabled={!!busy || !note.trim()} className={`${BTN} self-start`}>{busy === 'note' ? 'Saving…' : 'Add note'}</button>
              </form>
            )}
            {live && data.canManage && (
              <div className="flex flex-col gap-2">
                <label htmlFor={`assign-${p.id}`} className="text-[13px] text-ink-soft">Who has it</label>
                <select id={`assign-${p.id}`} value={p.ownerId ?? ''} disabled={!!busy} onChange={e => act('assign', { adminId: e.target.value || null })} className={`${INPUT} self-start`}>
                  <option value="">Nobody</option>
                  {data.admins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
            {live && data.canManage && (p.state === 'snoozed' ? (
              <button type="button" onClick={() => act('unsnooze')} disabled={!!busy} className={`${BTN} self-start`}>{busy === 'unsnooze' ? 'Waking…' : 'Wake it up now'}</button>
            ) : (
              <form onSubmit={e => { e.preventDefault(); act('snooze', { days: Number(days), reason }); }} className="flex flex-col gap-2">
                <span className="text-[13px] text-ink-soft">Snooze it</span>
                <div className="flex flex-wrap gap-2">
                  <select aria-label="How long" value={days} onChange={e => setDays(e.target.value)} className={INPUT}>
                    {data.snoozeDays.map(d => <option key={d} value={d}>{d} day{d === 1 ? '' : 's'}</option>)}
                  </select>
                  <input aria-label="Why it can wait" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Why it can wait" className={`${INPUT} flex-1 min-w-[180px]`} />
                  <button type="submit" disabled={!!busy || reason.trim().length < 4} className={BTN}>{busy === 'snooze' ? 'Snoozing…' : 'Snooze'}</button>
                </div>
              </form>
            ))}
            {!live && <p className="text-[13px] text-ink-muted">The hourly check stopped seeing this, so it cleared on its own.</p>}
          </div>
          <div>
            <div className="text-[13px] text-ink-soft mb-1.5">History</div>
            {p.history.length === 0 ? <p className="text-[13px] text-ink-muted">Nothing yet.</p> : (
              <ol className="flex flex-col gap-1.5">
                {p.history.map((h, i) => (
                  <li key={i} className="text-[13px] text-ink">
                    <span className="text-ink-muted tabular-nums">{when(h.at)}</span>
                    {' · '}{KIND[h.kind] ?? h.kind}{h.who ? ` by ${h.who}` : ''}{h.text ? `: ${h.text}` : ''}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminProblemsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('open');
  const [hash, setHash] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/problems');
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setData(d); setError(''); }
      else setError(d.error || (r.status === 401 ? 'Your session ended — sign in again.' : `Couldn’t load problems (${r.status}).`));
    } catch {
      setError('Network error — couldn’t load problems.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { setHash(window.location.hash.slice(1)); load(); }, [load]);
  // A link from Home (#id) opens that problem on whichever tab holds it.
  useEffect(() => {
    if (!data || !hash) return;
    const t = (['open', 'snoozed', 'cleared'] as Tab[]).find(k => data[k].some(p => p.id === hash));
    if (t) { setTab(t); setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: 'start' }), 50); }
  }, [data, hash]);

  const list = data ? data[tab] : [];

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar active="problems" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-10 pt-2.5 pb-10">
          <div className="flex items-end justify-between border-b border-line pb-4 gap-4">
            <div>
              <h1 className="m-0 text-[32px] font-bold tracking-[-0.02em] text-ink leading-none">Problems</h1>
              <p className="mt-2 text-[13.5px] text-ink-soft">What the hourly check found that someone has to fix. Each one clears by itself once it’s fixed.</p>
            </div>
          </div>

          {error && (
            <div role="alert" className="mt-5 rounded-md border border-bad/20 bg-bad/5 px-4 py-2.5 flex items-start justify-between gap-3">
              <p className="text-xs text-bad">{error}</p>
              <button type="button" onClick={() => { setLoading(true); load(); }} className="text-xs font-medium text-ink-soft hover:text-ink shrink-0">Try again</button>
            </div>
          )}
          {loading && !data && <p className="text-ink-muted text-center py-20 text-sm">Loading…</p>}

          {data && (
            <>
              <div role="tablist" className="mt-5 flex gap-6 border-b border-line">
                {TABS.map(t => (
                  <button
                    key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                    className={`pb-2.5 -mb-px text-[14px] border-b-2 ${tab === t.key ? 'border-fairway text-ink font-semibold' : 'border-transparent text-ink-soft hover:text-ink'}`}
                  >
                    {t.label} <span className="text-ink-muted font-normal tabular-nums">{data[t.key].length}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1">
                {list.length === 0 ? (
                  <p className="py-10 text-[14px] text-ink-soft flex items-center gap-2">
                    {tab === 'open' ? <><StatusDot status="ok" />Nothing is broken right now.</> : tab === 'snoozed' ? 'Nothing is snoozed.' : 'Nothing cleared in the last 30 days.'}
                  </p>
                ) : list.map(p => <ProblemRow key={p.id} p={p} data={data} onDone={load} startOpen={p.id === hash} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
