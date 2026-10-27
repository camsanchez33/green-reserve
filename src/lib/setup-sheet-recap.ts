// Cam 2026-10-26 (onboarding walk): "that recap page after you submit should look
// better and also should send a recap email of what you submitted and what's
// happening next." ONE plain-words summary of a setup sheet, read by the done
// screen (/for-courses/details) and the confirmation email, so the two never
// disagree. Client-safe: no Node or Prisma imports. Reads the saved sheet loosely
// (old sheets nested the schedule under `schedule`, and memberships were a
// separate list before `passes`).

export type RecapRow = { label: string; value: string };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PERIOD: Record<string, string> = { annual: 'a year', season: 'a season', monthly: 'a month', per_punch: 'a punch' };
const FACILITIES: [string, string][] = [
  ['range', 'Driving range'], ['puttingGreen', 'Putting green'], ['chippingArea', 'Short-game area'], ['proShop', 'Pro shop'],
  ['lessons', 'Lessons'], ['clubRental', 'Club rental'], ['cartRental', 'Push cart rental'], ['gpsCarts', 'GPS carts'],
  ['eventSpace', 'Event space'], ['lockerRooms', 'Locker rooms'], ['tournaments', 'Tournaments & outings'],
];
const FOOD: Record<string, string> = { beverage_cart: 'Beverage cart', snack_bar: 'Snack bar', bar: 'Bar', full: 'Restaurant' };

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
function money(v: unknown): string {
  const n = Number(str(v));
  if (!str(v) || !Number.isFinite(n)) return '';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}
function clock(v: unknown): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(v));
  if (!m) return str(v);
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

export function sheetRecap(details: Record<string, unknown>): RecapRow[] {
  const d = details ?? {};
  const sch = (d.schedule && typeof d.schedule === 'object' ? d.schedule : {}) as Record<string, unknown>;
  const rows: RecapRow[] = [];
  const add = (label: string, value: string) => { if (value) rows.push({ label, value }); };

  const holes = str(d.holes);
  add('Course', [holes && `${holes} holes`, str(d.par) && `par ${str(d.par)}`].filter(Boolean).join(', '));
  // The sheet saves month NAMES ('April'); older data may hold 1–12.
  const month = (v: unknown) => { const t = str(v); const i = MONTHS.findIndex(m => m.toLowerCase() === t.toLowerCase()); return i >= 0 ? i + 1 : Number(t); };
  const open = month(d.seasonOpen), close = month(d.seasonClose);
  const ok = (n: number) => n >= 1 && n <= 12;
  if (ok(open) && ok(close)) add('Season', `${MONTHS[open - 1]} to ${MONTHS[close - 1]}`);
  else if (ok(open) || ok(close)) add('Season', ok(open) ? `Opens in ${MONTHS[open - 1]}` : `Closes in ${MONTHS[close - 1]}`);
  else add('Season', 'Year-round');

  const days = Array.isArray(d.daysOpen) ? (d.daysOpen as unknown[]).map(Number).filter(n => n >= 0 && n <= 6).sort((a, b) => a - b) : [];
  const first = d.firstTeeTime ?? sch.startTime, last = d.lastTeeTime ?? sch.endTime;
  const every = str(d.intervalMinutes ?? sch.intervalMinutes);
  add('Tee times', [
    days.length === 0 || days.length === 7 ? 'Every day' : days.map(n => DAYS[n]).join(', '),
    first && last ? `${clock(first)} to ${clock(last)}` : '',
    every ? `every ${every} minutes` : '',
  ].filter(Boolean).join(', '));
  const ahead = str(d.publicAdvanceDays);
  if (ahead) add('Booking opens', `${ahead} days ahead`);

  const wd = money(d.greenFeeWeekday ?? sch.greenFeeWeekday), we = money(d.greenFeeWeekend ?? sch.greenFeeWeekend);
  add('Green fees', [wd && `${wd} weekdays`, we && `${we} weekends`].filter(Boolean).join(', '));
  const cart = money(d.cartFee ?? sch.cartFee), twi = money(d.twilightFee);
  add('Extras', [cart && `${cart} cart per player`, twi && `${twi} twilight`].filter(Boolean).join(', '));
  const walk = str(d.walkingAllowed);
  if (walk) add('Walking', walk === 'yes' ? 'Allowed any time' : walk === 'weekdays' ? 'Weekdays only' : walk === 'no' ? 'Cart required' : walk);
  if (holes === '9') {
    if (str(d.nineReplay) === 'yes') add('Replays', ['Second nine bookable', money(d.nineReplayFee)].filter(Boolean).join(', '));
  } else if (str(d.nineHoleSupport) === 'yes') {
    const which = { front: 'Front nine', back: 'Back nine', both: 'Either nine' }[str(d.nineHoleWhich)] ?? '';
    add('9 holes', [which, money(d.nineHoleFee)].filter(Boolean).join(', '));
  }

  if (str(d.cancellationPolicy) === 'yes') {
    const hrs = str(d.cancellationHours) || '24', fee = money(d.lateFee);
    // Matches the sheet's explainer: a new course charges the fee as a hold when the window closes (hold_at_cutoff).
    add('Cancellations', fee ? `Free until ${hrs} hours before. Then a ${fee} hold per booking, refunded at check-in and kept on a late cancel or no-show.` : `Free until ${hrs} hours before.`);
  } else if (str(d.cancellationPolicy) === 'no') {
    add('Cancellations', 'Free any time');
  }

  type Pass = { name?: string; fee?: string; feePeriod?: string; type?: string };
  const passes = (Array.isArray(d.passes) ? d.passes as Pass[] : []).filter(p => str(p?.name));
  const legacy = (Array.isArray(d.memberships) ? d.memberships as Pass[] : []).filter(p => str(p?.name));
  const tiers = (passes.length ? passes : legacy).map(p => {
    const fee = money(p.fee);
    return `${str(p.name)}${fee ? ` (${fee} ${PERIOD[str(p.feePeriod)] ?? 'a year'})` : ''}`;
  });
  add(tiers.length === 1 ? 'Membership' : 'Memberships', tiers.join('; '));

  const fv = (d.facilitiesV2 && typeof d.facilitiesV2 === 'object' ? d.facilitiesV2 : {}) as Record<string, unknown>;
  const fac = FACILITIES.filter(([k]) => fv[k] === true).map(([, l]) => l);
  const food = FOOD[str(fv.restaurantType)];
  if (food) fac.push(food);
  add('Facilities', fac.join(', '));

  const photos = Array.isArray(d.photos) ? d.photos.length : 0;
  if (photos) add('Photos', `${photos} uploaded`);
  if (str(d.description)) add('Description', str(d.description));
  return rows;
}

/** What happens after the sheet is in — the order the pipeline actually runs (admin builds → preview → dashboard login → live). */
export const SHEET_NEXT_STEPS: string[] = [
  'We build your booking page from these answers.',
  'We send you a preview. Approve it, or tell us what to change.',
  'We send your dashboard login. You sign the operator agreement and connect Stripe so payments reach your bank.',
  'You go live, and golfers can book.',
];
