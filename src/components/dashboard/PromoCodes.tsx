'use client';
// PRICE-1 (Cam 2026-10-30: "Promo codes" — "all of this is up to the course"; stacking
// "Course decides per code"): the course's codes on the Schedule page. A code takes a
// percent or an amount a player off the green fee, with optional dates, days, times,
// a use limit and once per golfer. Data: /api/operator/promo-codes (lib/promo-codes.ts).
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';

type Code = { id: string; code: string; kind: string; value: number; startsOn: string | null; endsOn: string | null; days: number[]; fromTime: string | null; toTime: string | null; maxUses: number | null; usesCount: number; onePerGolfer: boolean; withRates: boolean; active: boolean; note: string; bookings: number; discountedCents: number };
type Draft = { id?: string; code: string; kind: 'percent' | 'amount'; value: string; startsOn: string; endsOn: string; days: number[]; fromTime: string; toTime: string; maxUses: string; onePerGolfer: boolean; withRates: boolean; note: string };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const blank = (): Draft => ({ code: '', kind: 'percent', value: '', startsOn: '', endsOn: '', days: [], fromTime: '', toTime: '', maxUses: '', onePerGolfer: false, withRates: false, note: '' });
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const what = (c: Code) => (c.kind === 'percent' ? `${c.value}% off` : `${usd(c.value)} off a player`);
const limits = (c: Code) => [
  c.startsOn || c.endsOn ? `${c.startsOn ?? '…'} – ${c.endsOn ?? '…'}` : '',
  c.days.length ? c.days.map(d => DAYS[d]).join(' ') : '',
  c.fromTime || c.toTime ? `${c.fromTime ?? ''}–${c.toTime ?? ''}` : '',
  c.maxUses != null ? `${c.usesCount}/${c.maxUses} used` : `${c.usesCount} used`,
  c.onePerGolfer ? 'once each' : '',
  c.withRates ? 'with member rates' : '',
].filter(Boolean).join(' · ');

