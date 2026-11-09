// MONEY-1 (Cam 2026-11-09, his handwritten Money notes): Action needed — no "Text pay link", Remove takes a declined
// card off the list (it still owes), Open shows it in place; the top of Money — Stripe's button, no reload, a cleaner
// chart, one-tap dates, "Collected", the charts as tabs, one card for what was sold and how it was paid; Payouts and
// Cancellations reorganized; GreenReserve's own fees not listed on the course's Money page.
// Needs a database. Run: npx tsx scripts/money-1-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { declinedCards } from '../src/lib/operator-home';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const TAG = 'money1dbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@t.local` } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'M1', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const tt = await prisma.teeTime.create({ data: { courseId: c.id, date: addDaysStr(todayIn('UTC'), -1), time: '09:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 8, playersBooked: 4, status: 'available' } });
  const mk = (name: string) => prisma.booking.create({ data: { teeTimeId: tt.id, courseId: c.id, golferName: name, golferEmail: `${name}@t.local`, players: 2, status: 'confirmed', paymentStatus: 'card_on_file', greenFeeTotal: 10000, accessFeeTotal: 0, totalAmount: 10000, checkInFailReason: 'Your card was declined.' } as never });
  const a = await mk('ann'), b = await mk('bob');
  const before = await declinedCards(c.id, true);
  ok('both declined cards are on the list, with the group and why', before.total === 2 && before.rows.every(r => r.players === 2 && r.reason === 'Your card was declined.'), before);
  await prisma.booking.update({ where: { id: a.id }, data: { declineDismissedAt: new Date() } });
  const after = await declinedCards(c.id, true);
  ok('Remove takes one off the list', after.total === 1 && after.rows[0].id === b.id, after);
  ok('…it still owes (nothing about the money changed)', (await prisma.booking.findUniqueOrThrow({ where: { id: a.id } })).paymentStatus === 'card_on_file');

  // Wiring
  const route = read('src/app/api/operator/declined/route.ts');
  ok('Remove: the pay-link permission, this course only, only a card still declined', route.includes("requirePermission(session, 'sheet.checkin')") && route.includes("where: { id, courseId: session.courseId, checkInFailReason: { not: '' }, declineDismissedAt: null }"));
  ok('a new decline at check-in puts it back on the list', read('src/lib/checkin-booking.ts').includes('data: { checkInFailReason: message, declineDismissedAt: null,'));
  const list = read('src/components/dashboard/DeclinedCardList.tsx');
  ok('no Text pay link; Email pay link, Open in place, Remove', !list.includes("via: 'sms'") && list.includes("via: 'email'") && list.includes("aria-expanded={isOpen}") && list.includes('/api/operator/declined'));
  const page = read('src/app/dashboard/money/page.tsx'), sales = read('src/components/dashboard/money/SalesPanel.tsx');
  ok('Stripe\'s own button; no reload', page.includes('<StripeButton') && !page.includes('aria-label="Refresh"'));
  ok('the dates\' total is labelled "Collected"; charts are tabs', sales.includes('>Collected</span>') && sales.includes("['dow', 'Day of week']") && sales.includes("['hour', 'Time of day']"));
  ok('one card: what was sold and how it was paid; the drawer is one line', sales.includes('What was sold') && sales.includes('How it was paid') && sales.includes('Last close-out'));
  ok('GreenReserve\'s own fees are not listed on the course\'s Money page', !sales.includes('GreenReserve booking fees') && !read('src/components/dashboard/money/PayoutsPanel.tsx').includes('passed to GreenReserve'));
  ok('one-tap dates: 7 days · 30 days · This month, the rest behind Dates', read('src/components/dashboard/DateRangeButton.tsx').includes("const QUICK = ['7d', '30d', 'month'];"));
  ok('Payments uses the same date picker', read('src/components/dashboard/money/PaymentsPanel.tsx').includes('<DateRangeButton value={shownRange}'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('money-1-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
