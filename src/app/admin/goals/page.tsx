'use client';
// AW-4b (Cam 2026-10-21): Goals — a measure, a target and a date, with progress and whether it is on pace. Settings →
// Goals (Cam approved the mockup 2026-11-16, lanes/admin/goals-mockup.html; lanes/admin.md "Approved, to build:
// Settings → Goals"): a "Goals" card for goals still running and a "Finished" card for reached or missed ones, in My
// profile's card build. Support and up see them; only the owner adds (bare plus) or removes (red link, confirm, then
// step-up as before). The route enforces it; canEdit only hides the controls. The pace is worked out on the page
// (./logic) from what /api/admin/goals already returns — the same GET, POST and DELETE as before.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { ProfileCard, Msg, profileStyles as s } from '@/components/admin/ProfileCard';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { stepUpFetch } from '@/lib/step-up-client';
import { useConfirm } from '../employees/TeamDialogs';
import g from '../admin-glass.module.css';
import gs from './goals.module.css';
import { type Goal, type Metric, type Tone, METRICS, metricLabel, fmt, dueDay, goalView } from './logic';

const ICON = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, 'aria-hidden': true };
const toneClass = (t: Tone) => (t === 'early' ? '' : s[t]);

export default function AdminGoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dialog, ask] = useConfirm();
  // The pace is "by today": read the clock once per load, after mount (the page is client-only data anyway).
  const [now, setNow] = useState(0);

  const say = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<{ goals: Goal[]; canEdit: boolean }>('/api/admin/goals', { subject: 'goals' });
      if (!res.ok) { setLoadError({ msg: res.message, kind: res.kind }); return; }
      setGoals(res.data.goals); setCanEdit(!!res.data.canEdit); setNow(Date.now()); setLoadError(null);
    } catch { setLoadError({ msg: 'Network error — couldn’t load goals. Check your connection and try again.', kind: 'network' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(goal: Goal) {
    const yes = await ask('Remove this goal?', 'It’s gone for good. Asks you to confirm it’s you first.', 'Remove');
    if (!yes) return;
    setRemoving(goal.id); setRemoveError(e => ({ ...e, [goal.id]: '' }));
    try {
      const r = await stepUpFetch(`/api/admin/goals?id=${encodeURIComponent(goal.id)}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setRemoveError(e => ({ ...e, [goal.id]: d.error || `Couldn’t remove it (${r.status}).` }));
      else { say('Goal removed.'); await load(); }
    } catch {
      setRemoveError(e => ({ ...e, [goal.id]: 'Network error — nothing was removed.' }));
    }
    setRemoving(null);
  }

  function row(goal: Goal) {
    const v = goalView(goal, now);
    return (
      <div key={goal.id} className={gs.goal}>
        <div className={gs.gh}>
          <span><b>{metricLabel(goal.metric)}</b><small>{fmt(goal.unit, goal.target)} by {dueDay(goal.dueAt)}</small></span>
          <span className={gs.pct}>{v.pct}%</span>
        </div>
        <div className={gs.bar} role="img" aria-label={`${v.progress}${v.markPct !== undefined ? `; should be at ${v.markPct}% by today` : ''}`}>
          <i className={`${gs.fill} ${v.tone === 'early' ? '' : gs[v.tone]}`} style={{ width: `${v.pct}%` }} />
          {v.markPct !== undefined && <em className={gs.mark} style={{ left: `${v.markPct}%` }} title="Where it should be by today" />}
        </div>
        <div className={gs.meta}>
          <span className={gs.word}><span className={`${s.dot} ${toneClass(v.tone)}`} aria-hidden="true" />{v.word}</span>
          <span>{v.progress}</span>
          {!v.finished && <><span>{v.shouldBe}</span><span>{v.daysLeft}</span></>}
        </div>
        {!v.finished && (
          <div className={gs.boxes}>
            <div><small>Started</small><b>{v.started}</b></div>
            <div><small>Still to go</small><b>{v.toGo}</b></div>
            <div><small>Needed each week</small><b>{v.perWeek}</b></div>
            <div><small>At today’s rate it ends at</small><b>{v.endsAt}</b></div>
          </div>
        )}
        {(canEdit || removeError[goal.id]) && (
          <div className={gs.acts}>
            {removeError[goal.id] && <Msg ok={false}>{removeError[goal.id]}</Msg>}
            {canEdit && <button type="button" className={`${s.lnk} ${s.lnkBad}`} onClick={() => remove(goal)} disabled={removing === goal.id}>{removing === goal.id ? 'Removing…' : 'Remove'}</button>}
          </div>
        )}
      </div>
    );
  }

  const running = (goals ?? []).filter(x => x.status !== 'met' && x.status !== 'missed');
  const finished = (goals ?? []).filter(x => x.status === 'met' || x.status === 'missed');

  return (
    <>
      <AdminSidebar active="goals" />
      <main className={g.main}>
        <div className={g.head}><h1>Goals</h1></div>
        {loadError && (
          <div className={`${g.glass} ${gs.problem}`} role="alert">
            <span>{loadError.msg}</span>
            {loadError.kind === 'unauthorized' ? <Link href="/admin/login" className={s.btn}>Sign in</Link>
              : loadError.kind === 'forbidden' ? null : <button type="button" className={s.btn} onClick={() => load()} disabled={loading}>{loading ? 'Trying…' : 'Try again'}</button>}
          </div>
        )}
        {!loadError && (
          <div className={s.col}>
            <ProfileCard title="Goals" labelId="gl-goals" lead="What GreenReserve is aiming for, and whether it’s on pace."
              top={canEdit ? <button type="button" className={s.plus} onClick={() => setAdding(true)} aria-label="Add a goal" title="Add a goal"><svg {...ICON}><path d="M12 5v14M5 12h14" /></svg></button> : undefined}>
              {!goals && loading && <p className={gs.empty}>Loading…</p>}
              {goals && running.length === 0 && <p className={gs.empty}>No goals yet.</p>}
              {goals && running.map(row)}
            </ProfileCard>
            {finished.length > 0 && (
              <ProfileCard title="Finished" labelId="gl-finished">{finished.map(row)}</ProfileCard>
            )}
          </div>
        )}
      </main>
      {adding && <AddGoal onClose={() => setAdding(false)} onAdded={async () => { setAdding(false); say('Goal added.'); await load(); }} />}
      {dialog}
      {toast && <div className={gs.toast} role="status">{toast}</div>}
    </>
  );
}

/** Add a goal (owner): what it measures as three tiles, then the target and the date. Same POST and errors as before. */
function AddGoal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void | Promise<void> }) {
  const [metric, setMetric] = useState<Metric>('courses_live');
  const [target, setTarget] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = useRef<HTMLButtonElement>(null);

  // Focus the first tile once on open; Escape closes unless it's saving (refs, so typing never moves the focus).
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) closeRef.current(); };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); prev?.focus?.(); };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!target.trim() || !dueDate) { setError('Add a target and a date.'); return; }
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metric, target, dueDate }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || `Couldn’t save the goal (${r.status}).`); setBusy(false); return; }
      setBusy(false);
      await onAdded();
    } catch {
      setError('Network error — the goal wasn’t saved. Try again.');
      setBusy(false);
    }
  }

  // Into the admin shell: it carries the --g-* tokens, and a glass card's backdrop-filter would trap a fixed overlay.
  const host = typeof document !== 'undefined' ? (document.querySelector('[data-admin-shell]') ?? document.body) : null;
  if (!host) return null;
  return createPortal(
    <div className={s.ov} onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form onSubmit={add} noValidate className={`${g.glass} ${s.modal} ${gs.wideModal}`} role="dialog" aria-modal="true" aria-labelledby="gl-add-t">
        <h4 id="gl-add-t">Add a goal</h4>
        <div className={gs.lab} id="gl-what">What</div>
        <div className={gs.tiles} role="radiogroup" aria-labelledby="gl-what">
          {METRICS.map((m, i) => (
            <button key={m.key} ref={i === 0 ? first : undefined} type="button" role="radio" aria-checked={metric === m.key} className={gs.tile} onClick={() => setMetric(m.key)} disabled={busy}>
              <i aria-hidden="true" /><span><b>{m.label}</b><small>{m.hint}</small></span>
            </button>
          ))}
        </div>
        <div className={gs.two}>
          <label>Target{metric === 'fees' ? ' ($)' : ''}<input className={s.fld} type="number" inputMode="decimal" min="1" step={metric === 'fees' ? '0.01' : '1'} value={target} onChange={e => setTarget(e.target.value)} disabled={busy} /></label>
          <label>By<input className={s.fld} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={busy} /></label>
        </div>
        {error && <Msg ok={false}>{error}</Msg>}
        <div className={s.line}>
          <button type="button" className={s.lnk} onClick={onClose} disabled={busy}>Cancel</button>
          <span className={gs.spring} />
          <button type="submit" className={`${s.btn} ${s.pri}`} disabled={busy}>{busy ? 'Saving…' : 'Add goal'}</button>
        </div>
      </form>
    </div>, host,
  );
}
