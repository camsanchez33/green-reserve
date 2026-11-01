// Settings → "Who gets their own price" (Cam 2026-11-01: "Off stops the rates", with a
// backfill + auto-on). ONE rule, read by every path that prices a member's or a
// resident's spot — online booking, the member portal's times, the booking page's
// own-rate preview, a golfer's own swap, check-in, the counter and the register:
//   • Members off → no member tier rate anywhere; everyone pays the public price.
//     (Membership itself — dues, the member account, the member booking window — is
//     not a price and is untouched.)
//   • Residents off → no resident rate anywhere.
// A course that sets a member or resident price is switched on for it (tiers route,
// schedules save), and migration 20261101_pricing_switch_backfill switched on every
// course that already had one, so turning this on was never something to forget.
import { prisma } from './prisma';

export const memberPricingOn = (c: { hasMemberPricing?: boolean | null } | null | undefined) => !!c?.hasMemberPricing;
export const residentPricingOn = (c: { hasResidentPricing?: boolean | null } | null | undefined) => !!c?.hasResidentPricing;

// ── Auto-on (Cam 2026-11-01: "backfill + auto-on") ──
// Setting a member or resident price switches it on, so a course never sets a price
// and then finds it isn't charged. Only a NEWLY set price does it (a value that wasn't
// there before the write) — renaming a membership or re-saving the same schedule never
// flips back a switch the owner turned off. Server-only (prisma).

type Snap = { member: Set<string>; resident: Set<string> };

async function priceSnapshot(courseId: string): Promise<Snap> {
  const [tiers, schedules] = await Promise.all([
    // Every row, active or not: resuming a paused schedule or membership adds no NEW value, so it never
    // flips back a switch the owner turned off (final review 2026-11-01). Only a typed price does.
    prisma.membershipTier.findMany({ where: { courseId }, select: { greenFeeWeekdayCents: true, greenFeeWeekendCents: true, cartFeeWeekdayCents: true, cartFeeWeekendCents: true, discountPct: true } }),
    prisma.teeTimeSchedule.findMany({ where: { courseId }, select: { memberRateWeekdayCents: true, memberRateWeekendCents: true, residentRateWeekdayCents: true, residentRateWeekendCents: true } }),
  ]);
  const member = new Set<string>(), resident = new Set<string>();
  const add = (set: Set<string>, kind: string, v: number | null) => { if (v != null) set.add(`${kind}:${v}`); };
  for (const t of tiers) {
    add(member, 'tgd', t.greenFeeWeekdayCents); add(member, 'tge', t.greenFeeWeekendCents);
    add(member, 'tcd', t.cartFeeWeekdayCents); add(member, 'tce', t.cartFeeWeekendCents); add(member, 'tpct', t.discountPct);
  }
  for (const s of schedules) {
    add(member, 'sd', s.memberRateWeekdayCents); add(member, 'se', s.memberRateWeekendCents);
    add(resident, 'rd', s.residentRateWeekdayCents); add(resident, 're', s.residentRateWeekendCents);
  }
  return { member, resident };
}

/**
 * A course being BUILT (Admin → create course, the setup sheet's build): no owner has chosen
 * yet, so each switch is simply on when the build wrote that kind of price — the same rule
 * as the backfill migration (an active priced membership or schedule member rate; an active
 * schedule resident rate). Only ever switches on.
 */
export async function switchOnWherePriced(courseId: string): Promise<void> {
  const [tier, memberSched, residentSched] = await Promise.all([
    prisma.membershipTier.findFirst({ where: { courseId, active: true, OR: [{ greenFeeWeekdayCents: { not: null } }, { greenFeeWeekendCents: { not: null } }, { cartFeeWeekdayCents: { not: null } }, { cartFeeWeekendCents: { not: null } }, { discountPct: { not: null } }] }, select: { id: true } }),
    prisma.teeTimeSchedule.findFirst({ where: { courseId, active: true, OR: [{ memberRateWeekdayCents: { not: null } }, { memberRateWeekendCents: { not: null } }] }, select: { id: true } }),
    prisma.teeTimeSchedule.findFirst({ where: { courseId, active: true, OR: [{ residentRateWeekdayCents: { not: null } }, { residentRateWeekendCents: { not: null } }] }, select: { id: true } }),
  ]);
  const data = { ...(tier || memberSched ? { hasMemberPricing: true } : {}), ...(residentSched ? { hasResidentPricing: true } : {}) };
  if (Object.keys(data).length) await prisma.course.update({ where: { id: courseId }, data });
}

/** Run a write that may set member / resident prices; switch each kind on when it gained a new price. */
export async function withPriceSwitch<T>(courseId: string, write: () => Promise<T>): Promise<T> {
  const before = await priceSnapshot(courseId);
  const result = await write();
  try {
    const after = await priceSnapshot(courseId);
    const gained = (k: keyof Snap) => [...after[k]].some(v => !before[k].has(v));
    const data = { ...(gained('member') ? { hasMemberPricing: true } : {}), ...(gained('resident') ? { hasResidentPricing: true } : {}) };
    if (Object.keys(data).length) await prisma.course.update({ where: { id: courseId }, data });
  } catch (err) {
    // The prices are saved either way; a missed switch is visible in Settings, never a wrong charge in the golfer's favour or against them beyond the public price.
    console.error(JSON.stringify({ ev: 'pricing_switch.auto_on.fail', courseId, error: err instanceof Error ? err.message : String(err) }));
  }
  return result;
}
