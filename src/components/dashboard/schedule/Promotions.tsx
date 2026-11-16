'use client';
// SCHEDULE-3 Promotions (was Deals, Cam 2026-11-16): live codes with the columns Code, Promo, Duration, Used and a
// pencil; ended codes sit under a small "Past promos" toggle, each with "Use again"; New and Edit open pop-ups.
// A code keeps everything PRICE-1 lets the course set (dates, days, times, a use limit, once per golfer, with member
// rates) — the pop-up shows each one, so editing a code never drops a limit it had.
// Data: /api/operator/promo-codes (lib/promo-codes.ts). Past = turned off, or its last day has gone by.
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { dfetch } from '@/lib/dashboard-fetch';
import { formatTeeTime as fmtTime } from '@/lib/format';
import { CardHead, PlusButton, PenButton, ChevIcon, Popup, PopupFoot, Block, FIELD, LABEL, LINK, LINK_BAD, PRIMARY } from './ui';

type Code = { id: string; code: string; kind: string; value: number; startsOn: string | null; endsOn: string | null; days: number[]; fromTime: string | null; toTime: string | null; maxUses: number | null; usesCount: number; onePerGolfer: boolean; withRates: boolean; active: boolean; note: string };
type Draft = { id?: string; reuse?: boolean; code: string; kind: 'percent' | 'amount'; value: string; startsOn: string; endsOn: string; days: number[]; fromTime: string; toTime: string; maxUses: string; onePerGolfer: boolean; withRates: boolean; note: string };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const blank = (): Draft => ({ code: '', kind: 'percent', value: '', startsOn: '', endsOn: '', days: [], fromTime: '', toTime: '', maxUses: '', onePerGolfer: false, withRates: false, note: '' });
const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const day = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const promo = (c: Code) => (c.kind === 'percent' ? `${c.value}% off` : `${usd(c.value)} off`);
function duration(c: Code): string {
  const when = c.startsOn && c.endsOn ? `${day(c.startsOn)} – ${day(c.endsOn)}` : c.startsOn ? `From ${day(c.startsOn)}` : c.endsOn ? `Until ${day(c.endsOn)}` : 'Any time';
  return [when, c.days.length ? c.days.map(d => DAYS[d]).join(' ') : '', c.fromTime || c.toTime ? `${c.fromTime ? fmtTime(c.fromTime) : ''}–${c.toTime ? fmtTime(c.toTime) : ''}` : '', c.onePerGolfer ? 'once per golfer' : '', c.withRates ? 'with member prices' : ''].filter(Boolean).join(' · ');
}
const used = (c: Code) => (c.maxUses != null ? `${c.usesCount} of ${c.maxUses}` : String(c.usesCount));
const toDraft = (c: Code, reuse = false): Draft => ({
  id: c.id, reuse, code: c.code, kind: c.kind === 'amount' ? 'amount' : 'percent', value: c.kind === 'amount' ? (c.value / 100).toFixed(2) : String(c.value),
  // Using an ended code again starts it over: its old dates are gone.
  startsOn: reuse ? '' : c.startsOn ?? '', endsOn: reuse ? '' : c.endsOn ?? '', days: c.days, fromTime: c.fromTime ?? '', toTime: c.toTime ?? '',
  maxUses: c.maxUses == null ? '' : String(c.maxUses), onePerGolfer: c.onePerGolfer, withRates: c.withRates, note: c.note,
});
const COLS = 'grid grid-cols-[minmax(0,1fr)_auto_34px] md:grid-cols-[150px_110px_minmax(0,1fr)_90px_88px] gap-3 items-center px-3';

