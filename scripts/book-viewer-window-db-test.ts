// The Book page opens a tee time inside the logged-in golfer's own window (lib/public-tee-times, viewer option).
// /book resolved its tee time through the PUBLIC window only, so a member's or resident's extra days answered
// "no longer available" while /api/bookings would have taken the booking. Pinned here:
//   - a member (14 days) gets a day-10 time on /book and from the tee-times API with ?viewer=1 (public window 7)
//   - a guest doesn't, and the plain public list (no ?viewer) is unchanged for a member too
//   - a resident gets a day-15 time inside the resident window (20), not day 21
//   - a round's own shorter public window doesn't hold for a member (Memberships item 3), but does for a guest
//   - the rows stay public-shaped (public green_fee and cart_fee), so the Book page's price box is unchanged
//   - a crafted request outside the viewer's window is still refused by /api/bookings
// Needs the app running (TEST_URL) and its database (a local Postgres). Run: npx tsx scripts/book-viewer-window-db-test.ts
import { PrismaClient } from '@prisma/client';
import { signMemberSessionToken } from '../src/lib/member-session';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TAG = 'bookwin';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function cleanup() {
  const courseId = { in: (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id) };
  await prisma.bookingEvent.deleteMany({ where: { courseId } });
  await prisma.moneyMove.deleteMany({ where: { courseId } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.courseMembership.deleteMany({ where: { courseId } });
  await prisma.courseResident.deleteMany({ where: { courseId } });
  await prisma.membershipTier.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.courseProduct.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: `@${TAG}.test` } }, { key: { in: ['booking:unknown', 'booking:127.0.0.1', 'booking:::1', 'booking:::ffff:127.0.0.1'] } }] } });
}

const GONE = 'This tee time is no longer available';

