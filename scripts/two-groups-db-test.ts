// TWO-GROUPS-PRICE (Cam 2026-11-24), end to end: a golfer logged in to the course who is a member AND a resident is
// shown and charged the LOWER own seat, the member rate on a tie, never both — by POST /api/bookings, the member
// tee-times list, the booking-page preview (/api/bookings/resident-rate) and their own swap (swap-time). Member-only
// and resident-only golfers keep their one rate.
// Needs the app running (TEST_URL) and its database (a local Postgres). Run: npx tsx scripts/two-groups-db-test.ts
import { PrismaClient } from '@prisma/client';
import { signMemberSessionToken } from '../src/lib/member-session';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TAG = 'twogrp';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.bookingEvent.deleteMany({ where: { courseId } });
  await prisma.teeTimeAlert.deleteMany({ where: { courseId } });
  await prisma.moneyMove.deleteMany({ where: { courseId } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.courseMembership.deleteMany({ where: { courseId } });
  await prisma.courseResident.deleteMany({ where: { courseId } });
  await prisma.membershipTier.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
  await prisma.sentMessage.deleteMany({ where: { to: { endsWith: `@${TAG}.test` } } });
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: `@${TAG}.test` } }, { key: { startsWith: 'manage:swap:' } }, { key: { in: ['booking:unknown', 'booking:127.0.0.1', 'booking:::1', 'booking:::ffff:127.0.0.1'] } }] } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Two Groups', email: `${TAG}@test.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Two Groups', slug: `${TAG}-c`, hasMemberPricing: true, hasResidentPricing: true, publicAdvanceDays: 10, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NY', zipCode: '10001', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24, lateCancellationFeeCents: 0, noShowFeeCents: 0 } });
  const date = addDaysStr(todayIn('UTC'), 2);
  // Public $100, cart $20. The member pays a flat $40 (guests public); the resident rate differs by time.
  const tt = (time: string, residentRateCents: number | null) => prisma.teeTime.create({ data: { courseId: c.id, date, time, holes: 18, greenFeeCents: 10000, cartFeeCents: 2000, residentRateCents, playersAvailable: 4, playersBooked: 0 } });
  const resCheaper = await tt('08:00', 3000);
  const memCheaper = await tt('09:00', 5000);
  const tie = await tt('10:00', 4000);
  const resCheaper2 = await tt('11:00', 3000);
  const noResRate = await tt('12:00', null);
  const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Gold', greenFeeWeekdayCents: 4000, greenFeeWeekendCents: 4000, advanceBookingDays: 10 } });

  const both = `both@${TAG}.test`, memOnly = `mem@${TAG}.test`, resOnly = `res@${TAG}.test`;
  for (const [email, n] of [[both, 1], [memOnly, 2]] as const) {
    await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, membershipType: 'Gold', status: 'active', inviteEmail: email, inviteName: 'M', payToken: `${TAG}-${n}` } });
  }
  for (const email of [both, resOnly]) await prisma.courseResident.create({ data: { courseId: c.id, name: 'R', email, cardNumber: 'R', expiresOn: '' } });

  const cookie = async (email: string) => `gr_member=${await signMemberSessionToken({ courseId: c.id, email })}`;
  const get = async (path: string, ck: string) => { const r = await fetch(`${BASE_URL}${path}`, { headers: { cookie: ck } }); return r.json().catch(() => null); };
  const row = async (ck: string, id: string) => ((await get(`/api/member/${c.slug}/tee-times?date=${date}`, ck)) as { id: string }[]).find(x => x.id === id) as Record<string, unknown> | undefined;
  const preview = async (ck: string, id: string) => (await get(`/api/bookings/resident-rate?teeTimeId=${id}`, ck)) as { residentGreenFee: number | null; member: { greenFee: number } | null };
  const book = async (ck: string, email: string, id: string) => {
    const r = await fetch(`${BASE_URL}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: ck }, body: JSON.stringify({ teeTimeId: id, golferName: 'Golfer Two', golferEmail: email, golferPhone: '', players: 2, termsAccepted: true, cartSelected: false }) });
    const body = await r.json().catch(() => null);
    const saved = body?.bookingId ? await prisma.booking.findUnique({ where: { id: body.bookingId }, select: { id: true, appliedRate: true, residentPlayers: true, residentRateCents: true, memberRateCents: true, greenFeeTotal: true, checkInToken: true } }) : null;
    return { status: r.status, body, saved };
  };
  const bothCk = await cookie(both);

  // ── Both groups ──
  let r = await row(bothCk, resCheaper.id);
  check('list: resident cheaper → the resident seat, no member price', r?.own_rate === 'resident' && r?.resident_green_fee === 30 && r?.has_member_rate === false && r?.own_green_fee === 30, r);
  r = await row(bothCk, memCheaper.id);
  check('list: member cheaper → the member seat, no resident seat', r?.own_rate === 'member' && r?.member_green_fee === 40 && r?.resident_green_fee === null && r?.has_member_rate === true, r);
  r = await row(bothCk, tie.id);
  check('list: a tie → the member rate', r?.own_rate === 'member' && r?.member_green_fee === 40 && r?.resident_green_fee === null, r);
  let p = await preview(bothCk, resCheaper.id);
  check('preview: resident cheaper → resident', p.residentGreenFee === 30 && p.member === null, p);
  p = await preview(bothCk, memCheaper.id);
  check('preview: member cheaper → member', p.member?.greenFee === 40 && p.residentGreenFee === null, p);
  p = await preview(bothCk, tie.id);
  check('preview: a tie → member', p.member?.greenFee === 40 && p.residentGreenFee === null, p);

  const bRes = await book(bothCk, both, resCheaper.id);
  check('booked: resident cheaper → one resident seat + one public, no member spot ($30 + $100)', bRes.saved?.appliedRate === 'resident' && bRes.saved.residentPlayers === 1 && bRes.saved.memberRateCents === null && bRes.saved.greenFeeTotal === 13000 && bRes.body?.memberRate === false, bRes);
  const bMem = await book(bothCk, both, memCheaper.id);
  check('booked: member cheaper → the member seat + one public, no resident seat ($40 + $100)', bMem.saved?.appliedRate === 'Gold' && bMem.saved.residentPlayers === 0 && bMem.saved.memberRateCents === 4000 && bMem.saved.greenFeeTotal === 14000, bMem);
  const bTie = await book(bothCk, both, tie.id);
  check('booked: a tie → the member rate, never both ($40 + $100)', bTie.saved?.appliedRate === 'Gold' && bTie.saved.residentPlayers === 0 && bTie.saved.greenFeeTotal === 14000, bTie);

  // Their own swap prices the seat by the groups held at the new time.
  if (bMem.saved) {
    const swap = async (to: string) => {
      const s = await fetch(`${BASE_URL}/api/manage/${bMem.saved!.id}/swap-time`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: bothCk }, body: JSON.stringify({ token: bMem.saved!.checkInToken, newTeeTimeId: to, termsAccepted: true }) });
      return { status: s.status, after: await prisma.booking.findUnique({ where: { id: bMem.saved!.id }, select: { teeTimeId: true, appliedRate: true, residentPlayers: true, memberRateCents: true, greenFeeTotal: true } }) };
    };
    let s = await swap(resCheaper2.id);
    check('swap: a member booking moved to a time where the resident rate is lower → resident ($30 + $100)', s.status === 200 && s.after?.teeTimeId === resCheaper2.id && s.after.appliedRate === 'resident' && s.after.residentPlayers === 1 && s.after.memberRateCents === null && s.after.greenFeeTotal === 13000, s);
    s = await swap(noResRate.id);
    check('swap: …then to a time with no resident rate → back to the member rate ($40 + $100)', s.status === 200 && s.after?.appliedRate === 'Gold' && s.after.residentPlayers === 0 && s.after.memberRateCents === 4000 && s.after.greenFeeTotal === 14000, s);
  }

  // ── One group each ──
  const memCk = await cookie(memOnly);
  r = await row(memCk, resCheaper.id);
  check('member only: the member seat even where a resident rate is lower', r?.own_rate === 'member' && r?.member_green_fee === 40 && r?.resident_green_fee === null, r);
  const resCk = await cookie(resOnly);
  r = await row(resCk, memCheaper.id);
  check('resident only: the resident seat', r?.own_rate === 'resident' && r?.resident_green_fee === 50, r);
  p = await preview(resCk, memCheaper.id);
  check('resident only: the preview shows the resident seat', p.residentGreenFee === 50 && p.member === null, p);
  const bResOnly = await book(resCk, resOnly, memCheaper.id);
  check('resident only: charged the resident seat ($50 + $100)', bResOnly.saved?.appliedRate === 'resident' && bResOnly.saved.residentPlayers === 1 && bResOnly.saved.greenFeeTotal === 15000, bResOnly);
  const bMemOnly = await book(memCk, memOnly, resCheaper2.id);
  check('member only: charged the member seat ($40 + $100)', bMemOnly.saved?.appliedRate === 'Gold' && bMemOnly.saved.residentPlayers === 0 && bMemOnly.saved.greenFeeTotal === 14000, bMemOnly);

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
