// Resident booking window (GOLFER-LOGIN-1 2b, Build 2026-11-19). A golfer logged in to the course (gr_member) whose
// resident card is good on the date books as far ahead as Course.residentAdvanceDays (null = the public window), only
// with Resident pricing on. A member who is also a resident gets the longer window. Settings writes the value (1–365 or
// blank, settings.edit) and logs each change to CourseSettingChange.
// Pinned here:
//   - windowFor / generationHorizonDays / the benefits wording (pure)
//   - the session's windowDays, the member tee-times list and /api/bookings all enforce the same window
//   - a card that ends before the date, Resident pricing off, or a session in no group: the public window
//   - the Settings writer: validation, staff permission, one log row per real change
// Needs the app running (TEST_URL) and its database (a local Postgres). Run: npx tsx scripts/resident-window-db-test.ts
import { PrismaClient } from '@prisma/client';
import { windowFor, generationHorizonDays } from '../src/lib/booking-window';
import { memberBenefitParts } from '../src/lib/member-benefits';
import { benefitsSentence } from '../src/lib/member-home';
import { validateSettingsPatch } from '../src/lib/settings-validation';
import { signMemberSessionToken } from '../src/lib/member-session';
import { signToken, signStaffToken } from '../src/lib/auth';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TAG = 'reswin';
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
  await prisma.courseSettingChange.deleteMany({ where: { courseId } });
  await prisma.courseStaff.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: `@${TAG}.test` } }, { key: { in: ['booking:unknown', 'booking:127.0.0.1', 'booking:::1', 'booking:::ffff:127.0.0.1'] } }] } });
}

