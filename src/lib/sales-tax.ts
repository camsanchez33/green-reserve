// W2-7 part B (Cam 2026-10-20: tax "based by state … the exact location of
// their course and we will follow those tax laws"): pro-shop sales tax through
// Stripe Tax, on the course's OWN Stripe account (it is the merchant of record
// and files its own returns). GreenReserve keeps no tax rates or rules —
// Stripe works out the rate from the course's address and each item's product
// tax code, and records each paid sale for the course's tax reports.
//
// Courses' accounts are Express, which can't open Stripe's tax settings, so
// setup runs here (Settings → Pro shop → Sales tax, owner only): the course's
// address as its head office, and a state sales-tax registration for each
// state it holds a permit in. Stripe charges $0 where there is no registration.
//
// Launch scope: walk-up pro-shop sales. Green fees, carts and the booking fee
// are not taxed here. Server only.
import Stripe from 'stripe';
import { stripe } from './stripe';
import { prisma } from './prisma';

import { TAX_CATEGORIES, isTaxCategory, US_STATES } from './tax-categories';
export { TAX_CATEGORIES, isTaxCategory, US_STATES };
export type { TaxCategory } from './tax-categories';

type CourseAddress = { address: string; city: string; state: string; zipCode: string };
const addressOf = (c: CourseAddress) => ({ line1: c.address, city: c.city, state: c.state, postal_code: c.zipCode, country: 'US' });

export type TaxStatus = {
  connected: boolean;          // the course has a Stripe account
  active: boolean;             // Stripe tax settings are complete
  missing: string[];           // what Stripe still needs, when not active
  states: string[];            // states with an active sales-tax registration
  on: boolean;                 // Course.shopTaxOn
};

/** The course's tax set-up as Stripe has it. */
export async function taxStatus(courseId: string): Promise<TaxStatus> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { stripeAccountId: true, shopTaxOn: true } });
  if (!course?.stripeAccountId) return { connected: false, active: false, missing: [], states: [], on: false };
  const opts = { stripeAccount: course.stripeAccountId };
  const [settings, regs] = await Promise.all([
    stripe.tax.settings.retrieve({}, opts),
    stripe.tax.registrations.list({ status: 'active', limit: 100 }, opts),
  ]);
  const states = regs.data.filter(r => r.country === 'US' && r.country_options.us?.type === 'state_sales_tax').map(r => r.country_options.us!.state).sort();
  return {
    connected: true,
    active: settings.status === 'active',
    missing: settings.status_details.pending?.missing_fields ?? [],
    states,
    on: course.shopTaxOn,
  };
}

/**
 * Set the course up for Stripe Tax: its address as the head office (with
 * general merchandise, tax added on top, as the defaults), and a state
 * sales-tax registration from today for each state given that it doesn't
 * already have. Turns shop tax on when Stripe reports the settings active.
 */
export async function setUpTax(courseId: string, states: string[]): Promise<{ ok: true; status: TaxStatus } | { ok: false; error: string }> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { stripeAccountId: true, stripeAccountActive: true, address: true, city: true, state: true, zipCode: true } });
  if (!course?.stripeAccountId) return { ok: false, error: 'Connect your Stripe account first (Money → Getting paid).' };
  if (!course.address || !course.city || !course.state || !course.zipCode) return { ok: false, error: 'Your course address is incomplete — message us to fix it, then try again.' };
  const want = [...new Set(states.map(s => String(s).toUpperCase()))].filter(s => (US_STATES as readonly string[]).includes(s));
  if (!want.length) return { ok: false, error: 'Pick the state your sales-tax permit is from.' };
  const opts = { stripeAccount: course.stripeAccountId };
  try {
    await stripe.tax.settings.update({ head_office: { address: addressOf(course) }, defaults: { tax_code: TAX_CATEGORIES.general.code, tax_behavior: 'exclusive' } }, opts);
    const have = (await taxStatus(courseId)).states;
    for (const s of want.filter(x => !have.includes(x))) {
      await stripe.tax.registrations.create({ country: 'US', country_options: { us: { state: s, type: 'state_sales_tax' } }, active_from: 'now' }, { ...opts, idempotencyKey: `tax-reg-${courseId}-${s}` });
    }
  } catch (err) {
    console.error(JSON.stringify({ ev: 'sales_tax.setup.fail', courseId, error: err instanceof Error ? err.message : String(err) }));
    return { ok: false, error: err instanceof Stripe.errors.StripeError && err.message ? `Stripe said: ${err.message}` : 'Stripe didn’t accept that — try again in a minute.' };
  }
  const status = await taxStatus(courseId);
  if (status.active && status.states.length) {
    await prisma.course.update({ where: { id: courseId }, data: { shopTaxOn: true } });
    status.on = true;
  }
  return { ok: true, status };
}

export async function setTaxOn(courseId: string, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (on) {
    const s = await taxStatus(courseId);
    if (!s.active || !s.states.length) return { ok: false, error: 'Finish setting up sales tax first.' };
  }
  await prisma.course.update({ where: { id: courseId }, data: { shopTaxOn: on } });
  return { ok: true };
}

export type TaxLine = { reference: string; amountCents: number; quantity: number; category: string };
export type TaxQuote = { taxCents: number; calculationId: string };

