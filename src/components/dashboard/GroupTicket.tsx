// DASH-D (Cam 2026-11-01, "make checking someone in a little more POS like"): the
// round's ticket on the tee time card — what the card is charged, line by line, for
// the players here now. Display only: the amounts come from the same pieces the
// server charges (lib/member-rates partyFees, the booking's own totals), and the
// total is the one the check-in confirm already quotes. Shop items are listed by
// ShopItemsForGroup under it; their fee and tax ride in `extraCents`.
import { partyFees } from '@/lib/member-rates';

export type TicketBooking = {
  players: number; totalAmount: number; accessFeeTotal?: number;
  greenFeeTotal?: number; cartFeeTotal?: number; rangeBallsTotal?: number;
  residentPlayers?: number; residentRateCents?: number | null; memberRateCents?: number | null; memberCartCents?: number | null;
};
export type TicketLine = { label: string; detail: string; cents: number };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The round's lines for `n` of the group, and the round total the card is charged (shop items aside). */
export function ticketLines(b: TicketBooking, n: number): { lines: TicketLine[]; roundCents: number } {
  const whole = n >= b.players;
  const access = Math.round((b.accessFeeTotal ?? 0) * (whole ? 1 : n / b.players));
  const lines: TicketLine[] = [];
  let parts = 0;
  if (b.greenFeeTotal != null) {
    const f = whole
      ? { greenFeeTotal: b.greenFeeTotal, cartFeeTotal: b.cartFeeTotal ?? 0 }
      : partyFees({ players: b.players, greenFeeTotal: b.greenFeeTotal, cartFeeTotal: b.cartFeeTotal ?? 0, residentPlayers: b.residentPlayers ?? 0, residentRateCents: b.residentRateCents ?? null, memberRateCents: b.memberRateCents ?? null, memberCartCents: b.memberCartCents ?? null }, n, { greenFeeCents: 0, cartFeeCents: 0 });
    lines.push({ label: 'Green fee', detail: plural(n, 'player'), cents: f.greenFeeTotal });
    if (f.cartFeeTotal > 0) lines.push({ label: 'Cart', detail: '', cents: f.cartFeeTotal });
    if ((b.rangeBallsTotal ?? 0) > 0) lines.push({ label: 'Range balls', detail: '', cents: b.rangeBallsTotal! });
    parts = f.greenFeeTotal + f.cartFeeTotal + (b.rangeBallsTotal ?? 0);
  } else {
    // No parts stored: the sheet prorates the whole total (partRound), so the round line is that less the fee.
    parts = (whole ? Math.round(b.totalAmount) : Math.round(b.totalAmount * n / b.players)) - access;
    lines.push({ label: 'Round', detail: plural(n, 'player'), cents: parts });
  }
  if (access > 0) lines.push({ label: 'Booking fee', detail: plural(n, 'player'), cents: access });
  // The whole group is charged the booking's own total; anything the pieces don't explain
  // (a promo code, a price set by staff) shows as its own line, so the lines add up.
  const roundCents = whole ? Math.round(b.totalAmount) : parts + access;
  const gap = roundCents - (parts + access);
  if (gap !== 0) lines.push({ label: gap < 0 ? 'Discount' : 'Adjustment', detail: '', cents: gap });
  return { lines, roundCents };
}

const usd = (c: number) => (c < 0 ? '−$' : '$') + (Math.abs(c) / 100).toFixed(2);

export default function GroupTicket({ booking, here }: { booking: TicketBooking; here: number }) {
  const { lines } = ticketLines(booking, here);
  return (
    <div className="divide-y divide-line">
      {lines.map(l => (
        <div key={l.label} className="flex items-baseline gap-3 py-2 text-[13.5px]">
          <span className="flex-1 text-ink">{l.label}</span>
          {l.detail && <span className="text-[12.5px] text-ink-muted tabular-nums">{l.detail}</span>}
          <span className="w-20 text-right font-medium text-ink tabular-nums">{usd(l.cents)}</span>
        </div>
      ))}
    </div>
  );
}