async function main() {
  await cleanup();

  // ── Pure ──
  const on = { publicAdvanceDays: 7, memberAdvanceDays: 14, residentAdvanceDays: 20, hasResidentPricing: true };
  check('a resident gets the resident window', JSON.stringify(windowFor(on, null, { resident: true })) === JSON.stringify({ days: 20, scope: 'member', ownWindow: true }), windowFor(on, null, { resident: true }));
  check('…not without a card good on the date', windowFor(on, null, { resident: false }).days === 7 && windowFor(on, null).scope === 'public');
  check('…nor with Resident pricing off', windowFor({ ...on, hasResidentPricing: false }, null, { resident: true }).days === 7);
  check('…nor with no resident window set (null = the public window)', JSON.stringify(windowFor({ ...on, residentAdvanceDays: null }, null, { resident: true })) === JSON.stringify({ days: 7, scope: 'public', ownWindow: false }));
  check('…a resident window shorter than the public one gives nothing past the public', JSON.stringify(windowFor({ ...on, residentAdvanceDays: 5 }, null, { resident: true })) === JSON.stringify({ days: 7, scope: 'public', ownWindow: false }));
  check('a member who is also a resident gets the longer: the resident\'s', windowFor(on, { tier: { advanceBookingDays: 10 } }, { resident: true }).days === 20);
  check('…or the member\'s', windowFor(on, { tier: { advanceBookingDays: 30 } }, { resident: true }).days === 30);
  check('…a membership on the public window plus a resident card: the resident window, past the public', JSON.stringify(windowFor(on, { tier: { windowPublic: true } }, { resident: true })) === JSON.stringify({ days: 20, scope: 'member', ownWindow: true }));
  check('(a member alone is unchanged)', JSON.stringify(windowFor(on, { tier: { advanceBookingDays: 10 } })) === JSON.stringify({ days: 10, scope: 'member', ownWindow: true }) && JSON.stringify(windowFor(on, { tier: { windowPublic: true } })) === JSON.stringify({ days: 7, scope: 'member', ownWindow: false }));
  check('tee times are made far enough ahead for the resident window', generationHorizonDays({ ...on, residentAdvanceDays: 40 }) === 41 && generationHorizonDays({ ...on, residentAdvanceDays: 40, hasResidentPricing: false }) === 15);
  check('the benefits line says the resident window', benefitsSentence(null, false, true, on, true) === 'The resident rate on your own round, and you can book 20 days out.');
  check('…not when there is none past the public', benefitsSentence(null, false, true, { ...on, residentAdvanceDays: null }, true) === 'The resident rate on your own round.');
  check('…a member who is a resident is told the longer window', memberBenefitParts({ discountPct: 10, greenFeeWeekdayCents: null, greenFeeWeekendCents: null, lineRates: null, advanceBookingDays: 10, windowPublic: false, guestPassesPerYear: 0 }, on, { resident: true }).join(' · ') === '10% off every round · book 20 days out');
  check('…and a public-window membership plus a card is told the resident window', memberBenefitParts({ discountPct: null, greenFeeWeekdayCents: null, greenFeeWeekendCents: null, lineRates: null, advanceBookingDays: null, windowPublic: true, guestPassesPerYear: 0 }, on, { resident: true }).join() === 'book 20 days out');
  const v = (x: unknown) => validateSettingsPatch({ residentAdvanceDays: x }, ['residentAdvanceDays']);
  check('Settings: 1–365 days, or blank for the public window', (v(20) as { data: Record<string, unknown> }).data?.residentAdvanceDays === 20 && (v('') as { data: Record<string, unknown> }).data?.residentAdvanceDays === null && (v(null) as { data: Record<string, unknown> }).data?.residentAdvanceDays === null);
  check('…0, 366, 1.5 and words are refused', [0, 366, 1.5, 'ten'].every(x => !v(x).ok));

  // ── Through the app ──
  const op = await prisma.courseOperator.create({ data: { name: 'Window Owner', email: `${TAG}@test.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Window GC', slug: `${TAG}-a`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NY', zipCode: '10001', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24, lateCancellationFeeCents: 0, noShowFeeCents: 0, hasMemberPricing: true, hasResidentPricing: true, publicAdvanceDays: 7, memberAdvanceDays: 14, residentAdvanceDays: 20 } });
  const today = todayIn('UTC');
  const tt = (days: number, time = '09:00') => prisma.teeTime.create({ data: { courseId: c.id, date: addDaysStr(today, days), time, holes: 18, greenFeeCents: 10000, cartFeeCents: 2000, residentRateCents: 3000, playersAvailable: 4, playersBooked: 0 } });
  const cookie = async (email: string) => `gr_member=${await signMemberSessionToken({ courseId: c.id, email })}`;
  const get = async (path: string, ck?: string) => { const r = await fetch(`${BASE_URL}${path}`, ck ? { headers: { cookie: ck } } : {}); return { status: r.status, body: await r.json().catch(() => null) }; };
  const book = async (teeTimeId: string, email: string, ck: string) => { const r = await fetch(`${BASE_URL}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: ck }, body: JSON.stringify({ teeTimeId, golferName: 'Res', golferEmail: email, golferPhone: '', players: 1, termsAccepted: true, cartSelected: false }) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const list = async (days: number, ck: string) => get(`/api/member/${c.slug}/tee-times?date=${addDaysStr(today, days)}`, ck);

  const resEmail = `res@${TAG}.test`;
  await prisma.courseResident.create({ data: { courseId: c.id, name: 'Res One', email: resEmail, expiresOn: '' } });
  const resCk = await cookie(resEmail);
  const s = await get(`/api/member/${c.slug}/session`, resCk);
  check('the session gives a resident the resident window', s.status === 200 && s.body?.windowDays === 20, s.body);
  check('…and the benefits line says it', s.body?.benefits === 'The resident rate on your own round, and you can book 20 days out.', s.body?.benefits);
  const t15 = await tt(15);
  const l15 = await list(15, resCk);
  check('the member tee-times list shows day 15 to a resident', l15.status === 200 && Array.isArray(l15.body) && l15.body.some((x: { id: string }) => x.id === t15.id), l15);
  check('…day 21 is past it', (await list(21, resCk)).status === 403);
  const b15 = await book(t15.id, resEmail, resCk);
  check('booking day 15 as a resident goes through (resident rate)', b15.status === 200 && !!b15.body?.bookingId, b15);
  const t21 = await tt(21);
  const b21 = await book(t21.id, resEmail, resCk);
  check('…day 21 is refused, outside the window', b21.status === 403 && b21.body?.code === 'outside_window' && b21.body?.windowDays === 20, b21);

  // Someone logged in but in no group: the public window.
  const nobodyCk = await cookie(`nobody@${TAG}.test`);
  const t10 = await tt(10);
  check('a session in no group can\'t book day 10 (public window 7)', (await book(t10.id, `nobody@${TAG}.test`, nobodyCk)).status === 403);

  // A card that ends before the date gives the public window for that date only.
  const shortEmail = `short@${TAG}.test`;
  await prisma.courseResident.create({ data: { courseId: c.id, name: 'Short', email: shortEmail, expiresOn: addDaysStr(today, 9) } });
  const shortCk = await cookie(shortEmail);
  check('a card good today but ending before the date: not listed', (await list(10, shortCk)).status === 403);
  check('…and not booked', (await book(t10.id, shortEmail, shortCk)).status === 403);
  const t9 = await tt(9);
  check('…a date the card still covers is', (await book(t9.id, shortEmail, shortCk)).status === 200);

  // A member who is also a resident: the longer.
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Nine', annualFeeCents: 10000, advanceBookingDays: 9 } });
  const bothEmail = `both@${TAG}.test`;
  await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, membershipType: 'Nine', status: 'active', inviteEmail: bothEmail, inviteName: 'Both', payToken: `${TAG}-both`, expiresAt: new Date(Date.now() + 200 * 86_400_000) } });
  await prisma.courseResident.create({ data: { courseId: c.id, name: 'Both', email: bothEmail, expiresOn: '' } });
  const bothCk = await cookie(bothEmail);
  check('a member (9 days) who is also a resident gets 20 in the session', (await get(`/api/member/${c.slug}/session`, bothCk)).body?.windowDays === 20);
  const t16 = await tt(16);
  check('…and books day 16', (await book(t16.id, bothEmail, bothCk)).status === 200);

  // Resident pricing off: the resident program is off, window included.
  await prisma.course.update({ where: { id: c.id }, data: { hasResidentPricing: false } });
  check('Resident pricing off: no resident window in the list', (await list(15, resCk)).status === 403);
  const t15b = await tt(15, '10:00');
  check('…nor at booking', (await book(t15b.id, resEmail, resCk)).status === 403);
  await prisma.course.update({ where: { id: c.id }, data: { hasResidentPricing: true, residentAdvanceDays: null } });
  check('No resident window set: the public window', (await list(15, resCk)).status === 403 && (await get(`/api/member/${c.slug}/session`, resCk)).body?.windowDays === 7);

  // A round with its own shorter public window (Twilight, 3 days). The resident window is judged against the course's
  // public window everywhere; the round's window then holds for anyone without a window of their own.
  await prisma.course.update({ where: { id: c.id }, data: { publicAdvanceDays: 14, residentAdvanceDays: 7 } });
  const twi = await prisma.courseProduct.create({ data: { courseId: c.id, label: 'Twilight', holes: 9, publicAdvanceDays: 3 } });
  const tw5 = await prisma.teeTime.create({ data: { courseId: c.id, productId: twi.id, date: addDaysStr(today, 5), time: '17:00', holes: 9, greenFeeCents: 5000, cartFeeCents: 0, residentRateCents: 2000, playersAvailable: 4, playersBooked: 0 } });
  const tw5list = await list(5, resCk);
  check('a resident window shorter than the course\'s public one: the round\'s own 3-day window holds in the list', tw5list.status === 200 && Array.isArray(tw5list.body) && !tw5list.body.some((x: { id: string }) => x.id === tw5.id), tw5list);
  const tw5book = await book(tw5.id, resEmail, resCk);
  check('…and at booking (a crafted request for day 5 is refused at 3 days)', tw5book.status === 403 && tw5book.body?.code === 'outside_window' && tw5book.body?.windowDays === 3, tw5book);
  await prisma.course.update({ where: { id: c.id }, data: { residentAdvanceDays: 20 } });
  const tw5list2 = await list(5, resCk);
  check('a resident window longer than the public one: the round is listed on day 5', tw5list2.status === 200 && Array.isArray(tw5list2.body) && tw5list2.body.some((x: { id: string }) => x.id === tw5.id), tw5list2);
  check('…and booked', (await book(tw5.id, resEmail, resCk)).status === 200);
  const tw6 = await prisma.teeTime.create({ data: { courseId: c.id, productId: twi.id, date: addDaysStr(today, 6), time: '17:00', holes: 9, greenFeeCents: 5000, cartFeeCents: 0, residentRateCents: 2000, playersAvailable: 4, playersBooked: 0 } });
  const guestTw = await fetch(`${BASE_URL}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teeTimeId: tw6.id, golferName: 'Guest', golferEmail: `guest@${TAG}.test`, golferPhone: '', players: 1, termsAccepted: true, cartSelected: false }) });
  const guestBody = await guestTw.json().catch(() => null);
  check('(a guest still gets the round\'s 3 days)', guestTw.status === 403 && guestBody?.windowDays === 3, { s: guestTw.status, guestBody });
  await prisma.course.update({ where: { id: c.id }, data: { publicAdvanceDays: 7, residentAdvanceDays: null } });

  // ── Settings ──
  const owner = `gr_operator=${await signToken({ operatorId: op.id, email: op.email })}`;
  const settings = async (body: Record<string, unknown>, ck = owner) => { const r = await fetch(`${BASE_URL}/api/operator/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: ck }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const logs = () => prisma.courseSettingChange.findMany({ where: { courseId: c.id, field: 'residentAdvanceDays' }, orderBy: { createdAt: 'asc' } });
  const s1 = await settings({ residentAdvanceDays: 21 });
  const row1 = await prisma.course.findUniqueOrThrow({ where: { id: c.id }, select: { residentAdvanceDays: true } });
  const l1 = await logs();
  check('the owner sets the resident window in Settings', s1.status === 200 && row1.residentAdvanceDays === 21, s1);
  check('…logged with who and the days before and after', l1.length === 1 && l1[0].actorType === 'operator' && l1[0].actorId === op.id && l1[0].actorName === 'Window Owner' && l1[0].before === '' && l1[0].after === '21', l1);
  await settings({ residentAdvanceDays: 21, publicAdvanceDays: 7 });
  check('…saving the same value again logs nothing', (await logs()).length === 1);
  check('…a bad value is refused and nothing changes', (await settings({ residentAdvanceDays: 0 })).status === 400 && (await prisma.course.findUniqueOrThrow({ where: { id: c.id } })).residentAdvanceDays === 21);
  const st = await prisma.courseStaff.create({ data: { courseId: c.id, email: `staff@${TAG}.test`, password: 'x', name: 'Desk Staff', permissions: ['settings.edit'], permissionsSetAt: new Date() } });
  const staffCk = `gr_operator=${await signStaffToken({ staffId: st.id, courseId: c.id, email: st.email })}`;
  const s2 = await settings({ residentAdvanceDays: '' }, staffCk);
  const l2 = await logs();
  check('staff with settings.edit can clear it (public window), logged as staff', s2.status === 200 && (await prisma.course.findUniqueOrThrow({ where: { id: c.id } })).residentAdvanceDays === null && l2.length === 2 && l2[1].actorType === 'staff' && l2[1].actorId === st.id && l2[1].actorName === 'Desk Staff' && l2[1].before === '21' && l2[1].after === '', { s2, l2 });
  await prisma.courseStaff.update({ where: { id: st.id }, data: { permissions: [] } });
  check('…staff without it can\'t', (await settings({ residentAdvanceDays: 30 }, staffCk)).status === 403 && (await logs()).length === 2);

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('resident-window-db: all passed');
}

main().catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