export function PromoCodes({ canEdit }: { canEdit: boolean }) {
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    const r = await dfetch<{ codes: Code[] }>('/api/operator/promo-codes');
    if (r.ok) { setCodes(r.data.codes); setError(''); } else setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  const edit = (c: Code) => { setFormError(''); setDraft({ id: c.id, code: c.code, kind: c.kind === 'amount' ? 'amount' : 'percent', value: c.kind === 'amount' ? (c.value / 100).toFixed(2) : String(c.value), startsOn: c.startsOn ?? '', endsOn: c.endsOn ?? '', days: c.days, fromTime: c.fromTime ?? '', toTime: c.toTime ?? '', maxUses: c.maxUses == null ? '' : String(c.maxUses), onePerGolfer: c.onePerGolfer, withRates: c.withRates, note: c.note }); };
  async function save() {
    if (!draft) return;
    setBusy(true); setFormError('');
    const value = draft.kind === 'amount' ? Math.round(Number(draft.value) * 100) : Number(draft.value);
    const body = { ...draft, value, maxUses: draft.maxUses };
    const r = await dfetch('/api/operator/promo-codes', { method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { setFormError(r.error); return; }
    setDraft(null); load();
  }
  async function toggle(c: Code) {
    const r = await dfetch('/api/operator/promo-codes', { method: 'PATCH', body: JSON.stringify({ id: c.id, active: !c.active }) });
    if (!r.ok) { setError(r.error); return; }
    load();
  }

  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-ink">Promo codes</h2>
        {canEdit && !draft && <button onClick={() => { setFormError(''); setDraft(blank()); }} className="text-[13px] font-medium text-pine hover:underline underline-offset-4">New code</button>}
      </div>
      {error && <div className="mt-3"><LoadError message={error} onRetry={load} /></div>}
      {draft && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3 bg-paper/70 rounded-md p-3">
          <label className="text-[12.5px] text-ink-soft">Code<input value={draft.code} disabled={!!draft.id} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className={INPUT + ' block mt-1 w-full'} /></label>
          <div className="flex gap-2 items-end">
            <label className="text-[12.5px] text-ink-soft">Off<select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })} className={INPUT + ' block mt-1'}><option value="percent">Percent</option><option value="amount">$ a player</option></select></label>
            <label className="text-[12.5px] text-ink-soft flex-1">{draft.kind === 'percent' ? '%' : '$'}<input value={draft.value} onChange={e => setDraft({ ...draft, value: e.target.value })} inputMode="decimal" className={INPUT + ' block mt-1 w-full'} /></label>
          </div>
          <label className="text-[12.5px] text-ink-soft">From<input type="date" value={draft.startsOn} onChange={e => setDraft({ ...draft, startsOn: e.target.value })} className={INPUT + ' block mt-1 w-full'} /></label>
          <label className="text-[12.5px] text-ink-soft">To<input type="date" value={draft.endsOn} onChange={e => setDraft({ ...draft, endsOn: e.target.value })} className={INPUT + ' block mt-1 w-full'} /></label>
          <label className="text-[12.5px] text-ink-soft">Tee times from<input type="time" value={draft.fromTime} onChange={e => setDraft({ ...draft, fromTime: e.target.value })} className={INPUT + ' block mt-1 w-full'} /></label>
          <label className="text-[12.5px] text-ink-soft">Until<input type="time" value={draft.toTime} onChange={e => setDraft({ ...draft, toTime: e.target.value })} className={INPUT + ' block mt-1 w-full'} /></label>
          <div className="sm:col-span-2 flex flex-wrap gap-1">
            {DAYS.map((d, i) => (
              <button key={d} type="button" aria-pressed={draft.days.includes(i)} onClick={() => setDraft({ ...draft, days: draft.days.includes(i) ? draft.days.filter(x => x !== i) : [...draft.days, i] })}
                className={'px-2.5 py-1 rounded-md text-[12.5px] border ' + (draft.days.includes(i) ? 'border-pine text-pine bg-white' : 'border-line text-ink-soft')}>{d}</button>
            ))}
          </div>
          <label className="text-[12.5px] text-ink-soft">Uses<input value={draft.maxUses} onChange={e => setDraft({ ...draft, maxUses: e.target.value })} inputMode="numeric" placeholder="No limit" className={INPUT + ' block mt-1 w-full'} /></label>
          <div className="flex flex-col justify-end gap-1 text-[13px] text-ink">
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.onePerGolfer} onChange={e => setDraft({ ...draft, onePerGolfer: e.target.checked })} className="accent-pine" />Once per golfer</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.withRates} onChange={e => setDraft({ ...draft, withRates: e.target.checked })} className="accent-pine" />Works with member and resident rates</label>
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <button onClick={save} disabled={busy} className="bg-pine hover:bg-pine-hover text-white text-[13px] font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            <button onClick={() => setDraft(null)} className="text-[13px] text-ink-soft hover:text-ink px-1 py-1.5">Cancel</button>
          </div>
          {formError && <p role="alert" className="sm:col-span-2 text-[12.5px] text-bad">{formError}</p>}
        </div>
      )}
      {codes && codes.length > 0 && (
        <ul className="mt-4 divide-y divide-line-soft">
          {codes.map(c => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-[13.5px]">
              <StatusDot status={c.active ? 'ok' : 'neutral'} label="" />
              <span className="font-semibold text-ink tabular-nums">{c.code}</span>
              <span className="text-ink">{what(c)}</span>
              <span className="text-ink-muted text-[12.5px]">{limits(c)}</span>
              <span className="ml-auto text-ink-muted text-[12.5px] tabular-nums">{c.bookings} · {usd(c.discountedCents)}</span>
              {canEdit && <>
                <button onClick={() => edit(c)} className="text-[13px] font-medium text-pine hover:underline underline-offset-4">Edit</button>
                <button onClick={() => toggle(c)} className="text-[13px] font-medium text-ink-soft hover:text-ink">{c.active ? 'Turn off' : 'Turn on'}</button>
              </>}
            </li>
          ))}
        </ul>
      )}
      {codes && codes.length === 0 && !draft && <p className="text-[13px] text-ink-muted mt-2">None yet.</p>}
    </Card>
  );
}
