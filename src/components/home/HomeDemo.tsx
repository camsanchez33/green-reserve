'use client';
import { useState } from 'react';
import Image from 'next/image';
import s from '@/app/home.module.css';

// H-1 §4 "See it work" — the golfer's booking page, in demo mode: no network,
// no Stripe, no real course. It mirrors the course page's slot-row interaction
// (tap a time → the row expands in place → Reserve → reserved state). The
// accent and the photo knobs live in SeeItWork.tsx (H-2b) so the same swatch
// drives this and the dashboard demo. Deliberately NOT a fork of
// CourseBookingClient: that is 1,500 lines of real booking logic with fetches
// and Stripe. Copy here must stay honest — no fee claims beyond the $1.50/player
// line the product actually shows.

const SLOTS = [
  { time: '7:10', open: 4, price: 62 },
  { time: '7:40', open: 2, price: 62 },
  { time: '8:40', open: 0, price: 62 },
  { time: '12:30', open: 3, price: 54 },
];
const PLAYERS = 2;
const CART = 18;
const FEE = 1.5;
const money = (n: number) => `$${n.toFixed(2)}`;

// H-2d: `compact` is the hero variant — three rows, a shorter header, the
// same live interaction. Its state is its own; the "See it work" instance is a
// separate mount.
export default function HomeDemo({ accent, photo, compact = false }: { accent: string; photo: boolean; compact?: boolean }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [reservedIdx, setReservedIdx] = useState<number | null>(null);
  const [cart, setCart] = useState(false);
  const done = reservedIdx !== null;

  function reset() { setOpenIdx(null); setReservedIdx(null); setCart(false); }

  return (
    <div className={`${s.device} ${photo ? '' : s.nophoto} ${compact ? s.compact : ''}`} style={{ '--course': accent } as React.CSSProperties} aria-label="Example course booking page — try it">
      <div className={s.dHd}>
        {/* H-2d-R2: in the hero (compact) this sits above the fold, so it loads eagerly instead of popping in. */}
        <Image src="/home/iron.jpg" alt="" fill sizes="390px" priority={compact} loading={compact ? 'eager' : 'lazy'} />
        <div className={s.dTag}>Example course · Public · Est. 1962</div>
        <div className={s.dId}>
          <div className={s.dCrest} aria-hidden="true">HC</div>
          <div>
            <div className={s.dName}>Hollow Creek<br />Golf Club</div>
            <div className={s.dSub}>Suffern, New York · 18 holes · Par 71</div>
          </div>
        </div>
      </div>
      <div className={s.trust} aria-live="polite">
        {done
          ? <><b>See you out there.</b> Card saved, nothing charged. Cancel free until the day before your tee time.</>
          : compact
            ? <><b>Nothing charged today.</b> Cancel free until the day before your tee time.</>
            : <><b>Nothing charged today.</b> Cancel free until the day before your tee time. ${FEE.toFixed(2)}/player booking fee.</>}
      </div>
      <div className={s.rows}>
        {(compact ? SLOTS.slice(0, 3) : SLOTS).map((slot, i) => {
          if (slot.open === 0) {
            return (
              <div key={slot.time} className={`${s.row} ${s.full}`}>
                <div className={s.hit}>
                  <span><span className={s.t}>{slot.time}</span><span className={s.meta}>Full</span></span>
                  <span className={`${s.pr} ${s.prMuted}`}>Tell me if it opens</span>
                </div>
              </div>
            );
          }
          const isOpen = openIdx === i;
          const isReserved = reservedIdx === i;
          const green = slot.price * PLAYERS;
          const cartTotal = cart ? CART * PLAYERS : 0;
          const fee = FEE * PLAYERS;
          return (
            <div key={slot.time} className={`${s.row} ${isOpen ? s.open : ''} ${isReserved ? s.reserved : ''}`}>
              <button type="button" className={s.hit} aria-expanded={isOpen}
                onClick={() => { if (done) return; setOpenIdx(isOpen ? null : i); }}>
                <span><span className={s.t}>{slot.time}</span><span className={s.meta}>{slot.open} open</span></span>
                <span className={s.pr}>${slot.price} <small>/ player</small><span className={s.chev} aria-hidden="true">+</span></span>
              </button>
              <div className={s.detail}>
                <div>
                  <div className={s.opts} role="group" aria-label="Walking or cart">
                    <button type="button" className={`${s.opt} ${!cart ? s.on : ''}`} aria-pressed={!cart} onClick={() => setCart(false)} disabled={done}>Walking</button>
                    <button type="button" className={`${s.opt} ${cart ? s.on : ''}`} aria-pressed={cart} onClick={() => setCart(true)} disabled={done}>Cart · +${CART} / player</button>
                  </div>
                  <div className={s.lines}>
                    <div><span>{PLAYERS} green fees</span><span>{money(green)}</span></div>
                    {cart && <div><span>Cart ({PLAYERS} × ${CART})</span><span>{money(cartTotal)}</span></div>}
                    {/* H-2d review FIX-1: the hero (compact) shows no fee line, so its total excludes the fee too. */}
                    {!compact && <div><span>Booking fee ({PLAYERS} × ${FEE.toFixed(2)})</span><span>{money(fee)}</span></div>}
                    <div className={s.tot}><span>Pay at check-in</span><span>{money(green + cartTotal + (compact ? 0 : fee))}</span></div>
                  </div>
                  <button type="button" className={s.reserve} onClick={() => setReservedIdx(i)}>
                    {isReserved ? `Reserved ${slot.time} AM · $0 charged today` : 'Reserve this tee time'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className={s.dFt}>
        <span>Booking by GreenReserve</span>
        {done && <button type="button" onClick={reset}>Start over</button>}
      </div>
    </div>
  );
}
