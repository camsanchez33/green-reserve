'use client';
// The membership setup (Cam 2026-11-16, members-mockup "New membership"): Name and colour → Joining → Payment →
// Booking and rates, as one pop-up with a step bar. Saves through /api/operator/tiers exactly as the old three-step
// wizard did. Hidden until the Memberships data PRs land: "One time" billing, "No end", proof of residency, the
// public booking window and rates against the course's price list (today's rates are green fee and cart, weekday
// and weekend, or % off).
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { AccountFields } from '@/components/dashboard/MemberAccount';
import { INPUT } from '@/components/ui/field';
import { type Tier, Popup, StepBar, Tiles, Label, Hint, Money, LINK, LINK_BAD, PRIMARY } from './shared';

const STEPS = ['Name', 'Renewal', 'Payment', 'Booking and rates'];
type Form = Partial<Tier> & { hasInit?: boolean };
type Mode = 'each' | 'pct';
const num = (v: unknown) => (v === '' || v == null ? null : Number(v));
const RATE_KEYS = ['greenFeeWeekday', 'greenFeeWeekend', 'cartFeeWeekday', 'cartFeeWeekend', 'discountPct'] as const;

export function MembershipSetup({ tier, colors, onClose, onSaved, onDelete }: {
  tier: Tier | null; colors: string[]; onClose: () => void; onSaved: (t: Tier, created: boolean) => void; onDelete?: () => Promise<boolean>;
}) {
  const [at, setAt] = useState(0);
  const [f, setF] = useState<Form>(() => tier ? { ...tier, hasInit: tier.initiationFee > 0 } : {
    name: '', color: colors[0], autoRenew: true, autoRenewRetry: true,
    annualFee: 0, initiationFee: 0, hasInit: false, termMonths: 12, advanceBookingDays: 14,
    greenFeeWeekday: null, greenFeeWeekend: null, cartFeeWeekday: null, cartFeeWeekend: null, discountPct: null,
    notes: '',
  });
  const [mode, setMode] = useState<Mode>(tier?.discountPct != null ? 'pct' : 'each');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof Form, v: unknown) => setF(x => ({ ...x, [k]: v }));
  const lengths: [string, string][] = [['12', '12 months'], ['6', '6 months']];
  if (f.termMonths && f.termMonths !== 12 && f.termMonths !== 6) lengths.push([String(f.termMonths), `${f.termMonths} months`]);

  const next = () => {
    setError('');
    if (at === 0 && !f.name?.trim()) { document.getElementById('ms-name')?.focus(); return; }
    setAt(a => a + 1);
  };
  const save = async () => {
    setSaving(true); setError('');
    const { hasInit, _count, ...rest } = f; void _count;
    // The rates are kept as typed ("12." on the way to "12.50") and read once here; an unreadable one is refused, never saved as public.
    const typed = Object.fromEntries(RATE_KEYS.map(k => [k, num(String(f[k] ?? '').trim())]));
    if (Object.values(typed).some(v => v != null && !Number.isFinite(v))) { setSaving(false); setError('Prices must be numbers.'); return; }
    const payload = {
      ...rest,
      ...typed,
      initiationFee: hasInit ? Number(rest.initiationFee) || 0 : 0,
      annualFee: Number(rest.annualFee) || 0,
      ...(mode === 'pct' ? { greenFeeWeekday: null, greenFeeWeekend: null, cartFeeWeekday: null, cartFeeWeekend: null } : { discountPct: null }),
    };
    const r = await dfetch<Tier>('/api/operator/tiers', { method: tier ? 'PATCH' : 'POST', body: JSON.stringify(tier ? { ...payload, id: tier.id } : payload) });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    onSaved(r.data, !tier);
  };

  return (
    <Popup label={tier ? 'Edit membership' : 'New membership'} onClose={onClose} wide>
      <h3 className="text-[19px] font-semibold">{tier ? 'Edit membership' : 'New membership'}</h3>
      <StepBar labels={STEPS} at={at} />

      {at === 0 && <>
        <div><Label htmlFor="ms-name">Name</Label>
          <input id="ms-name" autoFocus className={INPUT + ' w-full'} value={f.name ?? ''} onChange={e => set('name', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') next(); }} /></div>
        <div className="border-t border-line pt-3.5"><Label id="ms-col">Colour on the tee sheet</Label>
          <div className="flex gap-2.5 flex-wrap" role="radiogroup" aria-labelledby="ms-col">
            {colors.map(c => <button key={c} type="button" role="radio" aria-checked={f.color === c} aria-label={`Colour ${colors.indexOf(c) + 1}`} onClick={() => set('color', c)}
              className={'w-7 h-7 rounded-full ' + (f.color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-white' : '')} style={{ background: c }} />)}
          </div></div>
        <div className="border-t border-line pt-3.5"><Label htmlFor="ms-notes">Notes for your staff</Label>
          <textarea id="ms-notes" rows={2} className={INPUT + ' w-full resize-none'} value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} /></div>
        {tier && onDelete && <div><button type="button" disabled={deleting} className={LINK_BAD}
          onClick={async () => { if (!confirm(`Delete the ${tier.name} membership?`)) return; setDeleting(true); const ok = await onDelete(); setDeleting(false); if (ok) onClose(); }}>
          {deleting ? 'Deleting…' : 'Delete this membership'}</button></div>}
      </>}

      {at === 1 && <>
        <div className="flex flex-col gap-2 text-[13.5px]">
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-pine" checked={!!f.autoRenew} onChange={e => set('autoRenew', e.target.checked)} />Renews itself. Golfers agree when they pay and can turn it off</label>
          {f.autoRenew && <label className="flex items-center gap-2 pl-6"><input type="checkbox" className="accent-pine" checked={f.autoRenewRetry !== false} onChange={e => set('autoRenewRetry', e.target.checked)} />If the card is declined, try once more 3 days later</label>}
        </div>
      </>}

      {at === 2 && <>
        <div><Label htmlFor="ms-fee">Fee</Label><Money id="ms-fee" value={f.annualFee || ''} onChange={v => set('annualFee', v)} /></div>
        <div className="flex flex-col gap-2 text-[13.5px]">
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-pine" checked={!!f.hasInit} onChange={e => set('hasInit', e.target.checked)} />Initiation fee when they first join</label>
          {f.hasInit && <Money label="Initiation fee" value={f.initiationFee || ''} onChange={v => set('initiationFee', v)} />}
        </div>
        <div><Label id="ms-len">How long it lasts</Label>
          <Tiles labelledBy="ms-len" value={String(f.termMonths ?? 12)} onChange={v => set('termMonths', Number(v))} options={lengths} /></div>
        <Hint>From the day they join.</Hint>
        <div className="border-t border-line pt-3.5 flex flex-col gap-2">
          <AccountFields on={f.accountOn} limit={f.accountLimit} limitCents={f.accountLimitCents} settle={f.accountSettle} onChange={(k, v) => set(k, v)} className={INPUT} />
        </div>
        <Hint>When paid through GreenReserve, members pay a 1% fee on top.</Hint>
      </>}

      {at === 3 && <>
        <div><Label htmlFor="ms-days">Booking online</Label>
          <div className="flex items-center gap-2.5"><input id="ms-days" inputMode="numeric" className={INPUT + ' w-20'} value={f.advanceBookingDays ?? ''} onChange={e => set('advanceBookingDays', num(e.target.value))} /><span className="text-[12px] text-ink-muted">days ahead</span></div></div>
        <div><Label id="ms-pay">What members pay</Label>
          <Tiles labelledBy="ms-pay" value={mode} onChange={setMode} options={[['each', 'Set each price'], ['pct', '% off everything']]} /></div>
        {mode === 'pct' ? (
          <div className="flex items-center gap-2.5"><input aria-labelledby="ms-pay" inputMode="numeric" className={INPUT + ' w-20'} value={f.discountPct ?? ''} onChange={e => set('discountPct', e.target.value)} /><span className="text-[12px] text-ink-muted">% off every round and cart</span></div>
        ) : <>
          <Hint>Leave one blank and members pay the public price; 0 is free.</Hint>
          <div className="flex flex-col border border-line rounded-[12px] px-3 py-1">
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2.5 py-[7px] text-[12px] text-ink-muted"><span>Round</span><span>Members</span></div>
            {([['greenFeeWeekday', 'Green fee · weekday'], ['greenFeeWeekend', 'Green fee · weekend'], ['cartFeeWeekday', 'Cart · weekday'], ['cartFeeWeekend', 'Cart · weekend']] as const).map(([k, l]) => (
              <div key={k} className="grid grid-cols-[minmax(0,1fr)_100px] gap-2.5 items-center py-[7px] border-t border-line text-[13px]">
                <span>{l}</span><Money small label={l} value={f[k] ?? ''} onChange={v => set(k, v)} />
              </div>
            ))}
          </div>
        </>}
        <div className="border-t border-line pt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px]">
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-pine" checked={!!f.guestsPayMemberRate} onChange={e => set('guestsPayMemberRate', e.target.checked)} />Guests pay the member rate</label>
        </div>
      </>}

      {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
      <div className="flex items-center gap-2.5 border-t border-line pt-3">
        {at === 0 ? <button type="button" className={LINK} onClick={onClose}>Cancel</button> : <button type="button" className={LINK} onClick={() => { setError(''); setAt(a => a - 1); }}>Back</button>}
        <span className="flex-1" />
        {at < STEPS.length - 1
          ? <button type="button" className={PRIMARY} onClick={next}>Continue</button>
          : <button type="button" className={PRIMARY} disabled={saving} onClick={save}>{saving ? 'Saving…' : tier ? 'Save' : 'Add membership'}</button>}
      </div>
    </Popup>
  );
}
