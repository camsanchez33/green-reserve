// Settings → Prices & fees, "Who pays what" (Cam 2026-10-19, OPERATOR_REWORK_SPEC
// "Settings — round 1"): one table, a row per kind of golfer the course has
// (public, residents, each membership), weekday and weekend, each row with one
// plain sentence on who it is and how they get the price. Rows appear only when
// used. The prices are READ from where they are set — Schedule (public, resident)
// and Members (memberships) — and computed with the same rules the booking uses
// (applyTierRates, the resident rate per player), so the table can't disagree
// with what golfers are charged. Pure: no database, no session.
import { applyTierRates } from './tier-rates';

/** A schedule as /api/operator/schedule returns it (dollars). */
export type WireSchedule = {
  id: string; tierName: string; active: boolean; startTime: string; endTime: string; daysOfWeek: number[];
  greenFeeWeekday: number; greenFeeWeekend: number; cartFee: number;
  memberRateWeekday: number | null; memberRateWeekend: number | null;
  residentRateWeekday: number | null; residentRateWeekend: number | null;
  productLabel?: string | null;
};
/** A membership as /api/operator/tiers returns it (dollars). */
export type WireTier = {
  id: string; name: string; active: boolean; color?: string;
  greenFeeWeekday: number | null; greenFeeWeekend: number | null;
  cartFeeWeekday: number | null; cartFeeWeekend: number | null;
  discountPct: number | null;
};

export type Period = { id: string; label: string };
/** One price per period; null = this kind of golfer pays the public rate there;
 *  na = the period has no tee times on those days (a weekend-only schedule's weekday). */
export type Cell = { periodId: string; dollars: number | null; na?: boolean };
export type Row = { key: string; label: string; who: string; color?: string; weekday: Cell[]; weekend: Cell[] };

const c = (d: number | null | undefined) => (d == null ? null : Math.round(d * 100));
const d = (cents: number) => cents / 100;
// A Wednesday and a Saturday: applyTierRates decides weekday/weekend from the date.
const WEEKDAY = '2026-10-21';
const WEEKEND = '2026-10-24';

function periodLabel(s: WireSchedule, many: boolean) {
  const name = s.tierName && s.tierName !== 'standard' ? s.tierName : many ? 'Other times' : 'All day';
  return s.productLabel ? `${s.productLabel} · ${name}` : name;
}

// Settings' Members / Residents switches (lib/pricing-switch): a switched-off kind of price is never charged, so it has no row.
export function whoPays(schedules: WireSchedule[], tiers: WireTier[], switches: { membersOn?: boolean; residentsOn?: boolean } = {}): { periods: Period[]; rows: Row[] } {
  // Columns in the order of the day (Morning before Twilight), not the order they were made.
  const live = schedules.filter(s => s.active).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.tierName.localeCompare(b.tierName));
  const periods = live.map(s => ({ id: s.id, label: periodLabel(s, live.length > 1) }));
  // A schedule limited to some days generates no tee times on the others (tee-sheet-engine).
  const runs = (s: WireSchedule, weekend: boolean) => !s.daysOfWeek?.length || s.daysOfWeek.some(d => (d === 0 || d === 6) === weekend);
  const cells = (pick: (s: WireSchedule) => number | null, weekend: boolean): Cell[] =>
    live.map(s => runs(s, weekend) ? { periodId: s.id, dollars: pick(s) } : { periodId: s.id, dollars: null, na: true });
  const rows: Row[] = [];

  rows.push({
    key: 'public', label: 'Public', who: 'Anyone who books — online, by phone or as a walk-in.',
    weekday: cells(s => s.greenFeeWeekday, false),
    weekend: cells(s => s.greenFeeWeekend, true),
  });

  if (switches.residentsOn !== false && live.some(s => s.residentRateWeekday != null || s.residentRateWeekend != null)) {
    rows.push({
      key: 'resident', label: 'Residents',
      who: 'Golfers on your Residents list (Members → Residents). Signed in, a resident books themselves at this rate; at the counter, staff set how many of a group showed a card.',
      weekday: cells(s => s.residentRateWeekday, false),
      weekend: cells(s => s.residentRateWeekend, true),
    });
  }

  const memberPrice = (s: WireSchedule, t: WireTier, date: string) => {
    const weekend = date === WEEKEND;
    const teeTime = {
      date, greenFeeCents: c(weekend ? s.greenFeeWeekend : s.greenFeeWeekday) ?? 0, cartFeeCents: c(s.cartFee) ?? 0,
      memberRateCents: c(weekend ? s.memberRateWeekend : s.memberRateWeekday),
    };
    const tier = {
      greenFeeWeekdayCents: c(t.greenFeeWeekday), greenFeeWeekendCents: c(t.greenFeeWeekend),
      cartFeeWeekdayCents: c(t.cartFeeWeekday), cartFeeWeekendCents: c(t.cartFeeWeekend), discountPct: t.discountPct,
    };
    const cents = applyTierRates(teeTime, tier).greenFeeCents;
    return cents === teeTime.greenFeeCents ? null : d(cents);
  };

  for (const t of switches.membersOn === false ? [] : tiers.filter(t => t.active)) {
    const how = t.greenFeeWeekday != null || t.greenFeeWeekend != null ? 'their own flat price'
      : t.discountPct != null ? `${t.discountPct}% off the public rate`
      : 'the member rate on your schedule';
    const weekday = cells(s => memberPrice(s, t, WEEKDAY), false);
    const weekend = cells(s => memberPrice(s, t, WEEKEND), true);
    const noPrice = [...weekday, ...weekend].every(x => x.dollars == null);
    rows.push({
      key: `tier:${t.id}`, label: t.name, color: t.color,
      who: noPrice
        ? `Members on the ${t.name} membership pay the public rate: it has no price of its own and no schedule has a member rate. Give it one in Members.`
        : `Members on the ${t.name} membership pay ${how} when they book signed in with the email on their membership.`,
      weekday, weekend,
    });
  }

  // No "Members" row without a membership: a schedule's member rate only ever
  // reaches a golfer through a membership with no price of its own (booking
  // route: the rate applies inside `if (membership?.tier)`).
  return { periods, rows };
}
