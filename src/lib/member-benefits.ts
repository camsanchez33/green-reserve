// GOLFER-LOGIN-1 (Cam 2026-11-18, approved log-in mockup): one line of what a membership gives, e.g.
// "20% off every round · book 9 days out · 6 guest passes a year". Used by the invite email and "Your <Course>".
// Words only: every price itself comes from lib/tier-rates when a booking is priced.
import { windowFor, type WindowCourse } from './booking-window';
import { readLineRates } from './tier-rates';

export type BenefitTier = {
  discountPct: number | null; greenFeeWeekdayCents: number | null; greenFeeWeekendCents: number | null;
  lineRates: unknown; advanceBookingDays: number | null; windowPublic: boolean; guestPassesPerYear: number;
};

/** The tier with its prices taken off, for a course with Members pricing off (lib/pricing-switch): no member rate is
 *  charged then, so none is described. The window and guest passes are not prices and stay. */
export function withoutRates<T extends BenefitTier>(tier: T): T {
  return { ...tier, discountPct: null, greenFeeWeekdayCents: null, greenFeeWeekendCents: null, lineRates: null };
}

const dollars = (c: number) => (c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`);

/** `opts.resident`: the member also holds a resident card good today, so the window said is the one enforced (the longer). */
export function memberBenefitParts(tier: BenefitTier | null, course: WindowCourse, opts: { resident?: boolean } = {}): string[] {
  const out: string[] = [];
  if (tier) {
    if (readLineRates(tier.lineRates)) out.push('member prices on your rounds');
    else if (tier.discountPct != null && tier.discountPct > 0) out.push(`${tier.discountPct}% off every round`);
    else if (tier.greenFeeWeekdayCents != null || tier.greenFeeWeekendCents != null) {
      const low = Math.min(...[tier.greenFeeWeekdayCents, tier.greenFeeWeekendCents].filter((c): c is number => c != null));
      out.push(low === 0 ? 'free rounds' : `rounds from ${dollars(low)}`);
    }
  }
  const w = windowFor(course, { tier }, opts);
  if (w.ownWindow) out.push(`book ${w.days} day${w.days === 1 ? '' : 's'} out`);
  if (tier && tier.guestPassesPerYear > 0) out.push(`${tier.guestPassesPerYear} guest pass${tier.guestPassesPerYear === 1 ? '' : 'es'} a year`);
  return out;
}

export const memberBenefitsLine = (tier: BenefitTier | null, course: WindowCourse) => memberBenefitParts(tier, course).join(' · ');
