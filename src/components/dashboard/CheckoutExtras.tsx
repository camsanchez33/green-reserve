'use client';
// CART-3 (Cam 2026-11-09: "still cant add or take off a cart on the checkout"; "range balls need to be done now";
// picked "Riding − N +" and "Buckets − N + at checkout"). Checkout step 2's rows: how many of the group ride, and
// (RANGE-1) one row per bucket on the course's list, plus a booking's buckets at the price they were booked at. Each tap saves (PATCH set_extras, lib/checkout-extras) and the sheet re-reads
// the booking, so the ticket and the total below show the new price. Locked once the round is paid or being paid.
import { useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { BOOKED_KEY, MAX_BUCKETS, linesOf } from '@/lib/range-buckets';
import { cartsFor } from '@/lib/cart-pricing';
import { type CartNumberMode, type CartTicketMode } from '@/lib/starter-sheet';

type Options = { cartRule: 'per_player' | 'per_cart'; range: { id: string; name: string; balls: number | null; priceCents: number }[]; cartNumbers: CartNumberMode; cartTicket: CartTicketMode };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const STEP = 'w-10 h-10 rounded-[7px] border border-line bg-white text-[17px] text-ink hover:bg-paper disabled:opacity-40';

export function CheckoutExtras({ booking, date, cartFeeCents, walkingAllowed, locked, onChanged, onNumbersNeeded }: {
  booking: { id: string; players: number; cartFeeTotal?: number; memberCartCents?: number | null; cartSelected?: boolean; cartRiders?: number | null; cartUnitCents?: number | null; rangeBallsSize?: string; rangeBallsTotal?: number; rangeBuckets?: unknown; cartNumbers?: string };
  /** The tee time's date, for the printed cart ticket. */
  date: string;
  /** The tee time's cart price (per player, or per cart on a per-cart course). */
  cartFeeCents: number; walkingAllowed: boolean;
  /** Why the rows can't change (paid, a no-show, a pack, an event, the login), or null when they can. */
  locked: string | null;
  onChanged: () => Promise<void> | void;
  /** CART-4: true while the course requires cart numbers and none are typed for a group that rides. */
  onNumbersNeeded?: (needed: boolean) => void;
}) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [nums, setNums] = useState(booking.cartNumbers ?? '');
  const [numsBusy, setNumsBusy] = useState(false);
  useEffect(() => { setNums(booking.cartNumbers ?? ''); }, [booking.cartNumbers]);
  useEffect(() => {
    dfetch<Options>('/api/operator/checkout-options').then(r => { if (r.ok) setOpts(r.data); else setError(r.error); });
  }, []);

  const riders = booking.cartSelected ? (booking.cartRiders ?? booking.players) : 0;
  // The booking's buckets as booked, then every bucket on the list it doesn't hold yet (at today's price).
  const held = linesOf({ rangeBuckets: booking.rangeBuckets, rangeBallsSize: booking.rangeBallsSize, rangeBallsTotal: booking.rangeBallsTotal ?? 0 });
  const rows = [
    ...held.map(l => ({ key: l.itemId ?? BOOKED_KEY, name: l.name, note: `${l.balls ? `${l.balls} balls · ` : ''}${l.unitCents ? usd(l.unitCents) : 'free'}${l.itemId ? ' as booked' : ''}`, qty: l.qty, max: l.itemId ? (opts?.range.some(r => r.id === l.itemId) ? MAX_BUCKETS : l.qty) : l.qty })),
    ...(opts?.range ?? []).filter(r => !held.some(l => l.itemId === r.id)).map(r => ({ key: r.id, name: r.name, note: `${r.balls ? `${r.balls} balls · ` : ''}${r.priceCents ? usd(r.priceCents) : 'free'}`, qty: 0, max: MAX_BUCKETS })),
  ];
  // CART-4: cart numbers, when the course asks for them at check-in (Settings → Booking rules). Not a price — they
  // can be typed after payment too; the starter's mode leaves them to the starter's sheet.
  const askNumbers = riders > 0 && (opts?.cartNumbers === 'checkin' || opts?.cartNumbers === 'required');
  // From what's typed (saved on blur), so Next works the moment numbers are in — a click right after typing used to land
  // on a button still disabled while the save went through (no-silent-failures audit 2026-11-09).
  const numbersNeeded = askNumbers && opts?.cartNumbers === 'required' && !nums.trim();
  const [numsSaved, setNumsSaved] = useState(false);
  useEffect(() => { onNumbersNeeded?.(numbersNeeded); }, [numbersNeeded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onNumbersNeeded?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  async function saveNumbers() {
    if (nums.trim() === (booking.cartNumbers ?? '').trim()) return;
    setNumsBusy(true); setError(''); setNumsSaved(false);
    const r = await dfetch<{ cartNumbers: string }>('/api/operator/cart-numbers', { method: 'PATCH', body: JSON.stringify({ id: booking.id, cartNumbers: nums }) });
    // A toast too: Next may already have moved the card on (this box unmounts), and the failure must still be seen.
    if (!r.ok) { setError(r.error); toast(`Cart numbers not saved — ${r.error}`, 'bad'); } else setNumsSaved(true);
    await onChanged();
    setNumsBusy(false);
  }
  const perCart = booking.cartUnitCents != null || (!booking.cartSelected && opts?.cartRule === 'per_cart');

  async function save(body: { riders?: number; buckets?: Record<string, number> }) {
    setBusy(true); setError('');
    const r = await dfetch('/api/operator/bookings', { method: 'PATCH', body: JSON.stringify({ id: booking.id, action: 'set_extras', ...body }) });
    if (!r.ok) setError(r.error);
    await onChanged();
    setBusy(false);
  }

  const can = !locked && !busy;
  const cartLine = riders === 0 ? 'Walking'
    : perCart ? `${cartsFor(riders)} cart${cartsFor(riders) === 1 ? '' : 's'} · ${usd(booking.cartUnitCents ?? cartFeeCents)} a cart`
    : booking.memberCartCents != null ? `member ${usd(booking.memberCartCents)}, others ${usd(riders > 1 && booking.cartFeeTotal != null ? Math.round((booking.cartFeeTotal - booking.memberCartCents) / (riders - 1)) : cartFeeCents)}`
    : `${usd(riders > 0 && booking.cartFeeTotal != null ? Math.round(booking.cartFeeTotal / riders) : cartFeeCents)} a rider`;

  return (
    <div className="mt-3 rounded-[7px] bg-white px-3 py-1 divide-y divide-line-soft">
      <div className="flex items-center gap-3 py-2.5">
        <span className="text-[14px] text-ink mr-auto">Riding <span className="text-[12.5px] text-ink-muted">· {cartLine}</span></span>
        <button type="button" aria-label="One fewer rider" disabled={!can || riders <= 0 || !walkingAllowed} onClick={() => save({ riders: riders - 1 })} className={STEP}>−</button>
        <span className="w-14 text-center text-[15px] font-semibold tabular-nums text-ink">{riders} <span className="text-[12px] font-normal text-ink-muted">of {booking.players}</span></span>
        <button type="button" aria-label="One more rider" disabled={!can || riders >= booking.players} onClick={() => save({ riders: riders + 1 })} className={STEP}>+</button>
      </div>
      {askNumbers && (
        <label className="flex items-center gap-3 py-2.5">
          <span className="text-[14px] text-ink mr-auto">Cart numbers</span>
          {(numsBusy || numsSaved) && <span className="text-[12px] text-ink-muted" role="status">{numsBusy ? 'Saving…' : 'Saved'}</span>}
          <input value={nums} onChange={e => { setNums(e.target.value); setNumsSaved(false); }} onBlur={saveNumbers} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            disabled={numsBusy} inputMode="numeric" placeholder={cartsFor(riders) > 1 || riders > 1 ? 'e.g. 12, 14' : 'e.g. 12'} aria-invalid={numbersNeeded}
            className={'w-36 rounded-[7px] border bg-white px-3 py-2 text-[14px] text-ink tabular-nums placeholder-ink-faint ' + (numbersNeeded ? 'border-bad' : 'border-line')} />
        </label>
      )}
      {numbersNeeded && <p className="py-1.5 text-[12px] text-bad">Cart numbers are required at check-in.</p>}
      {!walkingAllowed && <p className="py-1.5 text-[12px] text-ink-muted">This time can’t be walked — everyone rides.</p>}
      {rows.map(r => (
        <div key={r.key} className="flex items-center gap-3 py-2.5">
          <span className="text-[14px] text-ink mr-auto">{r.name} <span className="text-[12.5px] text-ink-muted">· {r.note}</span></span>
          <button type="button" aria-label={`One fewer ${r.name}`} disabled={!can || r.qty <= 0} onClick={() => save({ buckets: { [r.key]: r.key === BOOKED_KEY ? 0 : r.qty - 1 } })} className={STEP}>−</button>
          <span className="w-14 text-center text-[15px] font-semibold tabular-nums text-ink">{r.qty}</span>
          <button type="button" aria-label={`One more ${r.name}`} disabled={!can || r.qty >= r.max} onClick={() => save({ buckets: { [r.key]: r.qty + 1 } })} className={STEP}>+</button>
        </div>
      ))}
      {locked && <p className="py-1.5 text-[12px] text-ink-muted">{locked}</p>}
      {error && <p role="alert" className="py-1.5 text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}
