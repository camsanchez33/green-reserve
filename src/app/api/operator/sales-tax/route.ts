import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { resolveDashboardSession, STAFF_FORBIDDEN } from '@/lib/session';
import { taxStatus, setUpTax, setTaxOn } from '@/lib/sales-tax';
import { refreshOpenRoundShopTax } from '@/lib/round-shop-tax';

// W2-7 part B: the course's pro-shop sales tax (Stripe Tax on its own Stripe
// account). The owner's alone, like everything Stripe — staff never set it.

async function ownerGate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (session.isStaff) return { res: NextResponse.json({ error: STAFF_FORBIDDEN }, { status: 403 }) };
  return { session };
}

const stripeDown = (err: unknown) => {
  console.error(JSON.stringify({ ev: 'sales_tax.status.fail', error: err instanceof Error ? err.message : String(err) }));
  return NextResponse.json({ error: err instanceof Stripe.errors.StripeError ? 'Stripe couldn’t be reached — try again in a minute.' : 'Something went wrong reading your tax settings — try again.' }, { status: 502 });
};

export async function GET() {
  const g = await ownerGate();
  if ('res' in g) return g.res;
  try { return NextResponse.json(await taxStatus(g.session.courseId)); } catch (err) { return stripeDown(err); }
}

/** Set up: { states: ['NJ'] } — head office from the course address, a registration per state. */
export async function POST(req: NextRequest) {
  const g = await ownerGate();
  if ('res' in g) return g.res;
  const agreementBlock = await requireAgreementCurrent(g.session.courseId); if (agreementBlock) return agreementBlock;
  const body = await req.json().catch(() => ({})) as { states?: unknown };
  const states = Array.isArray(body.states) ? body.states.filter((s): s is string => typeof s === 'string').slice(0, 10) : [];
  try {
    const r = await setUpTax(g.session.courseId, states);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    await refreshOpenRoundShopTax(g.session.courseId); // W2-7 B2: open rounds' shop items now carry tax
    return NextResponse.json(r.status);
  } catch (err) { return stripeDown(err); }
}

/** Turn shop tax on or off: { on: boolean }. */
export async function PATCH(req: NextRequest) {
  const g = await ownerGate();
  if ('res' in g) return g.res;
  const agreementBlock = await requireAgreementCurrent(g.session.courseId); if (agreementBlock) return agreementBlock;
  const body = await req.json().catch(() => ({})) as { on?: unknown };
  if (typeof body.on !== 'boolean') return NextResponse.json({ error: 'Say on or off.' }, { status: 400 });
  try {
    const r = await setTaxOn(g.session.courseId, body.on);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    await refreshOpenRoundShopTax(g.session.courseId); // W2-7 B2: open rounds' shop items follow the switch
    return NextResponse.json(await taxStatus(g.session.courseId));
  } catch (err) { return stripeDown(err); }
}
