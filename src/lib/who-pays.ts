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
/** One price per period; null = this kind of golfer pays the public rate there. */
export type Cell = { periodId: string; dollars: number | null };
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

export function whoPays(schedules: WireSchedule[], tiers: WireTier[]): { periods: Period[]; rows: Row[] } {
  // Columns in the order of the day (Morning before Twilight), not the order they were made.
  const live = schedules.filter(s => s.active).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.tierName.localeCompare(b.tierName));
  const periods = live.map(s => ({ id: s.id, label: periodLabel(s, live.length > 1) }));
  const rows: Row[] = [];

  rows.push({
    key: 'public', label: 'Public', who: 'Anyone who books — online, by phone or as a walk-in.',
    weekday: live.map(s => ({ periodId: s.id, dollars: s.greenFeeWeekday })),
    weekend: live.map(s => ({ periodId: s.id, dollars: s.greenFeeWeekend })),
  });

  if (live.some(s => s.residentRateWeekday != null || s.residentRateWeekend != null)) {
    rows.push({
      key: 'resident', label: 'Residents',
      who: 'Golfers on your Residents list (Members → Residents). Signed in, a resident books themselves at this rate; at the counter, staff set how many of a group showed a card.',
      weekday: live.map(s => ({ periodId: s.id, dollars: s.residentRateWeekday })),
      weekend: live.map(s => ({ periodId: s.id, dollars: s.residentRateWeekend })),
    });
  }

  const memberPrice = (s: WireSchedule, t: WireTier | null, date: string) => {
    const weekend = date === WEEKEND;
    const teeTime = {
      date, greenFeeCents: c(weekend ? s.greenFeeWeekend : s.greenFeeWeekday) ?? 0, cartFeeCents: c(s.cartFee) ?? 0,
      memberRateCents: c(weekend ? s.memberRateWeekend : s.memberRateWeekday),
    };
    const tier = t && {
      greenFeeWeekdayCents: c(t.greenFeeWeekday), greenFeeWeekendCents: c(t.greenFeeWeekend),
      cartFeeWeekdayCents: c(t.cartFeeWeekday), cartFeeWeekendCents: c(t.cartFeeWeekend), discountPct: t.discountPct,
    };
    // No tier = the schedule's own member rate (members without a membership tier).
    const cents = tier ? applyTierRates(teeTime, tier).greenFeeCents : (teeTime.memberRateCents ?? teeTime.greenFeeCents);
    return cents === teeTime.greenFeeCents ? null : d(cents);
  };

  for (const t of tiers.filter(t => t.active)) {
    const how = t.greenFeeWeekday != null || t.greenFeeWeekend != null ? 'their own flat price'
      : t.discountPct != null ? `${t.discountPct}% off the public rate`
      : 'the member rate on your schedule';
    const weekday = live.map(s => ({ periodId: s.id, dollars: memberPrice(s, t, WEEKDAY) }));
    const weekend = live.map(s => ({ periodId: s.id, dollars: memberPrice(s, t, WEEKEND) }));
    const noPrice = [...weekday, ...weekend].every(x => x.dollars == null);
    rows.push({
      key: `tier:${t.id}`, label: t.name, color: t.color,
      who: noPrice
        ? `Members on the ${t.name} membership pay the public rate: it has no price of its own and no schedule has a member rate. Give it one in Members.`
        : `Members on the ${t.name} membership pay ${how} when they book signed in with the email on their membership.`,
      weekday, weekend,
    });
  }

  if (!tiers.some(t => t.active) && live.some(s => s.memberRateWeekday != null || s.memberRateWeekend != null)) {
    rows.push({
      key: 'members', label: 'Members', who: 'Members signed in with the email on their membership. Set up memberships in Members to give each its own price.',
      weekday: live.map(s => ({ periodId: s.id, dollars: memberPrice(s, null, WEEKDAY) })),
      weekend: live.map(s => ({ periodId: s.id, dollars: memberPrice(s, null, WEEKEND) })),
    });
  }

  return { periods, rows };
}