/**
 * Sales tax on a walk-up sale, sold at the course: the course's address is the
 * place of sale. Each line's amount is its whole line (price × quantity), tax
 * added on top. Returns { taxCents: 0, calculationId: '' } when the course has
 * shop tax off. Throws when Stripe can't be reached — the caller says so.
 */
export async function quoteShopTax(courseId: string, lines: TaxLine[]): Promise<TaxQuote> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { shopTaxOn: true, stripeAccountId: true, address: true, city: true, state: true, zipCode: true } });
  if (!course?.shopTaxOn || !course.stripeAccountId || !lines.length) return { taxCents: 0, calculationId: '' };
  const calc = await stripe.tax.calculations.create({
    currency: 'usd',
    customer_details: { address: addressOf(course), address_source: 'shipping' },
    line_items: lines.map(l => ({
      amount: l.amountCents, quantity: l.quantity, reference: l.reference.slice(0, 500),
      tax_code: (isTaxCategory(l.category) ? TAX_CATEGORIES[l.category] : TAX_CATEGORIES.general).code,
      tax_behavior: 'exclusive' as const,
    })),
  }, { stripeAccount: course.stripeAccountId });
  // A sale that collects tax must be recordable — never take tax with no calculation to record it against.
  if (!calc.id && calc.tax_amount_exclusive > 0) throw new Error('Stripe returned a tax calculation without an id');
  return { taxCents: calc.tax_amount_exclusive, calculationId: calc.id ?? '' };
}

/**
 * Record a paid walk-up sale's tax on the course's account, once. The sale id
 * is the transaction reference, which Stripe keeps unique, so a retry can't
 * record it twice. Safe to call again; the hourly cron calls it for any paid
 * sale still missing its record. Never throws.
 */
export async function recordShopSaleTax(saleId: string): Promise<void> {
  const sale = await prisma.shopSale.findUnique({ where: { id: saleId }, select: { status: true, taxCents: true, taxCalculationId: true, taxTransactionId: true, course: { select: { stripeAccountId: true } } } });
  if (!sale || !sale.taxCalculationId || sale.taxTransactionId || !sale.course.stripeAccountId) return;
  if (sale.status !== 'paid_cash' && sale.status !== 'paid_card') return;
  try {
    const tx = await stripe.tax.transactions.createFromCalculation(
      { calculation: sale.taxCalculationId, reference: `shop-sale-${saleId}`, metadata: { shopSaleId: saleId } },
      { stripeAccount: sale.course.stripeAccountId, idempotencyKey: `tax-tx-shop-sale-${saleId}` },
    );
    await prisma.shopSale.update({ where: { id: saleId }, data: { taxTransactionId: tx.id } });
  } catch (err) {
    console.error(JSON.stringify({ ev: 'sales_tax.record.fail', saleId, error: err instanceof Error ? err.message : String(err) }));
  }
}

/** Hourly: record tax for paid sales that don't have it yet (a failed or interrupted first try). */
export async function recordPendingShopTax(limit = 50): Promise<number> {
  const pending = await prisma.shopSale.findMany({
    where: { status: { in: ['paid_cash', 'paid_card'] }, taxCalculationId: { not: '' }, taxTransactionId: '' },
    select: { id: true }, take: limit, orderBy: { paidAt: 'asc' },
  });
  for (const s of pending) await recordShopSaleTax(s.id);
  return pending.length;
}

/**
 * A quote the counter already showed, reused for the sale so the customer pays
 * exactly what the screen said and Stripe isn't asked twice. Only when the
 * calculation is this course's, unexpired, and its lines are exactly these
 * lines (item, amount, quantity, tax code); otherwise null and the caller
 * quotes afresh.
 */
export async function reuseShopTaxQuote(courseId: string, calculationId: string, lines: TaxLine[]): Promise<TaxQuote | null> {
  if (!calculationId.startsWith('taxcalc_')) return null;
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { shopTaxOn: true, stripeAccountId: true } });
  if (!course?.shopTaxOn || !course.stripeAccountId) return null;
  const opts = { stripeAccount: course.stripeAccountId };
  try {
    const calc = await stripe.tax.calculations.retrieve(calculationId, {}, opts);
    // Leave a day's margin so a link sale paid later can still be recorded.
    if (!calc.expires_at || calc.expires_at * 1000 < Date.now() + 24 * 3600 * 1000) return null;
    const got = (await stripe.tax.calculations.listLineItems(calculationId, { limit: 100 }, opts)).data;
    if (got.length !== lines.length) return null;
    const key = (r: string, a: number, q: number, c: string) => `${r}|${a}|${q}|${c}`;
    const want = new Set(lines.map(l => key(l.reference.slice(0, 500), l.amountCents, l.quantity, (isTaxCategory(l.category) ? TAX_CATEGORIES[l.category] : TAX_CATEGORIES.general).code)));
    if (!got.every(g => want.has(key(g.reference ?? '', g.amount, g.quantity, g.tax_code)))) return null;
    return { taxCents: calc.tax_amount_exclusive, calculationId: calc.id ?? calculationId };
  } catch {
    return null;
  }
}
