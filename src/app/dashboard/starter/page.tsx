'use client';
// CART-4 (Cam 2026-11-09: "a printable sheet where the course can adjust what they would like on it"): the starter's
// day sheet — every group on the day, one row each, in the columns the course picked in Settings → Booking rules.
// "Starter writes them in" leaves the cart-number column blank for the pen. Read-only; it prints on its own.
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { dfetch } from '@/lib/dashboard-fetch';
import { STARTER_COLUMNS } from '@/lib/starter-sheet';
import { type CartSettings, type SheetTime, type SheetBooking, clock, longDate, isPaid, ridingWords, bucketWords } from '@/components/dashboard/carts/starter-data';

function cell(key: string, t: SheetTime, b: SheetBooking, mode: CartSettings['mode']): string {
  switch (key) {
    case 'time': return clock(t.time);
    case 'tee': return t.tee ?? '';
    case 'name': return b.golferName;
    case 'players': return String(b.players);
    case 'riding': return ridingWords(b);
    case 'carts': return mode === 'starter' ? '' : (b.cartNumbers ?? '');
    case 'balls': return bucketWords(b);
    case 'paid': return isPaid(b) ? 'Paid' : 'Owes';
    case 'in': return b.status === 'completed' ? 'In' : b.noShowAt ? 'No-show' : '';
    case 'phone': return b.golferPhone;
    case 'notes': return (b.notes ?? []).join(' · ');
    default: return '';
  }
}

function StarterSheet() {
  const date = useSearchParams().get('date') ?? '';
  const [times, setTimes] = useState<SheetTime[] | null>(null);
  const [cfg, setCfg] = useState<CartSettings | null>(null);
  const [error, setError] = useState('');
  async function load() {
    setError('');
    const [t, c] = await Promise.all([
      dfetch<SheetTime[]>(`/api/operator/tee-times?withBookings=1${date ? `&date=${encodeURIComponent(date)}` : ''}`),
      dfetch<CartSettings>('/api/operator/cart-numbers'),
    ]);
    if (!t.ok) return setError(t.error);
    if (!c.ok) return setError(c.error);
    setTimes(t.data); setCfg(c.data);
  }
  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return (
    <div className="p-6"><p role="alert" className="text-[14px] text-bad">{error}</p>
      <button type="button" onClick={load} className="mt-3 text-[13px] font-medium text-pine hover:underline">Try again</button></div>
  );
  if (!times || !cfg) return <p className="p-6 text-[14px] text-ink-muted">Loading the starter’s sheet…</p>;
  const cols = STARTER_COLUMNS.filter(c => cfg.columns.includes(c.key));
  const rows = times.flatMap(t => (t.bookings ?? []).map(b => ({ t, b })))
    .sort((x, y) => x.t.time.localeCompare(y.t.time) || (x.t.teeRank ?? 0) - (y.t.teeRank ?? 0));
  const day = times[0]?.date ?? date;
  const players = rows.reduce((s, r) => s + r.b.players, 0);

  return (
    <div className="min-h-screen bg-page print:bg-white">
      <div className="mx-auto max-w-[1100px] px-4 py-6 print:p-0">
        <div className="flex flex-wrap items-baseline gap-3 print:hidden mb-4">
          <Link href={`/dashboard${day ? `?date=${day}` : ''}`} className="text-[13px] text-ink-muted hover:text-ink">← Tee sheet</Link>
          <button type="button" onClick={() => window.print()} className="ml-auto rounded-[7px] bg-pine px-4 py-2 text-[14px] font-medium text-white hover:bg-pine-hover">Print</button>
        </div>
        <div className="bg-white rounded-[10px] shadow-card p-5 print:shadow-none print:p-0">
          <div className="flex items-baseline gap-3 mb-3">
            <h1 className="text-[22px] font-semibold text-ink">Starter’s sheet</h1>
            <span className="text-[14px] text-ink-muted">{cfg.courseName} · {day ? longDate(day) : ''} · {rows.length} groups · {players} players</span>
          </div>
          {rows.length === 0 ? <p className="text-[14px] text-ink-muted">No groups booked on this day.</p> : (
            <table className="w-full text-[13px] border-collapse">
              <thead><tr className="border-b border-line-strong text-left">{cols.map(c => <th key={c.key} className="py-1.5 pr-3 font-semibold text-ink">{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.map(({ t, b }) => (
                  <tr key={b.id} className="border-b border-line align-top break-inside-avoid">
                    {/* CART-5 (Cam 2026-11-09): the starter writes the cart number in — an empty cart cell is a line to write on. */}
                    {cols.map(c => { const v = cell(c.key, t, b, cfg.mode); return <td key={c.key} className={`py-2 pr-3 text-ink tabular-nums ${c.key === 'carts' ? 'min-w-[110px]' : ''}`}>{c.key === 'carts' && !v ? <span aria-hidden="true" data-write-in="cart" className="block h-5 w-24 border-b border-ink" /> : v}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StarterSheetPage() {
  return <Suspense fallback={null}><StarterSheet /></Suspense>;
}
