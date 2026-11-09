'use client';
// CART-4 (Cam 2026-11-09: "a receipt that you show the starter that says cart number and stuff like that"): the
// printed cart ticket for one group — time, tee, group, players, who rides, cart numbers, range balls, paid or owes.
// Opened from the group card when the course prints tickets (Settings → Booking rules); prints itself.
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { dfetch } from '@/lib/dashboard-fetch';
import { type CartSettings, type SheetTime, type SheetBooking, clock, longDate, isPaid, ridingWords, bucketWords } from '@/components/dashboard/carts/starter-data';

function Ticket() {
  const q = useSearchParams();
  const date = q.get('date') ?? '', id = q.get('id') ?? '';
  const [found, setFound] = useState<{ t: SheetTime; b: SheetBooking } | null>(null);
  const [cfg, setCfg] = useState<CartSettings | null>(null);
  const [error, setError] = useState('');
  async function load() {
    setError('');
    const [t, c] = await Promise.all([
      dfetch<SheetTime[]>(`/api/operator/tee-times?withBookings=1&date=${encodeURIComponent(date)}`),
      dfetch<CartSettings>('/api/operator/cart-numbers'),
    ]);
    if (!t.ok) return setError(t.error);
    if (!c.ok) return setError(c.error);
    const hit = t.data.flatMap(x => (x.bookings ?? []).map(b => ({ t: x, b }))).find(r => r.b.id === id);
    if (!hit) return setError('That group isn’t on this day any more — it may have moved or been cancelled.');
    setFound(hit); setCfg(c.data);
  }
  useEffect(() => { load(); }, [date, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (found) { const h = setTimeout(() => window.print(), 300); return () => clearTimeout(h); } }, [found]);

  if (error) return (
    <div className="p-6"><p role="alert" className="text-[14px] text-bad">{error}</p>
      <button type="button" onClick={load} className="mt-3 text-[13px] font-medium text-pine hover:underline">Try again</button></div>
  );
  if (!found || !cfg) return <p className="p-6 text-[14px] text-ink-muted">Loading the cart ticket…</p>;
  const { t, b } = found;
  const rows: [string, string][] = [
    ['Group', b.golferName], ['Players', String(b.players)], ['Riding', ridingWords(b)],
    ...(cfg.mode !== 'off' ? [['Cart numbers', b.cartNumbers || '']] as [string, string][] : []),
    ...(bucketWords(b) ? [['Range balls', bucketWords(b)]] as [string, string][] : []),
  ];
  return (
    <div className="min-h-screen bg-page print:bg-white px-4 py-6 print:p-0">
      <div className="mx-auto w-[300px] bg-white rounded-[10px] shadow-card p-5 print:shadow-none print:rounded-none">
        <div className="text-[13px] text-ink-muted">{cfg.courseName}</div>
        <div className="mt-1 text-[30px] font-semibold leading-none text-ink tabular-nums">{clock(t.time)}</div>
        <div className="mt-1 text-[13px] text-ink">{longDate(t.date)}{t.tee ? ` · ${t.tee}` : ''}</div>
        <div className="mt-4 divide-y divide-line border-y border-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-3 py-2 text-[14px]">
              <span className="text-ink-muted">{k}</span>
              <span className={`ml-auto text-right font-medium text-ink ${k === 'Cart numbers' && !v ? 'w-24 border-b border-ink' : ''}`}>{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 text-center text-[22px] font-semibold tracking-[0.06em] text-ink">{isPaid(b) ? 'PAID' : 'OWES'}</div>
        <button type="button" onClick={() => window.print()} className="mt-4 w-full rounded-[7px] bg-pine py-2 text-[14px] font-medium text-white hover:bg-pine-hover print:hidden">Print</button>
      </div>
    </div>
  );
}

export default function CartTicketPage() {
  return <Suspense fallback={null}><Ticket /></Suspense>;
}
