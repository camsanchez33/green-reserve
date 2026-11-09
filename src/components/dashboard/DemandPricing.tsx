'use client';
// PRICE-5 (Cam 2026-10-30: prices "based on their analytics … should adjust and not be
// stagnant"; suggest or automatic "course picks"; floor and ceiling "course sets"): the
// Schedule page's demand pricing. A grid of weekday × hour: the percent on the public rate
// now, and this week's suggestion from the last 8 weeks. Online public rate only.
// Data: /api/operator/demand-pricing (lib/demand-pricing.ts).
// SCHED-2 (Cam 2026-11-09: "the dynamic demand pricing — lets lay that out a bit more so the course can understand"):
// how it works in three steps (the lib's own rules: 8 weeks looked at, busier hours up and quieter down by at most
// MAX_WEEKLY_STEP points a week, inside the floor and ceiling), the three modes as choices, what the floor and ceiling
// mean on a $100 rate, and a key for the grid.
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { WEEKS_LOOKED_AT, MAX_WEEKLY_STEP } from '@/lib/demand-pricing';

type Settings = { demandMode: 'off' | 'suggest' | 'auto'; demandFloorPct: number; demandCeilingPct: number; demandSuggestedAt: string | null };
type Hour = { dow: number; hour: number; pct: number; suggestedPct: number; fillPct: number; courseFillPct: number };
type State = { settings: Settings; hours: Hour[]; result?: string | null };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const signed = (n: number) => (n > 0 ? `+${n}%` : n < 0 ? `${n}%` : '0');
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
const MODE_LABEL = { off: 'Off', suggest: 'Suggest — you apply', auto: 'Automatic' } as const;
const MODES: [Settings['demandMode'], string, string][] = [
  ['off', 'Off', 'Your prices as you set them.'],
  ['suggest', 'Suggest', 'It works out new percents each week; you apply them.'],
  ['auto', 'Automatic', 'The new percents apply themselves each week.'],
];

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
  // Home's "Let GreenReserve price them for you" lands here: scroll once the card has loaded.
  useEffect(() => { if (s !== null && typeof window !== 'undefined' && window.location.hash === '#demand-pricing') document.getElementById('demand-pricing')?.scrollIntoView({ block: 'start' }); }, [s !== null]); // once, on first load — never again after a Save

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
    <Card id="demand-pricing" className="p-5 scroll-mt-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-ink">Demand pricing</h2>
        <StatusDot status={st.demandMode === 'off' ? 'neutral' : 'ok'} label={`${MODE_LABEL[st.demandMode]} · ${st.demandFloorPct}–${st.demandCeilingPct}% of your rate`} />
      </div>
      <ol className="mt-4 grid sm:grid-cols-3 gap-3 text-[13px]">
        {[
          `Looks at the last ${WEEKS_LOOKED_AT} weeks of your tee times, hour by hour.`,
          `An hour that fills more than your course does goes up; a quieter one goes down — at most ${MAX_WEEKLY_STEP} points a week.`,
          'Never below your lowest or above your highest.',
        ].map((t, i) => (
          <li key={i} className="flex gap-2.5 rounded-md bg-paper/70 px-3 py-2.5">
            <span className="w-5 h-5 shrink-0 rounded-full bg-white text-[12px] font-semibold text-ink flex items-center justify-center tabular-nums">{i + 1}</span>
            <span className="text-ink">{t}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12.5px] text-ink-muted">Online public price only — members and residents never pay more; the counter keeps its price. With a last-minute deal the golfer gets the lower price.</p>

      <div className="mt-5 grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Mode">
        {MODES.map(([k, l, h]) => (
          <button key={k} type="button" role="radio" aria-checked={draft.mode === k} disabled={!canEdit} onClick={() => setDraft({ ...draft, mode: k })}
            className={'text-left rounded-md border px-3.5 py-3 transition-colors disabled:opacity-60 ' + (draft.mode === k ? 'border-pine bg-pine/[0.05]' : 'border-line bg-white hover:bg-paper')}>
            <div className="text-[14px] font-medium text-ink">{l}</div>
            <div className="text-[12.5px] text-ink-soft mt-0.5">{h}</div>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
        <label className="text-[12.5px] text-ink-soft">Lowest %<input value={draft.floor} disabled={!canEdit} onChange={e => setDraft({ ...draft, floor: e.target.value })} inputMode="numeric" className={INPUT + ' block mt-1 w-20'} /></label>
        <label className="text-[12.5px] text-ink-soft">Highest %<input value={draft.ceil} disabled={!canEdit} onChange={e => setDraft({ ...draft, ceil: e.target.value })} inputMode="numeric" className={INPUT + ' block mt-1 w-20'} /></label>
        {Number(draft.floor) > 0 && Number(draft.ceil) > 0 && <span className="text-[13px] text-ink-soft pb-2 tabular-nums">A $100 rate: ${Number(draft.floor)}–${Number(draft.ceil)}</span>}
        {canEdit && <button onClick={save} disabled={!!busy || !dirty} className="bg-pine hover:bg-pine-hover text-white text-[13px] font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{busy === 'save' ? 'Saving…' : 'Save'}</button>}
      </div>

      {st.demandMode !== 'off' && (hours.length === 0 ? (
        <p className="mt-4 text-[13px] text-ink">No suggestions yet — they need 4 weeks of tee times.</p>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px] text-ink-muted">
            <span><span className="text-warn">+</span> up · <span className="text-ok">−</span> down · → suggested</span>
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
