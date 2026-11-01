// Money audit follow-ups (Cam 2026-11-01: "security follow-ups"):
//  1. a "once per golfer" promo code: checked by email AND signed-in account, and again inside the
//     booking's own transaction, so a second email or two bookings at once don't get it twice;
//  2. the golfer record refuses an email or phone link from a login without sheet.golfer_contact;
//  3. the register's 90-day sale history shows and searches email and phone only with that permission;
//  4. a membership the course paused before it was ever linked still stops joining online.
// Needs a database. Run: npx tsx scripts/audit-security-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { claimTeeTime, TeeTimeClaimError } from '../src/lib/claim-tee-time';
import { applyPromo } from '../src/lib/promo-codes';
import { findSales } from '../src/lib/shop-sales';
import { joinTier } from '../src/lib/membership-join';

const TAG = 'auditsecuritydbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.promoCode.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopSaleLine.deleteMany({ where: { sale: { courseId: { in: ids } } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.golferAccount.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Sec GC', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const g = await prisma.golferAccount.create({ data: { email: `${TAG}+pat@t.local`, password: 'x', firstName: 'Pat', lastName: 'G' } });

  // 1. Promo, once per golfer
  const code = await prisma.promoCode.create({ data: { courseId: c.id, code: 'ONCE', kind: 'percent', value: 20, onePerGolfer: true } });
  const multi = await prisma.promoCode.create({ data: { courseId: c.id, code: 'MANY', kind: 'percent', value: 10 } });
  const tt = (time: string) => prisma.teeTime.create({ data: { courseId: c.id, date: '2030-06-01', time, playersAvailable: 4, greenFeeCents: 4000, cartFeeCents: 0 } });
  const book = async (time: string, email: string, account: string | null, codeId: string) => {
    const t = await tt(time);
    return claimTeeTime({ teeTimeId: t.id, courseId: c.id, golferName: 'P', golferEmail: email, golferAccountId: account, players: 1, greenFeeTotal: 4000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 4000, status: 'confirmed', paymentStatus: 'manual', promoCodeId: codeId }, { type: 'golfer', id: account })
      .then(() => 'ok', (e: unknown) => e instanceof TeeTimeClaimError ? e.code : String(e));
  };
  ok('1. first use books', await book('08:00', `${TAG}+pat@t.local`, g.id, code.id) === 'ok');
  ok('1. the same email again is refused inside the booking', await book('08:10', `${TAG}+PAT@t.local`, null, code.id) === 'PROMO_USED');
  ok('1. the same signed-in golfer under another email is refused', await book('08:20', `${TAG}+other@t.local`, g.id, code.id) === 'PROMO_USED');
  ok('1. someone else can use it', await book('08:30', `${TAG}+lee@t.local`, null, code.id) === 'ok');
  ok('1. a code without the rule can be used again', await book('08:40', `${TAG}+pat@t.local`, g.id, multi.id) === 'ok' && await book('08:50', `${TAG}+pat@t.local`, g.id, multi.id) === 'ok');
  const pre = await applyPromo(c.id, 'ONCE', { date: '2030-06-01', time: '09:00', rateApplied: false, golferEmail: `${TAG}+new@t.local`, golferAccountId: g.id });
  ok('1. the check before booking also knows the signed-in golfer', !pre.ok);
  const race = await Promise.all([book('09:10', `${TAG}+kim@t.local`, null, code.id), book('09:20', `${TAG}+kim@t.local`, null, code.id)]);
  ok('1. two bookings at once by one golfer: only one gets it', race.filter(r => r === 'ok').length === 1, race);
  const route = read('src/app/api/bookings/route.ts');
  ok('1. the booking route passes the signed-in account and says why', route.includes('golferAccountId: golferSession?.golferId ?? null });') && route.includes("if (err.code === 'PROMO_USED') return NextResponse.json({ error: PROMO_USED"));
  ok('1. the counter says why too', read('src/lib/counter-pay.ts').includes("if (err.code === 'PROMO_USED') return { ok: false, status: 409, error: PROMO_USED };"));

  // 2. Golfer record
  const rec = read('src/app/api/operator/golfers/[key]/route.ts');
  ok('2. an email or phone link needs sheet.golfer_contact; booking and account links don\'t', rec.includes("if (key && !key.startsWith('a:') && !can(session, 'sheet.golfer_contact')) return { res: NextResponse.json({ error: 'Open this golfer from one of their bookings.' }, { status: 403 }) };"));

  // 3. Register history
  await prisma.shopSale.create({ data: { courseId: c.id, totalCents: 1000, status: 'paid_cash', customerName: 'Robin', customerEmail: `${TAG}+robin@t.local`, customerPhone: '5551234567', soldBy: 'x', payToken: `${TAG}-tok` } });
  const byEmailNo = await findSales(c.id, { q: 'robin@t', contact: false });
  const byEmailYes = await findSales(c.id, { q: 'robin@t', contact: true });
  const byPhoneNo = await findSales(c.id, { q: '1234567', contact: false });
  const byName = await findSales(c.id, { q: 'Robin', contact: false });
  ok('3. without the permission, no search by email or phone', byEmailNo.ok && byEmailNo.value.length === 0 && byPhoneNo.ok && byPhoneNo.value.length === 0);
  ok('3. with it, found by email; by name, always', byEmailYes.ok && byEmailYes.value.length === 1 && byName.ok && byName.value.length === 1);
  ok('3. the history hides email and phone from a login without the permission', read('src/app/api/operator/shop-sales/route.ts').includes("r.value.map(s => ({ ...s, customerEmail: '', customerPhone: '' }))"));

  // 4. Paused before linked
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', annualFeeCents: 80000, joinOnline: 'instant' } });
  await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'Pat', inviteEmail: `${TAG}+PAT@t.local`, status: 'inactive' } });
  const j = await joinTier(c.id, { id: g.id, email: `${TAG}+pat@t.local`, name: 'Pat G', phone: '' }, tier.id);
  ok('4. a paused membership never linked to the golfer still stops joining online', !j.ok && j.status === 409, j);
  ok('4. …and no new membership was made', (await prisma.courseMembership.count({ where: { courseId: c.id } })) === 1);

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
  console.log('\nALL PASS');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