export function Promotions({ canEdit }: { canEdit: boolean }) {
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [showPast, setShowPast] = useState(false);
  const today = new Date().toLocaleDateString('en-CA');

  const load = useCallback(async () => {
    const r = await dfetch<{ codes: Code[] }>('/api/operator/promo-codes');
    if (r.ok) { setCodes(r.data.codes); setError(''); } else setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  const ended = (c: Code) => !c.active || (!!c.endsOn && c.endsOn < today);
  const live = (codes ?? []).filter(c => !ended(c));
  const past = (codes ?? []).filter(ended);

  async function save() {
    if (!draft) return;
    setBusy(true); setFormError('');
    const value = draft.kind === 'amount' ? Math.round(Number(draft.value) * 100) : Number(draft.value);
    const { reuse, ...rest } = draft;
    const r = await dfetch('/api/operator/promo-codes', { method: draft.id ? 'PATCH' : 'POST', body: JSON.stringify({ ...rest, value }) });
    // A past code used again is turned back on once its new terms are saved.
    const on = r.ok && reuse && draft.id ? await dfetch('/api/operator/promo-codes', { method: 'PATCH', body: JSON.stringify({ id: draft.id, active: true }) }) : null;
    setBusy(false);
    if (!r.ok) { setFormError(r.error); return; }
    if (on && !on.ok) { setFormError(`Saved, but it couldn’t be turned back on: ${on.error}`); load(); return; }
    setDraft(null); load();
    toast(draft.id ? (reuse ? 'It’s live again.' : 'Saved.') : 'Code created.', 'ok');
  }
  async function end() {
    if (!draft?.id) return;
    setBusy(true); setFormError('');
    const r = await dfetch('/api/operator/promo-codes', { method: 'PATCH', body: JSON.stringify({ id: draft.id, active: false }) });
    setBusy(false);
    if (!r.ok) { setFormError(r.error); return; }
    setDraft(null); load();
    toast('Ended. It moved to Past promos.', 'ok');
  }

  const editingLive = draft?.id && !draft.reuse && live.some(c => c.id === draft.id);
  return (
    <Card className="px-1.5 pt-1.5 pb-2.5">
      <CardHead title="Promo codes" line="Codes golfers type when they book online.">
        {canEdit && <PlusButton label="New promo code" onClick={() => { setFormError(''); setDraft(blank()); }} />}
      </CardHead>
      {error && <div className="px-3 pb-2"><LoadError message={error} onRetry={load} /></div>}
      {codes && (<>
        <div className={COLS + ' pb-1 text-[12.5px] text-ink-muted'}>
          <span>Code</span><span className="hidden md:block">Promo</span><span className="hidden md:block">Duration</span><span>Used</span><span />
        </div>
        {live.length === 0 && <p className="px-3 py-3 text-[13.5px] text-ink-muted border-t border-line">No live codes.</p>}
        {live.map(c => (
          <div key={c.id} className={COLS + ' py-2.5 border-t border-line text-[13.5px]'}>
            <span className="min-w-0"><b className="block font-mono font-medium text-ink truncate">{c.code}</b><small className="md:hidden block text-[12.5px] text-ink-muted truncate">{promo(c)} · {duration(c)}</small></span>
            <span className="hidden md:block text-ink">{promo(c)}</span>
            <span className="hidden md:block text-[12.5px] text-ink-muted truncate">{duration(c)}</span>
            <span className="text-[12.5px] text-ink-muted tabular-nums">{used(c)}</span>
            <span className="justify-self-end">{canEdit && <PenButton label={`Edit ${c.code}`} onClick={() => { setFormError(''); setDraft(toDraft(c)); }} />}</span>
          </div>
        ))}
        {past.length > 0 && (
          <button type="button" onClick={() => setShowPast(!showPast)} aria-expanded={showPast}
            className="w-full flex gap-1.5 items-center text-left px-3 py-2.5 border-t border-line text-[12.5px] text-ink-muted hover:text-ink">
            <ChevIcon open={showPast} />Past promos · {past.length}
          </button>
        )}
        {showPast && past.map(c => (
          <div key={c.id} className={COLS + ' py-2.5 border-t border-line text-[13.5px] opacity-70'}>
            <span className="min-w-0"><b className="block font-mono font-medium text-ink truncate">{c.code}</b><small className="md:hidden block text-[12.5px] text-ink-muted truncate">{promo(c)} · {duration(c)}</small></span>
            <span className="hidden md:block text-ink">{promo(c)}</span>
            <span className="hidden md:block text-[12.5px] text-ink-muted truncate">{duration(c)}</span>
            <span className="text-[12.5px] text-ink-muted tabular-nums">{used(c)}</span>
            <span className="justify-self-end">{canEdit && <button type="button" onClick={() => { setFormError(''); setDraft(toDraft(c, true)); }} className={LINK + ' whitespace-nowrap'}>Use again</button>}</span>
          </div>
        ))}
      </>)}

      {draft && (
        <Popup title={draft.id ? (draft.reuse ? `Use ${draft.code} again` : `Edit ${draft.code}`) : 'New promo code'} onClose={() => !busy && setDraft(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className={LABEL}>Code<input value={draft.code} disabled={!!draft.id} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })} className={FIELD + ' font-mono'} /></label>
            <div className={LABEL}>
              <span id="promo-off">Promo</span>
              <div className="flex gap-1.5" role="group" aria-labelledby="promo-off">
                <select aria-label="Percent or dollars" value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })} className={FIELD + ' w-auto'}>
                  <option value="percent">% off</option><option value="amount">$ off a player</option>
                </select>
                <input aria-label={draft.kind === 'percent' ? 'Percent off' : 'Dollars off a player'} value={draft.value} inputMode="decimal" onChange={e => setDraft({ ...draft, value: e.target.value })} className={FIELD} />
              </div>
            </div>
          </div>
          <Block label="Duration">
            <div className="grid grid-cols-2 gap-2.5">
              <label className={LABEL}>From<input type="date" value={draft.startsOn} onChange={e => setDraft({ ...draft, startsOn: e.target.value })} className={FIELD} /></label>
              <label className={LABEL}>Until<input type="date" value={draft.endsOn} onChange={e => setDraft({ ...draft, endsOn: e.target.value })} className={FIELD} /></label>
            </div>
          </Block>
          <Block label="Limits">
            <div className="grid grid-cols-2 gap-2.5">
              <label className={LABEL}>Uses at most<input value={draft.maxUses} inputMode="numeric" onChange={e => setDraft({ ...draft, maxUses: e.target.value })} className={FIELD} /></label>
              <span />
              <label className={LABEL}>Tee times from<input type="time" value={draft.fromTime} onChange={e => setDraft({ ...draft, fromTime: e.target.value })} className={FIELD} /></label>
              <label className={LABEL}>Until<input type="time" value={draft.toTime} onChange={e => setDraft({ ...draft, toTime: e.target.value })} className={FIELD} /></label>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days it works">
              {DAYS.map((d, i) => (
                <button key={d} type="button" aria-pressed={draft.days.includes(i)} onClick={() => setDraft({ ...draft, days: draft.days.includes(i) ? draft.days.filter(x => x !== i) : [...draft.days, i] })}
                  className={'px-2.5 py-1 rounded-md text-[12.5px] border ' + (draft.days.includes(i) ? 'border-ink text-ink font-semibold' : 'border-line text-ink-soft')}>{d}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[13.5px] text-ink"><input type="checkbox" checked={draft.onePerGolfer} onChange={e => setDraft({ ...draft, onePerGolfer: e.target.checked })} className="accent-pine" />Once per golfer</label>
            <label className="flex items-center gap-2 text-[13.5px] text-ink"><input type="checkbox" checked={draft.withRates} onChange={e => setDraft({ ...draft, withRates: e.target.checked })} className="accent-pine" />Works with member and resident prices</label>
          </Block>
          {editingLive && <button type="button" onClick={end} disabled={busy} className={LINK_BAD}>End this promo</button>}
          {formError && <p role="alert" className="text-[13px] text-bad">{formError}</p>}
          <PopupFoot onCancel={() => setDraft(null)}>
            <button type="button" onClick={save} disabled={busy} className={PRIMARY}>{busy ? 'Saving…' : draft.id ? (draft.reuse ? 'Use again' : 'Save') : 'Create code'}</button>
          </PopupFoot>
        </Popup>
      )}
    </Card>
  );
}
