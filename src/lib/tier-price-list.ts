// Memberships item 3 (Cam 2026-11-16, "rates against the course's own price list, blank = public and 0 = free, or
// % off"): the lines a membership's rates are set against — each round the course sells, weekday and weekend, green
// fee and cart — with the public price beside each, read from the course's schedule (Schedule → What it costs). The
// public price shown is the round's first price of the day on a Wednesday / a Saturday of the usual week; later price
// changes (twilight) follow it under a % off, or are the member's fixed price.
import { cartRuleOf } from './cart-pricing';
import { prisma } from './prisma';
import { lineKey, NO_ROUND } from './tier-rates';

export type PriceLine = { key: string; what: 'green' | 'cart'; round: string; roundLabel: string; day: 'wd' | 'we'; label: string; publicCents: number | null };

const WED = 3, SAT = 6;

export async function tierPriceList(courseId: string): Promise<{ lines: PriceLine[]; roundIds: string[]; perCart: boolean }> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { cartPricing: true } });
  // CART-2: a per-cart course charges every cart the time's cart price, members too — so there are no member cart lines.
  const perCart = cartRuleOf(course?.cartPricing) === 'per_cart';
  const [products, schedules] = await Promise.all([
    prisma.courseProduct.findMany({ where: { courseId, active: true }, select: { id: true, label: true, holes: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.teeTimeSchedule.findMany({ where: { courseId, active: true }, select: { productId: true, daysOfWeek: true, startTime: true, greenFeeWeekdayCents: true, greenFeeWeekendCents: true, cartFeeCents: true, cartFeeWeekendCents: true }, orderBy: { startTime: 'asc' } }),
  ]);
  const rounds = products.length ? products.map(p => ({ id: p.id, label: p.label || `${p.holes} holes` })) : [{ id: NO_ROUND, label: 'A round' }];
  const lines: PriceLine[] = [];
  for (const r of rounds) {
    const mine = schedules.filter(s => (s.productId ?? NO_ROUND) === r.id || (!products.length));
    const first = (dow: number) => mine.find(s => s.daysOfWeek.includes(dow)) ?? null;
    const wd = first(WED), we = first(SAT);
    lines.push(
      { key: lineKey('green', r.id, 'wd'), what: 'green', round: r.id, roundLabel: r.label, day: 'wd', label: `${r.label} · weekday`, publicCents: wd?.greenFeeWeekdayCents ?? null },
      { key: lineKey('green', r.id, 'we'), what: 'green', round: r.id, roundLabel: r.label, day: 'we', label: `${r.label} · weekend`, publicCents: we?.greenFeeWeekendCents ?? null },
    );
    if (!perCart) lines.push(
      { key: lineKey('cart', r.id, 'wd'), what: 'cart', round: r.id, roundLabel: r.label, day: 'wd', label: `Cart · ${r.label} · weekday`, publicCents: wd?.cartFeeCents ?? null },
      { key: lineKey('cart', r.id, 'we'), what: 'cart', round: r.id, roundLabel: r.label, day: 'we', label: `Cart · ${r.label} · weekend`, publicCents: we ? (we.cartFeeWeekendCents ?? we.cartFeeCents) : null },
    );
  }
  return { lines, roundIds: products.map(p => p.id), perCart };
}
