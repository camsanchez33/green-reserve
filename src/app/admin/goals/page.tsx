'use client';
// AW-4b (Cam 2026-10-21): Goals — a measure, a target and a date, with progress
// and whether it is on pace. Support+ can see them; only the owner adds or
// removes one (the route enforces it; canEdit only hides the controls).
import { useState, useEffect, useCallback } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';
import { Card } from '@/components/ui/Card';
import { formatMoney } from '@/lib/format';
import { INPUT } from '@/components/ui/field';
import { stepUpFetch } from '@/lib/step-up-client';

type Metric = 'courses_live' | 'online_rounds' | 'fees';
interface Goal {
  id: string; metric: Metric; label: string; unit: 'count' | 'cents';
  target: number; current: number; startsAt: string; dueAt: string; createdBy: string;
  status: 'met' | 'on_pace' | 'behind' | 'missed'; daysLeft: number;
}
const METRICS: { key: Metric; label: string; hint: string }[] = [
  { key: 'courses_live', label: 'Live courses', hint: 'Counted as of today.' },
  { key: 'online_rounds', label: 'Online bookings', hint: 'Counted from today until the date.' },
  { key: 'fees', label: 'GreenReserve fees ($)', hint: 'Counted from today until the date.' },
];
const STATUS: Record<Goal['status'], { dot: 'ok' | 'warn' | 'bad'; text: string }> = {
  met: { dot: 'ok', text: 'Reached' },
  on_pace: { dot: 'ok', text: 'On pace' },
  behind: { dot: 'warn', text: 'Behind pace' },
  missed: { dot: 'bad', text: 'Missed' },
};

const fmt = (g: Pick<Goal, 'unit'>, n: number) => g.unit === 'cents' ? formatMoney(n / 100) : n.toLocaleString('en-US');
const day = (iso: string) => new Date(new Date(iso).getTime() - 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

export default function AdminGoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [metric, setMetric] = useState<Metric>('courses_live');
  const [target, setTarget] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/goals');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setLoadError(d.error || `Couldn’t load goals (${r.status}).`); return; }
      setGoals(d.goals); setCanEdit(!!d.canEdit); setLoadError('');
    } catch {
      setLoadError('Network error — couldn’t load goals.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveError('');
    try {
      const r = await fetch('/api/admin/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metric, target, dueDate }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setSaveError(d.error || `Couldn’t save the goal (${r.status}).`);
      else { setTarget(''); setDueDate(''); await load(); }
    } catch {
      setSaveError('Network error — the goal wasn’t saved. Try again.');
    }
    setSaving(false);
  }

  async function remove(id: string) {
    setRemoving(id); setRemoveError(s => ({ ...s, [id]: '' }));
    try {
      const r = await stepUpFetch(`/api/admin/goals?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setRemoveError(s => ({ ...s, [id]: d.error || `Couldn’t remove it (${r.status}).` }));
      else await load();
    } catch {
      setRemoveError(s => ({ ...s, [id]: 'Network error — nothing was removed.' }));
    }
    setRemoving(null);
  }

  const hint = METRICS.find(m => m.key === metric)?.hint;

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="goals" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-[800px]">
          <h1 className="text-[30px] leading-none font-serif font-semibold text-ink">Goals</h1>
          <p className="text-[13.5px] text-ink-soft mt-2">What GreenReserve is aiming for, and whether it’s on pace.</p>

          {loadError && (
            <div role="alert" className="mt-5 rounded-md border border-bad/20 bg-bad/5 px-4 py-2.5 flex items-start justify-between gap-3">
              <p className="text-xs text-bad">{loadError}</p>
              <button type="button" onClick={load} className="text-xs font-medium text-ink-soft hover:text-ink shrink-0">Try again</button>
            </div>
          )}
          {!goals && !loadError && <p className="text-ink-muted text-center py-16 text-sm">Loading…</p>}

          {goals && (
            <Card className="p-5 mt-6">
              {goals.length === 0 ? (
                <p className="text-[13.5px] text-ink-soft">No goals yet.{canEdit ? ' Add the first one below.' : ''}</p>
              ) : goals.map(g => {
                const share = g.target > 0 ? Math.min(1, g.current / g.target) : 0;
                const st = STATUS[g.status];
                return (
                  <div key={g.id} className="py-3.5 border-b border-line-soft last:border-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[14.5px] font-semibold text-ink">{g.label}: {fmt(g, g.target)} by {day(g.dueAt)}</span>
                      {canEdit && (
                        <button type="button" onClick={() => remove(g.id)} disabled={removing === g.id} className="shrink-0 text-[12.5px] text-ink-soft hover:text-bad disabled:opacity-50">
                          {removing === g.id ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 bg-line-soft overflow-hidden" aria-hidden="true">
                      <div className="h-full bg-pine" style={{ width: `${Math.round(share * 100)}%` }} />
                    </div>
                    <p className="mt-1.5 text-[13px] text-ink flex items-center gap-2 flex-wrap">
                      <span className="tabular-nums">{fmt(g, g.current)} of {fmt(g, g.target)}</span>
                      <span className="text-ink-muted">·</span>
                      <StatusDot status={st.dot} label={st.text} />
                      {g.status !== 'missed' && g.status !== 'met' && <span className="text-ink-muted">· {g.daysLeft} day{g.daysLeft === 1 ? '' : 's'} left</span>}
                    </p>
                    {removeError[g.id] && <p role="alert" className="mt-1 text-xs text-bad">{removeError[g.id]}</p>}
                  </div>
                );
              })}
            </Card>
          )}

          {goals && canEdit && (
            <Card className="p-5 mt-5">
              <h2 className="text-[15px] font-semibold text-ink">Add a goal</h2>
              <form onSubmit={add} className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto] items-end">
                <label className="text-[13px] text-ink-soft grid gap-1">What
                  <select value={metric} onChange={e => setMetric(e.target.value as Metric)} className={INPUT}>
                    {METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </label>
                <label className="text-[13px] text-ink-soft grid gap-1">Target
                  <input type="number" min="1" step={metric === 'fees' ? '0.01' : '1'} required value={target} onChange={e => setTarget(e.target.value)} className={INPUT} />
                </label>
                <label className="text-[13px] text-ink-soft grid gap-1">By
                  <input type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} className={INPUT} />
                </label>
                <button type="submit" disabled={saving} className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md px-4 py-2.5 text-[14px] disabled:opacity-50">
                  {saving ? 'Saving…' : 'Add'}
                </button>
              </form>
              {hint && <p className="mt-2 text-[12.5px] text-ink-muted">{hint}</p>}
              {saveError && <p role="alert" className="mt-2 text-xs text-bad">{saveError}</p>}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
