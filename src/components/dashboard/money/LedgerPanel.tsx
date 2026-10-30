'use client';
// LEDGER-2 (Cam 2026-10-30: "Days, then the rows"): Money → Ledger. One line per day —
// card, cash and other money in, money given back, net, GreenReserve's part — and a dot
// for whether the card money matches what Stripe recorded that day. A day opens its
// movements, each linked to its booking, sale, member or event. CSV for the bookkeeper.
// Data: /api/operator/money/ledger (lib/ledger-view.ts).
import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { LoadError } from '@/components/dashboard/LoadError';
import DateRangeButton, { type DateRange } from '@/components/dashboard/DateRangeButton';
import { dfetch } from '@/lib/dashboard-fetch';
import type { LedgerDay, LedgerRow } from '@/lib/ledger-view';

type Days = { range: DateRange; today: string; days: LedgerDay[]; stripeRead: boolean; stripeConnected: boolean; tz: string };

const usd2 = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dash = (c: number) => (c ? usd2(c) : '—');
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const MATCH: Record<LedgerDay['match'], { status: 'ok' | 'bad' | 'neutral'; label: string }> = {
  ok: { status: 'ok', label: 'Matches Stripe' },
  off: { status: 'bad', label: 'Differs from Stripe' },
  none: { status: 'neutral', label: 'No card money' },
  unknown: { status: 'neutral', label: 'Stripe not checked' },
};

