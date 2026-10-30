'use client';
// PRICE-5 (Cam 2026-10-30: prices "based on their analytics … should adjust and not be
// stagnant"; suggest or automatic "course picks"; floor and ceiling "course sets"): the
// Schedule page's demand pricing. A grid of weekday × hour: the percent on the public rate
// now, and this week's suggestion from the last 8 weeks. Online public rate only.
// Data: /api/operator/demand-pricing (lib/demand-pricing.ts).
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';

type Settings = { demandMode: 'off' | 'suggest' | 'auto'; demandFloorPct: number; demandCeilingPct: number; demandSuggestedAt: string | null };
type Hour = { dow: number; hour: number; pct: number; suggestedPct: number; fillPct: number; courseFillPct: number };
type State = { settings: Settings; hours: Hour[]; result?: string | null };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const signed = (n: number) => (n > 0 ? `+${n}%` : n < 0 ? `${n}%` : '0');
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
const MODE_LABEL = { off: 'Off', suggest: 'Suggest — you apply', auto: 'Automatic' } as const;

export function DemandPricing({ canEdit }: { canEdit: boolean }) {
  const [s, setS] = useState<State | null>(null);
  const [draft, setDraft] = useState<{ mode: Settings['demandMode']; floor: string; ceil: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [formError, setFormError] = useState('');
  const [note, setNote] = useState('');

  const take = (d: State) => { setS(d); setDraft({ mode: d.settings.demandMode, floor: String(d.settings.demandFloorPct), ceil: String(d.settings.demandCeilingPct) }); };
  const load = useCallback(async () => {
    const r = await dfetch<State>('/api/operator/demand-pricing');
    if (r.ok) { take(r.data); setError(''); } else setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error && !s) return <LoadError message={`Couldn't load demand pricing — ${error}`} onRetry={load} />;
  if (!s || !draft) return null;
  const st = s.settings;
  const dirty = draft.mode !== st.demandMode || draft.floor !== String(st.demandFloorPct) || draft.ceil !== String(st.demandCeilingPct);

  async function save() {
    if (!draft) return;
    setBusy('save'); setFormError(''); setNote('');
    const r = await dfetch<State>('/api/operator/demand-pricing', { method: 'PATCH', body: JSON.stringify({ demandMode: draft.mode, demandFloorPct: Number(draft.floor), demandCeilingPct: Number(draft.ceil) }) });
    setBusy('');
    if (!r.ok) { setFormError(r.error); return; }
    take(r.data);
    setNote(r.data.result === 'too_little_history' ? 'Saved. Suggestions start once there are 4 weeks of tee times.' : 'Saved.');
  }
  async function act(action: 'apply' | 'reset') {
    setBusy(action); setFormError(''); setNote('');
    const r = await dfetch<State>('/api/operator/demand-pricing', { method: 'POST', body: JSON.stringify({ action }) });
    setBusy('');
    if (!r.ok) { setFormError(r.error); return; }
    take(r.data);
    setNote(action === 'apply' ? 'Suggestions applied.' : 'Back to your own rates.');
  }

  const hours = [...new Set(s.hours.map(h => h.hour))].sort((a, b) => a - b);
  const cell = new Map(s.hours.map(h => [`${h.dow}-${h.hour}`, h]));
  const pending = s.hours.some(h => h.pct !== h.suggestedPct);
  const courseFill = s.hours[0]?.courseFillPct;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-ink">Demand pricing</h2>
        <StatusDot status={st.demandMode === 'off' ? 'neutral' : 'ok'} label={`${MODE_LABEL[st.demandMode]} · ${st.demandFloorPct}–${st.demandCeilingPct}% of your rate`} />
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
        <label className="text-[12.5px] text-ink-soft">Mode
          <select value={draft.mode} disabled={!canEdit} onChange={e => setDraft({ ...draft, mode: e.target.value as Settings['demandMode'] })} className={INPUT + ' block mt-1'}>
            <option value="off">Off</option>
            <option value="suggest">Suggest — you apply</option>
            <option value="auto">Automatic — weekly</option>
          </select>
        </label>
        <label className="text-[12.5px] text-ink-soft">Lowest %<input value={draft.floor} disabled={!canEdit} onChange={e => setDraft({ ...draft, floor: e.target.value })} inputMode="numeric" className={INPUT + ' block mt-1 w-20'} /></label>
        <label className="text-[12.5px] text-ink-soft">Highest %<input value={draft.ceil} disabled={!canEdit} onChange={e => setDraft({ ...draft, ceil: e.target.value })} inputMode="numeric" className={INPUT + ' block mt-1 w-20'} /></label>
        {canEdit && <button onClick={save} disabled={!!busy || !dirty} className="bg-pine hover:bg-pine-hover text-white text-[13px] font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save'}</button>}
      </div>
      <p className="mt-2 text-[12.5px] text-ink-muted">Online public rate only, from the last 8 weeks; the lower of this and a last-minute deal.</p>

      {st.demandMode !== 'off' && (hours.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink">No suggestions yet — they need 4 weeks of tee times.</p>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px] text-ink-muted">
            {courseFill != null && <span>Course fill {courseFill}%</span>}
            {st.demandSuggestedAt && <span>Worked out {new Date(st.demandSuggestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="text-[12.5px] tabular-nums">
              <thead><tr><th className="text-left font-medium text-ink-soft pr-3 py-1">Hour</th>{DOW.map(d => <th key={d} className="font-medium text-ink-soft px-2 py-1">{d}</th>)}</tr></thead>
              <tbody>
                {hours.map(h => (
                  <tr key={h} className="border-t border-line-soft">
                    <td className="pr-3 py-1 text-ink-soft">{hourLabel(h)}</td>
                    {DOW.map((_, d) => {
                      const c = cell.get(`${d}-${h}`);
                      if (!c) return <td key={d} className="px-2 py-1 text-ink-faint text-center">–</td>;
                      return (
                        <td key={d} className="px-2 py-1 text-center" title={`Filled ${c.fillPct}%`}>
                          <span className={c.pct > 0 ? 'text-warn' : c.pct < 0 ? 'text-ok' : 'text-ink'}>{signed(c.pct)}</span>
                          {c.suggestedPct !== c.pct && <span className="text-ink-muted"> → {signed(c.suggestedPct)}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {st.demandMode === 'suggest' && <button onClick={() => act('apply')} disabled={!!busy || !pending} className="bg-pine hover:bg-pine-hover text-white text-[13px] font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{busy === 'apply' ? 'Applying…' : 'Apply suggestions'}</button>}
              <button onClick={() => act('reset')} disabled={!!busy} className="text-[13px] font-medium text-ink-soft hover:text-ink disabled:opacity-50">{busy === 'reset' ? 'Resetting…' : 'Reset to your rates'}</button>
            </div>
          )}
        </div>
      ))}
      {note && <p className="mt-2 text-[12.5px] text-ink-muted">{note}</p>}
      {formError && <p role="alert" className="mt-2 text-[12.5px] text-bad">{formError}</p>}
    </Card>
  );
}