async function main() {
  await cleanup();

  const op = await prisma.courseOperator.create({ data: { name: 'Book Window Owner', email: `${TAG}@test.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Book Window GC', slug: `${TAG}-a`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NY', zipCode: '10001', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24, lateCancellationFeeCents: 0, noShowFeeCents: 0, hasMemberPricing: true, hasResidentPricing: true, publicAdvanceDays: 7, memberAdvanceDays: 14, residentAdvanceDays: 20 } });
  const today = todayIn('UTC');
  const tt = (days: number, time = '09:00', productId?: string) => prisma.teeTime.create({ data: { courseId: c.id, productId, date: addDaysStr(today, days), time, holes: 18, greenFeeCents: 10000, cartFeeCents: 2000, residentRateCents: 3000, playersAvailable: 4, playersBooked: 0 } });
  const cookie = async (email: string) => `gr_member=${await signMemberSessionToken({ courseId: c.id, email })}`;
  const list = async (days: number, ck?: string, viewer = true) => {
    const r = await fetch(`${BASE_URL}/api/courses/${c.slug}/tee-times?date=${addDaysStr(today, days)}${viewer ? '&viewer=1' : ''}`, ck ? { headers: { cookie: ck } } : {});
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const listed = (r: { status: number; body: unknown }, id: string) => r.status === 200 && Array.isArray(r.body) && r.body.some((x: { id: string }) => x.id === id);
  // The server render of /book: the tee time rides in the first HTML, or the page says it's gone.
  const page = async (t: { id: string; date: string }, ck?: string) => {
    const r = await fetch(`${BASE_URL}/book?course_slug=${c.slug}&tee_time_id=${t.id}&date=${t.date}`, ck ? { headers: { cookie: ck } } : {});
    const html = await r.text();
    return { status: r.status, gone: html.includes(GONE), hasId: html.includes(t.id) };
  };
  const book = async (teeTimeId: string, email: string, ck?: string) => {
    const r = await fetch(`${BASE_URL}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(ck ? { cookie: ck } : {}) }, body: JSON.stringify({ teeTimeId, golferName: 'Win', golferEmail: email, golferPhone: '', players: 1, termsAccepted: true, cartSelected: false }) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  // A member on a 14-day membership; the public window is 7.
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Fourteen', annualFeeCents: 10000, advanceBookingDays: 14 } });
  const memEmail = `mem@${TAG}.test`;
  await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, membershipType: 'Fourteen', status: 'active', inviteEmail: memEmail, inviteName: 'Mem', payToken: `${TAG}-mem`, expiresAt: new Date(Date.now() + 200 * 86_400_000) } });
  const memCk = await cookie(memEmail);

  const t10 = await tt(10);
  const m10 = await list(10, memCk);
  check('a member gets the day-10 time from the tee-times API with ?viewer=1 (public window 7)', listed(m10, t10.id), m10);
  const row = Array.isArray(m10.body) ? m10.body.find((x: { id: string }) => x.id === t10.id) : null;
  check('…public-shaped: the public green and cart fee, cart_required, min and max players', !!row && row.green_fee === 100 && row.cart_fee === 20 && row.cart_required === false && row.min_players >= 1 && row.max_players >= 1 && !('member_green_fee' in row), row);
  const p10 = await page(t10, memCk);
  check('…and /book renders it for the member', p10.status === 200 && !p10.gone && p10.hasId, p10);
  check('a guest doesn\'t get day 10 from the API (403 outside the window)', (await list(10)).status === 403);
  const g10 = await page(t10);
  check('…and /book tells the guest it is no longer available', g10.status === 200 && g10.gone, g10);
  check('the plain public list (no ?viewer) still holds a member to the public window', (await list(10, memCk, false)).status === 403);
  check('a member is still held to their own window: day 15 is refused', (await list(15, memCk)).status === 403);
  const t15m = await tt(15, '08:00');
  check('…and /book says day 15 is gone for the member', (await page(t15m, memCk)).gone);

  // A logged-in golfer whose membership lapsed long ago: the public window.
  const lapsedEmail = `lapsed@${TAG}.test`;
  await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, membershipType: 'Fourteen', status: 'active', inviteEmail: lapsedEmail, inviteName: 'Lapsed', payToken: `${TAG}-lapsed`, expiresAt: new Date(Date.now() - 400 * 86_400_000) } });
  check('a lapsed member gets the public window on /book', (await page(t10, await cookie(lapsedEmail))).gone);

  // Another course's log-in doesn't carry over.
  const otherCk = `gr_member=${await signMemberSessionToken({ courseId: 'some-other-course', email: memEmail })}`;
  check('a log-in at another course gets the public window', (await list(10, otherCk)).status === 403);

  // A resident: the resident window is 20.
  const resEmail = `res@${TAG}.test`;
  await prisma.courseResident.create({ data: { courseId: c.id, name: 'Res', email: resEmail, expiresOn: '' } });
  const resCk = await cookie(resEmail);
  const t15 = await tt(15);
  check('a resident gets the day-15 time inside the resident window (API)', listed(await list(15, resCk), t15.id));
  const p15 = await page(t15, resCk);
  check('…and on /book', p15.status === 200 && !p15.gone && p15.hasId, p15);
  const t21 = await tt(21);
  check('…day 21 is past it on /book', (await page(t21, resCk)).gone);

  // A round with its own shorter public window (Twilight, 3 days): a member's own window passes it (Memberships item 3).
  const twi = await prisma.courseProduct.create({ data: { courseId: c.id, label: 'Twilight', holes: 18, publicAdvanceDays: 3 } });
  const tw5 = await tt(5, '17:00', twi.id);
  check('a round\'s shorter public window doesn\'t hold for a member', listed(await list(5, memCk), tw5.id));
  check('…it holds for a guest', !listed(await list(5), tw5.id) && (await page(tw5)).gone);

  // A crafted booking outside the viewer's window is still refused at creation.
  const b15 = await book(t15m.id, memEmail, memCk);
  check('/api/bookings still refuses a member\'s crafted day-15 booking (14-day window)', b15.status === 403 && b15.body?.code === 'outside_window' && b15.body?.windowDays === 14, b15);
  const b21 = await book(t21.id, resEmail, resCk);
  check('…and a resident\'s day 21 (20-day window)', b21.status === 403 && b21.body?.code === 'outside_window' && b21.body?.windowDays === 20, b21);
  const bg = await book(t10.id, `guest@${TAG}.test`);
  check('…and a guest\'s day 10 (public 7)', bg.status === 403 && bg.body?.code === 'outside_window', bg);
  // The time /book now opens is the one booking takes.
  const bm = await book(t10.id, memEmail, memCk);
  check('the member\'s day-10 booking goes through', bm.status === 200 && !!bm.body?.bookingId, bm);

  // A membership window SHORTER than the public one (public 14, tier 7): the member still gets what the public gets,
  // as /api/bookings allows it — logging in on /book must never take a time away.
  await prisma.course.update({ where: { id: c.id }, data: { publicAdvanceDays: 14, residentAdvanceDays: null } });
  const shortTier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Seven', annualFeeCents: 10000, advanceBookingDays: 7 } });
  const shortEmail = `short@${TAG}.test`;
  await prisma.courseMembership.create({ data: { courseId: c.id, tierId: shortTier.id, membershipType: 'Seven', status: 'active', inviteEmail: shortEmail, inviteName: 'Short', payToken: `${TAG}-short`, expiresAt: new Date(Date.now() + 200 * 86_400_000) } });
  const shortCk = await cookie(shortEmail);
  const s10 = await tt(10, '11:00');
  const sl10 = await list(10, shortCk);
  check('a 7-day member on a 14-day public course gets day 10 with ?viewer=1', listed(sl10, s10.id), sl10);
  const ps10 = await page(s10, shortCk);
  check('…and /book renders it', ps10.status === 200 && !ps10.gone, ps10);
  const tw10 = await tt(10, '17:30', twi.id);
  check('…a round with a 5-day public window on day 10 is not listed for them (bookings: max(7, 5) = 7)', !listed(await list(10, shortCk), tw10.id));
  await prisma.courseProduct.update({ where: { id: twi.id }, data: { publicAdvanceDays: 5 } });
  check('…(still not with the round at 5 days)', !listed(await list(10, shortCk), tw10.id));
  const bs10 = await book(s10.id, shortEmail, shortCk);
  check('…and the day-10 booking goes through', bs10.status === 200 && !!bs10.body?.bookingId, bs10);
  const btw = await book(tw10.id, shortEmail, shortCk);
  check('…the round\'s day 10 is refused at booking too', btw.status === 403 && btw.body?.code === 'outside_window', btw);

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('book-viewer-window-db: all passed');
}

main().catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
