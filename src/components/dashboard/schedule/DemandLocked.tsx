'use client';
// SCHEDULE-3 Demand pricing (Cam 2026-11-16): an explainer bubble at the top, then — until the course has 3 months of
// tee times — only the locked state: progress and the date it unlocks. The unlocked view (why it suggests the prices,
// the week of prices, floor and ceiling, the terms checkbox) waits for Build: the engine still unlocks at 28 days and
// the terms need a new agreement version and counsel, so this page never shows it yet.
// Progress and the unlock date come from GET /api/operator/demand-pricing's `history` once Build adds it; until then
// the card says what it needs and shows no number it can't back.
// A course that turned demand pricing on before this page keeps a way to see and stop it (a live price no one can see
// is the thing the lane file rules out).
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { LoadError } from '@/components/dashboard/LoadError';
import { toast } from '@/components/dashboard/Toast';
import { dfetch } from '@/lib/dashboard-fetch';
import { CardHead, InfoIcon, LINK } from './ui';

/** What the page reads. `history` is the shape asked of Build (PR description); absent today. */
type Demand = {
  settings: { demandMode: 'off' | 'suggest' | 'auto' };
  history?: { daysOfData: number; daysNeeded: number; unlocksOn: string | null };
};
const MODE = { suggest: 'suggesting prices', auto: 'setting prices automatically' } as const;
const weeks = (d: number) => (d < 14 ? `${d} day${d === 1 ? '' : 's'}` : `${Math.floor(d / 7)} weeks`);

export function DemandLocked({ canEdit }: { canEdit: boolean }) {
  const [s, setS] = useState<Demand | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await dfetch<Demand>('/api/operator/demand-pricing');
    if (r.ok) { setS(r.data); setError(''); } else setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function turnOff() {
    setBusy(true);
    const r = await dfetch<Demand>('/api/operator/demand-pricing', { method: 'PATCH', body: JSON.stringify({ demandMode: 'off' }) });
    setBusy(false);
    if (!r.ok) { toast(r.error); return; }
    setS(prev => (prev ? { ...prev, settings: { ...prev.settings, demandMode: 'off' } } : prev));
    toast('Turned off. Your own prices are back.', 'ok');
  }

  const h = s?.history;
  const pct = h && h.daysNeeded > 0 ? Math.min(100, Math.round((h.daysOfData / h.daysNeeded) * 100)) : null;
  const unlocks = h?.unlocksOn ? new Date(h.unlocksOn + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
  const mode = s?.settings.demandMode;
  return (
    <div id="demand-pricing" className="flex flex-col gap-4 scroll-mt-6">
      <div className="flex gap-3 px-4 py-3.5 rounded-[14px] border border-line bg-paper text-[13.5px]">
        <span className="mt-0.5 text-ink-muted"><InfoIcon /></span>
        <div>
          <b className="block mb-1 font-semibold text-ink">What demand pricing does</b>
          <p className="text-ink-soft">It looks at how full each hour of each day has been, and nudges your green fee up when tee times sell out early and down when they sit empty. Your prices never go below your lowest or above your highest. You stay in control: it suggests, and you can turn it off any time, which puts your own prices straight back.</p>
        </div>
      </div>
      {error && !s && <LoadError message={`Couldn't load demand pricing — ${error}`} onRetry={load} />}
      {s && (
        <Card className="px-1.5 pt-1.5 pb-2.5">
          <CardHead title="Not available yet" />
          <div className="flex flex-col gap-2.5 px-3 pt-1 pb-2">
            {pct !== null && <div className="h-2 rounded bg-line" role="progressbar" aria-label="Tee times learned from" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i className="block h-full rounded bg-warn" style={{ width: `${pct}%` }} /></div>}
            <p className="text-[12.5px] text-ink-muted">
              It needs 3 months of your tee times to learn from.
              {h && <> You have {weeks(h.daysOfData)}{unlocks ? <>, so it unlocks around <b className="text-ink font-semibold">{unlocks}</b></> : null}.</>}
            </p>
            {mode && mode !== 'off' && (
              <div className="mt-1 rounded-[12px] border border-warn/45 bg-warn/10 px-3 py-2.5 text-[13px] text-ink">
                It’s on for your course now, {MODE[mode]}, from before this change.
                {canEdit && <> <button type="button" onClick={turnOff} disabled={busy} className={LINK}>{busy ? 'Turning off…' : 'Turn it off'}</button></>}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
