// Booking page look on the golfer routes (Build 2026-11-18, BOOKING-LOOK-1): manage, check-in, receipt, event pay,
// shop pay and shop receipt each send `booking_look` ({ look, accent }) next to brandColor, from bookingLookOf, and
// nothing else new. A course that never set a look sends accent null (the page uses brandColor).
// Run against a real database: npx tsx scripts/golfer-route-look-db-test.ts
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { todayIn } from '../src/lib/course-time';
import { publicShopReceipt } from '../src/lib/shop-receipt';
import { GET as manageGET } from '../src/app/api/manage/[bookingId]/route';
import { GET as checkinGET } from '../src/app/api/checkin/[bookingId]/route';
import { GET as eventPayGET } from '../src/app/api/event-payment/[id]/route';
import { GET as shopPayGET } from '../src/app/api/shop-sale/[id]/route';

const TAG = 'golflook';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
const req = (path: string) => new NextRequest(`http://localhost${path}`, { headers: { 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
const params = <K extends string>(k: K, v: string) => ({ params: Promise.resolve({ [k]: v } as Record<K, string>) });
const KEYS = ['accent', 'look'];

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.shopSaleLine.deleteMany({ where: { sale: { courseId: { in: ids } } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEventPayment.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@t.local` } });
}

(async () => {
  // The receipt route also accepts an admin session, which reads cookies, and next/headers only works inside a real
  // request. This test is the golfer's token path, so the request carries no cookies: an empty cookie jar.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nextHeaders = require('next/headers');
  nextHeaders.cookies = async () => ({ get: () => undefined, getAll: () => [], has: () => false });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const receiptGET = require('../src/app/api/receipt/[bookingId]/route').GET as typeof manageGET;
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string, look: { bookingLook?: string; bookingAccent?: string | null }) => prisma.course.create({ data: {
    name: `Look ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Main', city: 'X', state: 'NJ', zipCode: '07001', holes: 18,
    timezone: 'America/New_York', active: true, liveStatus: 'live', brandColor: '#7A1F5C', adminNotes: 'INTERNAL-NOTE', ...look,
  } });
  const set = await mk('set', { bookingLook: 'dark', bookingAccent: 'blue' });
  const unset = await mk('unset', {});
  const today = todayIn('America/New_York');

  for (const [c, want] of [[set, { look: 'dark', accent: 'blue' }], [unset, { look: 'light', accent: null }]] as const) {
    const label = c.id === set.id ? 'set look' : 'no look';
    const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: today, time: '23:50', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
    const b = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: 'Pat', golferEmail: `${TAG}+${c.id}@test.local`, players: 1, greenFeeTotal: 5000, accessFeeTotal: 150, totalAmount: 5150, checkInToken: `tok-${c.id}`, status: 'confirmed' } });
    const ev = await prisma.courseEvent.create({ data: { courseId: c.id, name: 'Outing', date: today, startTime: '08:00', holdFrom: '08:00', holdTo: '08:00' } });
    const pay = await prisma.courseEventPayment.create({ data: { eventId: ev.id, courseId: c.id, label: 'Deposit', amountCents: 10000, method: 'link', status: 'open', payToken: `ep-${c.id}` } });
    const sale = await prisma.shopSale.create({ data: { courseId: c.id, status: 'paid_card', totalCents: 1000, soldBy: 'staff', payToken: `sp-${c.id}`, receiptToken: `sr-${c.id}` } });

    const bodies: [string, Record<string, unknown> | null, number][] = [];
    const call = async (name: string, p: Promise<Response>) => { const r = await p; bodies.push([name, r.ok ? await r.json() : null, r.status]); };
    await call('manage', manageGET(req(`/api/manage/${b.id}?token=tok-${c.id}`), params('bookingId', b.id)));
    await call('check-in', checkinGET(req(`/api/checkin/${b.id}?token=tok-${c.id}`), params('bookingId', b.id)));
    await call('receipt', receiptGET(req(`/api/receipt/${b.id}?token=tok-${c.id}`), params('bookingId', b.id)));
    await call('event pay', eventPayGET(req(`/api/event-payment/${pay.id}?token=ep-${c.id}`), params('id', pay.id)));
    await call('shop pay', shopPayGET(req(`/api/shop-sale/${sale.id}?token=sp-${c.id}`), params('id', sale.id)));
    const shopReceipt = await publicShopReceipt(sale.id, `sr-${c.id}`);
    bodies.push(['shop receipt', shopReceipt as unknown as Record<string, unknown> | null, shopReceipt ? 200 : 404]);

    for (const [name, body, status] of bodies) {
      ok(`${name} (${label}): answers with the token`, !!body, status);
      if (!body) continue;
      ok(`${name} (${label}): booking_look is ${JSON.stringify(want)}`, JSON.stringify(body.booking_look) === JSON.stringify(want), body.booking_look);
      ok(`${name} (${label}): booking_look carries only look and accent`, !!body.booking_look && JSON.stringify(Object.keys(body.booking_look as object).sort()) === JSON.stringify(KEYS));
      ok(`${name} (${label}): brandColor still sent`, body.brandColor === '#7A1F5C');
      const wire = JSON.stringify(body);
      ok(`${name} (${label}): no raw columns or internal notes`, !wire.includes('bookingAccent') && !wire.includes('"bookingLook"') && !wire.includes('INTERNAL-NOTE') && !wire.includes('adminNotes'));
    }
    // The token still gates each route: a wrong one gets no look.
    ok(`manage (${label}): a wrong token is refused`, !(await manageGET(req(`/api/manage/${b.id}?token=nope`), params('bookingId', b.id))).ok);
    ok(`shop pay (${label}): a wrong token is refused`, !(await shopPayGET(req(`/api/shop-sale/${sale.id}?token=nope`), params('id', sale.id))).ok);
    ok(`shop receipt (${label}): a wrong token is refused`, (await publicShopReceipt(sale.id, 'nope')) === null);
  }

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
