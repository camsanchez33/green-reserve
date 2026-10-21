'use client';
// W2-6 slice 3 (Cam 2026-10-20): a round's own booking rules, on its Schedule
// tab — walking, group size and how far ahead the public can book. Blank = the
// course's rule (Settings → Booking rules). lib/booking-rules decides what a
// tee time's rules are; this only edits the round's exceptions. Owner only —
// the route refuses staff; a staff login reads the rules here.
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { walkingWords } from '@/lib/walking';
import { WALKING_POLICIES } from '@/lib/booking-rules';

export type RoundRules = { walkingPolicy: string | null; minPlayers: number | null; maxPlayers: number | null; publicAdvanceDays: number | null };
export type CourseRules = { walkingAllowed: string; cartRequired: boolean; minPlayers: number; maxPlayers: number; publicAdvanceDays: number };

// The same words golfers read (lib/walking), without the full stop.
const words = (rule: string) => walkingWords(rule).replace(/\.$/, '');
const WALKING: Record<string, string> = Object.fromEntries(WALKING_POLICIES.map(k => [k, words(k)]));
const courseWalking = (c: CourseRules) => c.cartRequired ? words('never') : words(c.walkingAllowed);

const iCls = 'w-full bg-paper border border-line rounded-md px-3 py-2 text-[13.5px] text-ink placeholder-ink-faint outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10';
const lCls = 'block text-[13px] font-semibold text-ink mb-1.5';
const s = (n: number | null) => (n == null ? '' : String(n));

export default function RoundRulesCard({ productId, label, rules, course, canEdit, onSaved }: {
  productId: string; label: string; rules: RoundRules; course: CourseRules | null; canEdit: boolean;
  onSaved: (r: RoundRules) => void;
}) {
  const [walking, setWalking] = useState(rules.walkingPolicy ?? '');
  const [min, setMin] = useState(s(rules.minPlayers));
  const [max, setMax] = useState(s(rules.maxPlayers));
  const [days, setDays] = useState(s(rules.publicAdvanceDays));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  // A different round's tab: start from its saved rules.
  useEffect(() => { setWalking(rules.walkingPolicy ?? ''); setMin(s(rules.minPlayers)); setMax(s(rules.maxPlayers)); setDays(s(rules.publicAdvanceDays)); setErr(''); setSaved(false); }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = walking !== (rules.walkingPolicy ?? '') || min !== s(rules.minPlayers) || max !== s(rules.maxPlayers) || days !== s(rules.publicAdvanceDays);
  const edit = (f: (v: string) => void) => (e: { target: { value: string } }) => { f(e.target.value); setSaved(false); setErr(''); };

  async function save() {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/operator/round-rules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, walkingPolicy: walking || null, minPlayers: min, maxPlayers: max, publicAdvanceDays: days }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || 'Couldn’t save these rules. Nothing was changed — try again.'); return; }
      onSaved({ walkingPolicy: data.walkingPolicy ?? null, minPlayers: data.minPlayers ?? null, maxPlayers: data.maxPlayers ?? null, publicAdvanceDays: data.publicAdvanceDays ?? null });
      setSaved(true);
    } catch {
      setErr('Network error — nothing was saved. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  const c = course;
  const eff = {
    walking: rules.walkingPolicy ? WALKING[rules.walkingPolicy] : c ? courseWalking(c) : '—',
    group: `${rules.minPlayers ?? c?.minPlayers ?? 1}–${rules.maxPlayers ?? c?.maxPlayers ?? 4} players`,
    days: `${rules.publicAdvanceDays ?? c?.publicAdvanceDays ?? '—'} days ahead`,
  };
  const own = (v: unknown) => v != null && v !== '';

  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold text-ink">Booking rules for {label}</h2>
      <p className="text-[13.5px] text-ink-soft mt-1">Leave a box blank to use your course&apos;s rule from Settings.</p>
      {!canEdit ? (
        <div className="mt-2 divide-y divide-line-soft text-[13.5px]">
          <div className="flex justify-between py-2"><span className="text-ink">Walking</span><span className="text-ink">{eff.walking}</span></div>
          <div className="flex justify-between py-2"><span className="text-ink">Group size</span><span className="text-ink tabular-nums">{eff.group}</span></div>
          <div className="flex justify-between py-2"><span className="text-ink">Public can book</span><span className="text-ink tabular-nums">{eff.days}</span></div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <label className={lCls} htmlFor="rr-walk">Walking</label>
            <select id="rr-walk" value={walking} onChange={edit(setWalking)} className={iCls}>
              <option value="">Course rule{c ? ` (${courseWalking(c)})` : ''}</option>
              {Object.entries(WALKING).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lCls} htmlFor="rr-min">Fewest players</label><input id="rr-min" type="number" min={1} max={8} value={min} onChange={edit(setMin)} placeholder={c ? String(c.minPlayers) : ''} className={iCls} /></div>
            <div><label className={lCls} htmlFor="rr-max">Most players</label><input id="rr-max" type="number" min={1} max={8} value={max} onChange={edit(setMax)} placeholder={c ? String(c.maxPlayers) : ''} className={iCls} /></div>
          </div>
          <div>
            <label className={lCls} htmlFor="rr-days">Public can book, days ahead</label>
            <input id="rr-days" type="number" min={1} max={c?.publicAdvanceDays ?? 365} value={days} onChange={edit(setDays)} placeholder={c ? String(c.publicAdvanceDays) : ''} className={iCls + ' max-w-[140px]'} />
            {c && <p className="text-[12.5px] text-ink-muted mt-1">Up to {c.publicAdvanceDays}, your course&apos;s window. Members keep their own.</p>}
          </div>
          {err && <p className="text-[13px] text-bad flex items-center gap-1.5" role="alert"><StatusDot status="bad" />{err}</p>}
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={busy || !dirty} className="bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md text-[13px] font-medium disabled:opacity-50">{busy ? 'Saving…' : 'Save rules'}</button>
            {saved && !dirty && <span className="text-[13px] text-ink flex items-center gap-1.5"><StatusDot status="ok" />Saved. Golfers see it now.</span>}
          </div>
          {(own(rules.walkingPolicy) || own(rules.minPlayers) || own(rules.maxPlayers) || own(rules.publicAdvanceDays)) && (
            <p className="text-[12.5px] text-ink-muted">Golfers booking {label}: {eff.walking.toLowerCase()} · {eff.group} · {eff.days}.</p>
          )}
        </div>
      )}
    </Card>
  );
}
