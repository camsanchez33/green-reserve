'use client';
// Money rework (Cam 2026-10-19): the payouts Stripe has sent the course, read
// from Stripe by /api/operator/stripe/payouts — so nobody has to open Stripe
// to see when money lands.
import { useCallback, useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { LoadError } from '@/components/dashboard/LoadError';
import { StatusDot } from '@/components/ui/StatusDot';

export type Payout = { id: string; amountCents: number; currency: string; status: string; createdAt: string; arrivalDate: string; failureMessage: string | null };
export type PayoutsData = { connected: boolean; payouts: Payout[]; next?: Payout | null; balance: { availableCents: number; pendingCents: number } | null };

export const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  paid: { label: 'In your bank', tone: 'ok' },
  in_transit: { label: 'On its way', tone: 'neutral' },
  pending: { label: 'On its way', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'bad' },
  canceled: { label: 'Cancelled', tone: 'warn' },
};

export function PayoutsTable() {
  const [data, setData] = useState<PayoutsData | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    const r = await dfetch<PayoutsData>('/api/operator/stripe/payouts');
    if (r.ok) setData(r.data); else setError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (error) return <LoadError message={error} onRetry={load} />;
  if (!data) return <p className="py-6 text-center text-[13px] text-ink-muted">Loading your payouts from Stripe…</p>;
  const b = data.balance;
  return (
    <div className="space-y-5">
      {b && (
        <div className="grid grid-cols-2 gap-px bg-line rounded-md overflow-hidden">
          <div className="bg-white px-4 py-3"><div className="text-[13px] font-semibold text-ink">On its way to your bank</div><div className="text-[22px] font-semibold tabular-nums text-ink mt-0.5">{usd(b.pendingCents)}</div><div className="text-[12.5px] text-ink-muted">card payments Stripe is still settling</div></div>
          <div className="bg-white px-4 py-3"><div className="text-[13px] font-semibold text-ink">Ready to pay out</div><div className="text-[22px] font-semibold tabular-nums text-ink mt-0.5">{usd(b.availableCents)}</div><div className="text-[12.5px] text-ink-muted">goes out in your next payout</div></div>
        </div>
      )}
      {data.payouts.length === 0 ? (
        <p className="text-[13.5px] text-ink-soft">No payouts yet. Stripe sends your first one a few days after your first card payment, then on its normal schedule.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead><tr className="text-left border-b border-line">
              <th className="py-2 pr-4 text-[12.5px] font-semibold text-ink">Lands in your bank</th>
              <th className="py-2 pr-4 text-[12.5px] font-semibold text-ink text-right">Amount</th>
              <th className="py-2 text-[12.5px] font-semibold text-ink">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-line-soft">
              {data.payouts.map(p => {
                const s = STATUS[p.status] ?? { label: p.status, tone: 'neutral' as const };
                return (
                  <tr key={p.id}>
                    <td className="py-2.5 pr-4 text-ink tabular-nums">{fmtDay(p.arrivalDate)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-ink">{usd(p.amountCents)}{p.currency !== 'usd' ? ` ${p.currency.toUpperCase()}` : ''}</td>
                    <td className="py-2.5 text-ink"><span className="inline-flex items-center gap-1.5"><StatusDot status={s.tone} />{s.label}</span>{p.failureMessage && <span className="block text-[12.5px] text-bad">{p.failureMessage}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