export function LedgerPanel() {
  const [data, setData] = useState<Days | null>(null);
  const [range, setRange] = useState<DateRange | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, LedgerRow[] | { error: string }>>({});

  const load = useCallback(async (r: DateRange | null) => {
    setLoading(true); setError('');
    const res = await dfetch<Days>(`/api/operator/money/ledger${r ? `?from=${r.from}&to=${r.to}` : ''}`);
    setLoading(false);
    if (!res.ok) { setError(res.error); return; }
    setData(res.data); setRange(res.data.range); setRows({}); setOpen(null);
  }, []);
  useEffect(() => { load(null); }, [load]);

  const openDay = async (day: string) => {
    if (open === day) { setOpen(null); return; }
    setOpen(day);
    if (rows[day] && !('error' in rows[day])) return;
    const res = await dfetch<{ rows: LedgerRow[] }>(`/api/operator/money/ledger?day=${day}`);
    setRows(prev => ({ ...prev, [day]: res.ok ? res.data.rows : { error: res.error } }));
  };

  if (!data) return error ? <LoadError message={`Couldn't load the ledger — ${error}`} onRetry={() => load(range)} />
    : <div className="py-16 text-center text-ink-muted">Loading…</div>;

  const t = data.days.reduce((a, d) => ({ card: a.card + d.cardInCents, cash: a.cash + d.cashInCents, other: a.other + d.otherInCents, out: a.out + d.outCents, net: a.net + d.netCents, gr: a.gr + d.platformCents }), { card: 0, cash: 0, other: 0, out: 0, net: 0, gr: 0 });
  const off = data.days.filter(d => d.match === 'off').length;

  return (
    <div className="space-y-4">
      {error && <LoadError message={`Couldn't load the ledger — ${error}`} onRetry={() => load(range)} />}
      <div className="flex flex-wrap items-center gap-3">
        {range && <DateRangeButton value={range} today={data.today} onChange={r => { setRange(r); load(r); }} />}
        {loading && <span className="text-[13px] text-ink-muted">Loading…</span>}
        {range && <a href={`/api/operator/money/ledger?format=csv&from=${range.from}&to=${range.to}`} className="ml-auto text-[13px] font-medium text-pine hover:underline underline-offset-4">Download CSV</a>}
      </div>
      {!data.stripeRead && <p className="text-[13px] text-ink-muted">{data.stripeConnected ? 'Stripe couldn’t be read — try again in a minute.' : 'Stripe isn’t connected.'}</p>}
      {off > 0 && <p className="text-[13px] text-bad">{off} {off === 1 ? 'day differs' : 'days differ'} from Stripe.</p>}

      <Card className="overflow-x-auto">
        <table className="w-full text-[13.5px] tabular-nums">
          <thead>
            <tr className="text-left text-[12.5px] text-ink-muted border-b border-line-soft">
              <th className="px-4 py-2.5 font-medium">Day</th>
              <th className="px-3 py-2.5 font-medium text-right">Card</th>
              <th className="px-3 py-2.5 font-medium text-right">Cash</th>
              <th className="px-3 py-2.5 font-medium text-right">Check or other</th>
              <th className="px-3 py-2.5 font-medium text-right">Given back</th>
              <th className="px-3 py-2.5 font-medium text-right">Net</th>
              <th className="px-3 py-2.5 font-medium text-right" title="GreenReserve's fees taken, less any given back">GreenReserve</th>
              <th className="px-4 py-2.5 font-medium">Stripe</th>
            </tr>
          </thead>
          <tbody>
            {data.days.map(d => {
              const m = MATCH[d.match];
              const r = rows[d.day];
              return (
                <Fragment key={d.day}>
                  <tr onClick={() => d.moves && openDay(d.day)} className={'border-b border-line-soft ' + (d.moves ? 'cursor-pointer hover:bg-paper/70' : 'text-ink-muted')}>
                    <td className="px-4 py-2.5 text-ink">
                      <button type="button" disabled={!d.moves} aria-expanded={open === d.day} className="text-left disabled:cursor-default">{fmtDay(d.day)}</button>
                    </td>
                    <td className="px-3 py-2.5 text-right">{dash(d.cardInCents)}</td>
                    <td className="px-3 py-2.5 text-right">{dash(d.cashInCents)}</td>
                    <td className="px-3 py-2.5 text-right">{dash(d.otherInCents)}</td>
                    <td className="px-3 py-2.5 text-right">{d.outCents ? `−${usd2(d.outCents)}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink">{dash(d.netCents)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-muted">{dash(d.platformCents)}</td>
                    <td className="px-4 py-2.5"><StatusDot status={m.status} label={d.match === 'off' && d.stripeNetCents !== null ? `Stripe ${usd2(d.stripeNetCents)}` : m.label} /></td>
                  </tr>
                  {open === d.day && (
                    <tr className="border-b border-line-soft bg-paper/70">
                      <td colSpan={8} className="px-4 py-3">
                        {!r ? <div className="text-ink-muted">Loading…</div>
                          : 'error' in r ? <LoadError message={`Couldn't load this day — ${r.error}`} onRetry={() => { setRows(p => { const n = { ...p }; delete n[d.day]; return n; }); setOpen(null); openDay(d.day); }} />
                          : <DayRows rows={r} tz={data.tz} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-ink border-t border-ink/70">
              <td className="px-4 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right">{dash(t.card)}</td>
              <td className="px-3 py-2.5 text-right">{dash(t.cash)}</td>
              <td className="px-3 py-2.5 text-right">{dash(t.other)}</td>
              <td className="px-3 py-2.5 text-right">{t.out ? `−${usd2(t.out)}` : '—'}</td>
              <td className="px-3 py-2.5 text-right">{dash(t.net)}</td>
              <td className="px-3 py-2.5 text-right text-ink-muted">{dash(t.gr)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}

function DayRows({ rows, tz }: { rows: LedgerRow[]; tz: string }) {
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return (
    <ul className="divide-y divide-line-soft">
      {rows.map(r => {
        const out = r.direction === 'out';
        return (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-[13px]">
            <span className="w-16 text-ink-muted tabular-nums">{time(r.at)}</span>
            <span className="text-ink">{r.label}{out ? ' · given back' : ''}</span>
            <span className="text-ink-muted">{r.methodLabel}{r.account === 'platform' ? ' · GreenReserve' : ''}</span>
            {r.who && (r.href ? <Link href={r.href} className="text-pine hover:underline underline-offset-4">{r.who}</Link> : <span className="text-ink">{r.who}</span>)}
            {r.note && <span className="text-ink-muted truncate max-w-[18rem]">{r.note}</span>}
            <span className={'ml-auto tabular-nums font-medium ' + (out ? 'text-bad' : 'text-ink')}>{out ? '−' : ''}{usd2(r.amountCents)}</span>
          </li>
        );
      })}
    </ul>
  );
}
