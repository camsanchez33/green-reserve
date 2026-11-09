'use client';
// CART-3 (Cam 2026-11-09: "still cant add or take off a cart on the checkout"; "range balls need to be done now";
// picked "Riding − N +" and "Buckets − N + at checkout"). Checkout step 2's two rows: how many of the group ride, and
// the range-ball buckets of each size. Each tap saves (PATCH set_extras, lib/checkout-extras) and the sheet re-reads
// the booking, so the ticket and the total below show the new price. Locked once the round is paid or being paid.
import { useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { ballCounts, MAX_BUCKETS, type BallSize } from '@/lib/range-balls';
import { cartsFor } from '@/lib/cart-pricing';

type Options = { cartRule: 'per_player' | 'per_cart'; range: { size: BallSize; priceCents: number }[] };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const STEP = 'w-10 h-10 rounded-[7px] border border-line bg-white text-[17px] text-ink hover:bg-paper disabled:opacity-40';

export function CheckoutExtras({ booking, cartFeeCents, walkingAllowed, locked, onChanged }: {
  booking: { id: string; players: number; cartFeeTotal?: number; memberCartCents?: number | null; cartSelected?: boolean; cartRiders?: number | null; cartUnitCents?: number | null; rangeBallsSize?: string; rangeBallsTotal?: number };
  /** The tee time's cart price (per player, or per cart on a per-cart course). */
  cartFeeCents: number; walkingAllowed: boolean;
  /** Why the rows can't change (paid, a no-show, a pack, an event, the login), or null when they can. */
  locked: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dfetch<Options>('/api/operator/checkout-options').then(r => { if (r.ok) setOpts(r.data); else setError(r.error); });
  }, []);

  const riders = booking.cartSelected ? (booking.cartRiders ?? booking.players) : 0;
  const balls = ballCounts(booking.rangeBallsSize, booking.rangeBallsTotal);
  const perCart = booking.cartUnitCents != null || (!booking.cartSelected && opts?.cartRule === 'per_cart');

  async function save(body: { riders?: number; balls?: Record<BallSize, number> }) {
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
      {!walkingAllowed && <p className="py-1.5 text-[12px] text-ink-muted">This time can’t be walked — everyone rides.</p>}
      {(opts?.range ?? []).map(({ size, priceCents }) => (
        <div key={size} className="flex items-center gap-3 py-2.5">
          <span className="text-[14px] text-ink mr-auto">Range balls, {size} <span className="text-[12.5px] text-ink-muted">· {priceCents ? usd(priceCents) : 'free'}</span></span>
          <button type="button" aria-label={`One fewer ${size} bucket`} disabled={!can || balls[size] <= 0} onClick={() => save({ balls: { ...balls, [size]: balls[size] - 1 } })} className={STEP}>−</button>
          <span className="w-14 text-center text-[15px] font-semibold tabular-nums text-ink">{balls[size]}</span>
          <button type="button" aria-label={`One more ${size} bucket`} disabled={!can || balls[size] >= MAX_BUCKETS} onClick={() => save({ balls: { ...balls, [size]: balls[size] + 1 } })} className={STEP}>+</button>
        </div>
      ))}
      {locked && <p className="py-1.5 text-[12px] text-ink-muted">{locked}</p>}
      {error && <p role="alert" className="py-1.5 text-[12.5px] text-bad">{error}</p>}
    </div>
  );
}
