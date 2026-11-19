// Emails redo (Cam 2026-11-19): emailCourse() — the course footer and colour, and the booking's price — read
// from real rows. The pay-link price must be what the pay page charges (roundChargeCents), shop items included.
//   DATABASE_URL=… npx tsx scripts/emails-course-db-test.ts
import { prisma } from '../src/lib/prisma';
import { emailCourse } from '../src/lib/email';
import { roundChargeCents } from '../src/lib/booking-fees';
import { payLinkEmail } from '../src/lib/email-golfer';

let failed = 0;
const check = (name: string, ok: boolean, extra?: unknown) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) { failed++; if (extra !== undefined) console.log('   ', extra); } };
const TAG = `emailcourse-${Date.now()}`;

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: 'emailcourse-' } }, select: { id: true } })).map(c => c.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  await cleanup();
  const course = await prisma.course.create({ data: {
    name: 'Maple Run, “The Club”', slug: TAG, address: '412 Orchard Lane', city: 'Millbrook', state: 'NY', zipCode: '12545', holes: 18,
    phone: '(555) 010-1111', proShopPhone: '(555) 010-2000', brandColor: '#123456', bookingAccent: 'yellow', timezone: 'America/New_York',
  } as never });
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-05-01', time: '11:40', holes: 18, greenFeeCents: 5200, cartFeeCents: 0, playersAvailable: 4, playersBooked: 4, status: 'available' } });
  const b = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: course.id, golferName: 'Sam', golferEmail: `${TAG}@t.local`, players: 4,
    greenFeeTotal: 26400, cartFeeTotal: 0, accessFeeTotal: 600, totalAmount: 27000, shopTotalCents: 2000, shopFeeCents: 20, shopTaxCents: 160 } as never });

  const ctx = await emailCourse({ bookingId: b.id }, 'fallback');
  const full = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  check('the price is what the pay page charges: round + shop items + their fee + tax', ctx.booking?.totalCents === roundChargeCents(full) && ctx.booking?.totalCents === 29180, ctx.booking);
  check('…and the players come from the booking', ctx.booking?.players === 4);
  check('footer: the course’s name, one-line address and pro shop phone', ctx.course.name === 'Maple Run, “The Club”' && ctx.course.address === '412 Orchard Lane, Millbrook, NY 12545' && ctx.course.phone === '(555) 010-2000', ctx.course);
  check('colour: the booking-page accent preset (yellow, light) with its own text colour', ctx.course.accent === '#8A6200' && ctx.course.onAccent === '#FFFFFF', ctx.course);
  const e = payLinkEmail({ courseName: course.name, date: '2030-05-01', time: '11:40', bookingId: b.id, checkInToken: 'tok', players: ctx.booking?.players, totalCents: ctx.booking?.totalCents }, ctx.course);
  check('the pay-link email shows $291.80, not the round alone', e.html.includes('>$291.80<') && !e.html.includes('>$270.00<'));

  await prisma.booking.update({ where: { id: b.id }, data: { roundChargedCents: 25000 } as never });
  check('once charged, the stored charge wins', (await emailCourse({ bookingId: b.id }, 'x')).booking?.totalCents === 25000);

  await prisma.course.update({ where: { id: course.id }, data: { bookingAccent: null } as never });
  check('no accent saved yet: the course’s brand colour', (await emailCourse({ courseId: course.id }, 'x')).course.accent === '#123456');
  check('by slug too', (await emailCourse({ courseSlug: TAG }, 'x')).course.name === course.name);
  const miss = await emailCourse({ bookingId: 'no-such-booking', courseId: 'no-such-course' }, 'Fallback GC');
  check('nothing found: the name it was given, nothing else (never throws)', miss.course.name === 'Fallback GC' && !miss.course.address && miss.booking === null);

  await cleanup();
}
main().then(async () => { await prisma.$disconnect(); console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`); if (failed) process.exit(1); })
  .catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
