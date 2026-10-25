'use client';
// POS-3 R4 (Cam 2026-10-24): close out the register at the end of the day, on
// the Pro shop page. The day's figures come from the server (lib/register-close
// .ts); staff enter the starting cash and what they counted, see over or short,
// and save the count. A recount adds a new count — the latest stands.
import { useCallback, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { dfetch } from '@/lib/dashboard-fetch';
import { addDaysStr } from '@/lib/course-time';

type Summary = {
  day: string; today: string;
  cashSales: { count: number; cents: number; itemsCents: number; roundsCents: number };
  counterRounds: { count: number; cents: number };
  cashRefunds: { count: number; cents: number };
  cashTakenCents: number;
  card: { shopCents: number; roundsCents: number; refundsCents: number; cents: number };
};
type Close = { id: string; day: string; openingFloatCents: number; expectedCashCents: number; countedCashCents: number; differenceCents: number; note: string; closedBy: string; createdAt: string };

const usd = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;
const toCents = (v: string) => { const n = Number(v.replace(/[$,\s]/g, '')); return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null; };
const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const overShort = (d: number) => (d === 0 ? { label: 'Even', tone: 'ok' as const } : d > 0 ? { label: `Over ${usd(d)}`, tone: 'warn' as const } : { label: `Short ${usd(-d)}`, tone: 'bad' as const });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function RegisterClose() {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Close[]>([]);
  const [loadError, setLoadError] = useState('');
  const [float, setFloat] = useState('');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Close | null>(null);

  const load = useCallback(async (d?: string) => {
    setLoadError('');
    const r = await dfetch<{ summary: Summary; recent: Close[] }>(`/api/operator/register-close${d ? `?day=${d}` : ''}`);
    if (!r.ok) { setLoadError(r.error); return; }
    setSummary(r.data.summary); setRecent(r.data.recent); setDay(r.data.summary.day);
  }, []);

  async function close() {
    if (!summary) return;
    setBusy(true); setError(''); setSaved(null);
    const r = await dfetch<{ close: Close }>('/api/operator/register-close', {
      method: 'POST', body: JSON.stringify({ day: summary.day, openingFloatCents: toCents(float) ?? 0, countedCashCents: toCents(counted), note }),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setSaved(r.data.close); setNote('');
    load(summary.day); // the figures may have moved since the page loaded; show what was saved
  }

  const floatCents = toCents(float) ?? 0;
  const countedCents = toCents(counted);
  const expected = summary ? floatCents + summary.cashTakenCents : 0;
  const diff = countedCents === null ? null : countedCents - expected;
  const yesterday = summary ? addDaysStr(summary.today, -1) : '';
  const dayCloses = recent.filter(c => c.day === summary?.day);

  return (
    <Card className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold text-ink">Close out the day</h2>
        {!open
          ? <button type="button" onClick={() => { setOpen(true); load(); }} className="text-[13px] text-pine font-medium hover:underline">Count the drawer</button>
          : summary && (
            <div className="flex gap-1" role="group" aria-label="Day">
              {[[summary.today, 'Today'], [yesterday, 'Yesterday']].map(([d, l]) => (
                <button key={d} type="button" aria-pressed={day === d} onClick={() => { setSaved(null); load(d); }}
                  className={'px-2.5 py-1 rounded-md border text-[12.5px] ' + (day === d ? 'border-pine/40 text-ink font-medium' : 'border-line text-ink-soft hover:text-ink')}>{l}</button>
              ))}
            </div>
          )}
      </div>
      {open && (
        <div className="px-5 pb-5">
          {loadError && <p className="text-sm text-bad" role="alert">{loadError} <button type="button" onClick={() => load(day)} className="underline font-medium">Try again</button></p>}
          {!summary && !loadError && <p className="text-sm text-ink-muted">Adding up the day…</p>}
          {summary && (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-[13.5px] font-semibold text-ink mb-1">Cash, {dayLabel(summary.day)}</h3>
                <ul className="divide-y divide-line-soft text-sm">
                  <li className="flex justify-between py-2"><span className="text-ink">Cash sales at the register <span className="text-ink-muted">· {plural(summary.cashSales.count, 'sale')}</span></span><span className="tabular-nums">{usd(summary.cashSales.cents)}</span></li>
                  {summary.cashSales.roundsCents > 0 && <li className="flex justify-between py-1.5 pl-3 text-[12.5px] text-ink-soft"><span>Shop items {usd(summary.cashSales.itemsCents)} · green fees {usd(summary.cashSales.roundsCents)}</span></li>}
                  <li className="flex justify-between py-2"><span className="text-ink">Paid at the counter on the tee sheet <span className="text-ink-muted">· {plural(summary.counterRounds.count, 'group')}</span></span><span className="tabular-nums">{usd(summary.counterRounds.cents)}</span></li>
                  <li className="flex justify-between py-2"><span className="text-ink">Cash refunds <span className="text-ink-muted">· {summary.cashRefunds.count}</span></span><span className="tabular-nums">{usd(-summary.cashRefunds.cents)}</span></li>
                  <li className="flex justify-between py-2 font-semibold text-ink"><span>Cash taken</span><span className="tabular-nums">{usd(summary.cashTakenCents)}</span></li>
                </ul>
                <p className="text-[12.5px] text-ink-muted mt-2">“Paid at the counter” on the tee sheet doesn’t say how they paid. If some paid another way (a check, another card machine), set that aside before you count.</p>
                <h3 className="text-[13.5px] font-semibold text-ink mt-5 mb-1">Card, for reference</h3>
                <ul className="divide-y divide-line-soft text-sm">
                  <li className="flex justify-between py-2"><span className="text-ink">Shop sales by card</span><span className="tabular-nums">{usd(summary.card.shopCents)}</span></li>
                  <li className="flex justify-between py-2"><span className="text-ink">Rounds paid by card</span><span className="tabular-nums">{usd(summary.card.roundsCents)}</span></li>
                  {summary.card.refundsCents > 0 && <li className="flex justify-between py-2"><span className="text-ink">Shop card refunds</span><span className="tabular-nums">{usd(-summary.card.refundsCents)}</span></li>}
                </ul>
                <p className="text-[12.5px] text-ink-muted mt-2">Card payments go to your Stripe account — nothing to count.</p>
              </div>
              <div>
                <h3 className="text-[13.5px] font-semibold text-ink mb-2">Count the drawer</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-[13px] text-ink">Starting cash
                    <div className="relative mt-1"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                      <input value={float} onChange={e => setFloat(e.target.value)} inputMode="decimal" placeholder="0.00" className={INPUT + ' w-full pl-6'} /></div>
                  </label>
                  <label className="text-[13px] text-ink">Cash counted
                    <div className="relative mt-1"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                      <input value={counted} onChange={e => setCounted(e.target.value)} inputMode="decimal" placeholder="0.00" className={INPUT + ' w-full pl-6'} /></div>
                  </label>
                </div>
                <ul className="mt-3 divide-y divide-line-soft text-sm">
                  <li className="flex justify-between py-2"><span className="text-ink">Should be in the drawer</span><span className="tabular-nums font-semibold">{usd(expected)}</span></li>
                  <li className="flex justify-between py-2"><span className="text-ink">Counted</span>{diff === null ? <span className="text-ink-muted">—</span> : <StatusDot status={overShort(diff).tone} label={overShort(diff).label} />}</li>
                </ul>
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Note (optional) — e.g. $20 paid out for ice" aria-label="Note" className={INPUT + ' w-full mt-3'} />
                <button type="button" onClick={close} disabled={busy || countedCents === null}
                  className="mt-3 w-full bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm py-2.5 disabled:opacity-50">
                  {busy ? 'Saving…' : dayCloses.length ? 'Save this recount' : `Close out ${summary.day === summary.today ? 'today' : dayLabel(summary.day)}`}
                </button>
                {error && <p className="mt-2 text-[13px] text-bad" role="alert">{error}</p>}
                {saved && <p className="mt-2 text-[13px] text-ok flex items-center gap-1.5"><StatusDot status="ok" />Saved — {overShort(saved.differenceCents).label.toLowerCase()} against {usd(saved.expectedCashCents)} expected.</p>}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div className="mt-6">
              <h3 className="text-[13.5px] font-semibold text-ink mb-1">Recent close-outs</h3>
              <table className="w-full text-[13.5px]">
                <thead><tr className="text-left text-ink-muted"><th className="font-normal py-1.5">Day</th><th className="font-normal">Expected</th><th className="font-normal">Counted</th><th className="font-normal">Over or short</th><th className="font-normal hidden md:table-cell">By</th></tr></thead>
                <tbody className="divide-y divide-line-soft">
                  {recent.map((c, i) => {
                    // The latest count of a day stands; earlier ones are kept as recounted.
                    const superseded = recent.findIndex(x => x.day === c.day) !== i;
                    const os = overShort(c.differenceCents);
                    return (
                      <tr key={c.id} className={superseded ? 'text-ink-muted' : 'text-ink'}>
                        <td className="py-2">{dayLabel(c.day)}{superseded ? ' (recounted)' : ''}</td>
                        <td className="tabular-nums">{usd(c.expectedCashCents)}</td>
                        <td className="tabular-nums">{usd(c.countedCashCents)}</td>
                        <td>{superseded ? os.label : <StatusDot status={os.tone} label={os.label} />}{c.note ? <span className="block text-[12px] text-ink-muted">{c.note}</span> : null}</td>
                        <td className="hidden md:table-cell text-ink-muted">{c.closedBy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
