'use client';
// PRICE-2 (Cam 2026-10-30: "Last-minute deals" — who gets it and stacking "up to
// course"): the Schedule page's last-minute deal. Off by default; when on, every open
// tee time within N hours of going off is N% cheaper online (and at the counter if the
// course says so). Data: /api/operator/last-minute (lib/last-minute.ts).
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';

type Deal = { lastMinuteOn: boolean; lastMinuteHours: number; lastMinutePct: number; lastMinuteCounter: boolean; lastMinuteStack: boolean };
type Draft = Omit<Deal, 'lastMinuteHours' | 'lastMinutePct'> & { lastMinuteHours: string; lastMinutePct: string };
const toDraft = (d: Deal): Draft => ({ ...d, lastMinuteHours: String(d.lastMinuteHours), lastMinutePct: String(d.lastMinutePct) });

export function LastMinuteDeals({ canEdit }: { canEdit: boolean }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const r = await dfetch<{ deal: Deal }>('/api/operator/last-minute');
    if (r.ok) { setDeal(r.data.deal); setDraft(toDraft(r.data.deal)); setError(''); } else setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error && !deal) return <LoadError message={`Couldn't load last-minute deals — ${error}`} onRetry={load} />;
  if (!deal || !draft) return null;
  const dirty = JSON.stringify(toDraft(deal)) !== JSON.stringify(draft);

  async function save() {
    if (!draft) return;
    setBusy(true); setFormError(''); setSaved(false);
    const r = await dfetch<{ deal: Deal }>('/api/operator/last-minute', { method: 'PATCH', body: JSON.stringify({ ...draft, lastMinuteHours: Number(draft.lastMinuteHours), lastMinutePct: Number(draft.lastMinutePct) }) });
    setBusy(false);
    if (!r.ok) { setFormError(r.error); return; }
    setDeal(r.data.deal); setDraft(toDraft(r.data.deal)); setSaved(true);
  }
  const box = (k: 'lastMinuteOn' | 'lastMinuteCounter' | 'lastMinuteStack', label: string) => (
    <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={draft[k]} disabled={!canEdit} onChange={e => { setSaved(false); setDraft({ ...draft, [k]: e.target.checked }); }} />{label}</label>
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-ink">Last-minute deals</h2>
        <StatusDot status={deal.lastMinuteOn ? 'ok' : 'neutral'} label={deal.lastMinuteOn ? `${deal.lastMinutePct}% off within ${deal.lastMinuteHours}h` : 'Off'} />
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-3">
        {box('lastMinuteOn', 'On')}
        <label className="text-[12.5px] text-ink-soft">Hours before<input value={draft.lastMinuteHours} disabled={!canEdit} onChange={e => { setSaved(false); setDraft({ ...draft, lastMinuteHours: e.target.value }); }} inputMode="numeric" className={INPUT + ' block mt-1 w-20'} /></label>
        <label className="text-[12.5px] text-ink-soft">% off<input value={draft.lastMinutePct} disabled={!canEdit} onChange={e => { setSaved(false); setDraft({ ...draft, lastMinutePct: e.target.value }); }} inputMode="numeric" className={INPUT + ' block mt-1 w-20'} /></label>
        {box('lastMinuteCounter', 'At the counter too')}
        {box('lastMinuteStack', 'Off member and resident rates too')}
      </div>
      <p className="mt-2 text-[12.5px] text-ink-muted">Without the last box, members and residents pay their rate or the deal price, whichever is lower.</p>
      {canEdit && (
        <div className="mt-3 flex items-center gap-3">
          <button onClick={save} disabled={busy || !dirty} className="bg-pine hover:bg-pine-hover text-white text-[13px] font-medium rounded-md px-3 py-1.5 disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
          {saved && !dirty && <span className="text-[12.5px] text-ink-muted">Saved</span>}
        </div>
      )}
      {formError && <p role="alert" className="mt-2 text-[12.5px] text-bad">{formError}</p>}
    </Card>
  );
}
