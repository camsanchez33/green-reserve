// PRICE-2 (Cam 2026-10-30: "Last-minute deals" — who gets it and whether it stacks
// "up to course"; the booking page shows the old price struck through): an open tee time
// inside the course's window (N hours before it goes off) costs N% less, automatically.
//
//  • Off unless the course turns it on (the Schedule page).
//  • Online always; at the counter only when the course says so (lastMinuteCounter).
//  • A member or resident rate: by default the golfer pays whichever is lower — their
//    rate or the deal price (best price wins); with lastMinuteStack the deal comes off
//    their rate too. Guests and everyone else pay the deal price.
//  • Priced seat by seat, like promo codes (lib/promo-codes) — a promo code then comes
//    off the deal price — so the per-seat rates kept on the booking add up to its total.
//  • The percent applied is kept on the booking (lastMinutePct).
import { teeTimeInstant } from './booking-events';

export type DealCourse = {
  lastMinuteOn: boolean; lastMinuteHours: number; lastMinutePct: number;
  lastMinuteCounter: boolean; lastMinuteStack: boolean; timezone: string;
};

/** Pure: the percent off this tee time gets right now (0 = no deal). */
export function dealPct(c: Partial<DealCourse> | null | undefined, slot: { date: string; time: string }, via: 'online' | 'counter', now: Date = new Date()): number {
  if (!c?.lastMinuteOn || !c.lastMinutePct || !c.lastMinuteHours || !c.timezone) return 0;
  if (via === 'counter' && !c.lastMinuteCounter) return 0;
  const at = teeTimeInstant(c.timezone, slot.date, slot.time.slice(0, 5));
  if (!at) return 0;
  const ms = at.getTime() - now.getTime();
  return ms > 0 && ms <= c.lastMinuteHours * 3_600_000 ? Math.min(90, Math.max(1, c.lastMinutePct)) : 0;
}

/** Pure: a public seat at the deal price. */
export const dealSeat = (pct: number, cents: number) => (pct > 0 ? cents - Math.round(cents * pct / 100) : cents);

/** Pure: a member or resident seat under the deal — best price wins, or the deal off their rate when it stacks. */
export const dealRateSeat = (pct: number, rateCents: number, publicCents: number, stack: boolean) =>
  pct <= 0 ? rateCents : stack ? dealSeat(pct, rateCents) : Math.min(rateCents, dealSeat(pct, publicCents));

/** Validate the course's settings (the Schedule page). */
export function dealSettingsError(b: { lastMinuteHours?: unknown; lastMinutePct?: unknown }): string | null {
  if (b.lastMinuteHours !== undefined && !(Number.isInteger(Number(b.lastMinuteHours)) && Number(b.lastMinuteHours) >= 1 && Number(b.lastMinuteHours) <= 48)) return 'Last-minute window is 1 to 48 hours.';
  if (b.lastMinutePct !== undefined && !(Number.isInteger(Number(b.lastMinutePct)) && Number(b.lastMinutePct) >= 1 && Number(b.lastMinutePct) <= 90)) return 'Last-minute discount is 1 to 90%.';
  return null;
}
