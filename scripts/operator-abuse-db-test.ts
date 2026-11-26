// Audit 2026-11-24 M11, L3, L9 (L6 is held for Cam: it reverses his 2026-10-29 void rule).
//  M11: pay links and receipts could be sent without limit (and a receipt to any number typed), each one
//       costing Twilio money and sender reputation. Now capped per booking, per destination and per course.
//  L3: any staff login could mint the 30-day preview token. Owner only now.
//  L9: the old uncapped staff Add (POST /api/operator/staff) is gone.
// Real database. Run: npx tsx scripts/operator-abuse-db-test.ts
import { readFileSync } from 'fs';
import { NextRequest } from 'next/server';

let jar: Record<string, string> = {};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextHeaders = require('next/headers');
nextHeaders.cookies = async () => ({ get: (n: string) => (jar[n] ? { name: n, value: jar[n] } : undefined), getAll: () => [], has: (n: string) => n in jar, set: () => {} });
nextHeaders.headers = async () => new Headers({ 'user-agent': 'test-browser' });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextServer = require('next/server');
nextServer.after = (task: unknown) => { void Promise.resolve(typeof task === 'function' ? (task as () => unknown)() : task).catch(() => {}); };

import { prisma } from '../src/lib/prisma';
import { rateLimit } from '../src/lib/rate-limit';
import { signStaffToken, signToken } from '../src/lib/auth';
import { SENDS_PER_BOOKING_HOUR, SENDS_PER_DESTINATION_HOUR, SENDS_PER_COURSE_HOUR, golferSendAllowed } from '../src/lib/send-caps';
import { PATCH as bookingsPatch } from '../src/app/api/operator/bookings/route';
import { GET as previewLink } from '../src/app/api/operator/preview-link/route';
import * as staffRoute from '../src/app/api/operator/staff/route';

const TAG = 'opabusetest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.rateLimit.deleteMany({ where: { OR: ids.flatMap(id => [{ key: { contains: id } }]).concat([{ key: { contains: TAG } }]) } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseStaff.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

const patch = async (h: (r: NextRequest) => Promise<Response | undefined>, url: string, body: unknown) =>
  (await h(new NextRequest(`http://localhost${url}`, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } })))!;

(async () => {
  process.env.RESEND_API_KEY = '';
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Abuse Owner', email: `${TAG}+op@t.local`, password: 'x', emailVerified: true } });
  const course = await prisma.course.create({ data: { name: 'Abuse GC', slug: `${TAG}-c`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const mkStaff = async (n: string, permissions: string[]) => {
    const s = await prisma.courseStaff.create({ data: { courseId: course.id, name: n, email: `${TAG}+${n}@t.local`, password: 'x', active: true, permissions, permissionsSetAt: new Date() } });
    return signStaffToken({ staffId: s.id, courseId: course.id, email: s.email, sv: 0 });
  };
  const desk = await mkStaff('desk', ['sheet.checkin']);
  const owner = await signToken({ operatorId: op.id, email: op.email, sv: 0 });

  // ── M11 ──
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-06-01', time: '08:00', playersAvailable: 4, greenFeeCents: 4000, cartFeeCents: 0 } });
  const booking = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: course.id, golferName: 'Pat', golferEmail: `${TAG}+golfer@t.local`, players: 1, greenFeeTotal: 4000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 4000, status: 'completed', paymentStatus: 'paid' } });
  jar = { gr_operator: desk };
  const statuses: number[] = [];
  for (let i = 0; i < SENDS_PER_BOOKING_HOUR + 2; i++) {
    const r = await patch(bookingsPatch, '/api/operator/bookings', { id: booking.id, action: 'send_receipt', via: 'email', to: `${TAG}+r${i}@t.local` });
    statuses.push(r.status);
  }
  // Without an email key the send itself fails (502) — the point is the 429 once the booking's sends are used up.
  ok(`M11 receipts by email: ${SENDS_PER_BOOKING_HOUR} for a booking in an hour, then refused`, statuses.slice(0, SENDS_PER_BOOKING_HOUR).every(s => s !== 429) && statuses.slice(SENDS_PER_BOOKING_HOUR).every(s => s === 429), statuses);
  const print = await patch(bookingsPatch, '/api/operator/bookings', { id: booking.id, action: 'send_receipt', via: 'print' });
  ok('M11 printing is never capped', print.status === 200);

  // Per destination: one number can't be texted from many bookings.
  const dest = '+15555550123';
  const results: boolean[] = [];
  for (let i = 0; i < SENDS_PER_DESTINATION_HOUR + 1; i++) results.push(await golferSendAllowed({ courseId: course.id, bookingId: `${TAG}-b${i}`, kind: 'receipt', via: 'sms', to: dest }));
  ok(`M11 one number gets at most ${SENDS_PER_DESTINATION_HOUR} texts an hour from a course, across bookings`, results.filter(Boolean).length === SENDS_PER_DESTINATION_HOUR && results[results.length - 1] === false, results);

  const smsCapped = await (async () => {
    await prisma.rateLimit.upsert({ where: { key: `send:sms:dest:${course.id}:+15555550199` }, create: { key: `send:sms:dest:${course.id}:+15555550199`, count: 100, windowStart: new Date() }, update: { count: 100, windowStart: new Date() } });
    const before = await prisma.smsConsent.count();
    const r = await patch(bookingsPatch, '/api/operator/bookings', { id: booking.id, action: 'send_receipt', via: 'sms', to: '+1 555 555 0199', smsConsent: 'verbal' });
    const afterCount = await prisma.smsConsent.count();
    return { status: r.status, consentUnchanged: before === afterCount };
  })();
  ok('M11 a capped text is refused before any consent is recorded or text sent', smsCapped.status === 429 && smsCapped.consentUnchanged, smsCapped);
  // The course cap: once the course has sent its share this hour, a fresh booking and address are refused too.
  const seed = (key: string, count: number) => prisma.rateLimit.upsert({ where: { key }, create: { key, count, windowStart: new Date() }, update: { count, windowStart: new Date() } });
  const fresh = await prisma.booking.create({ data: { teeTimeId: tt.id, courseId: course.id, golferName: 'Kim', golferEmail: `${TAG}+kim@t.local`, players: 1, greenFeeTotal: 4000, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 4000, status: 'completed', paymentStatus: 'paid' } });
  await seed(`send:course:${course.id}`, SENDS_PER_COURSE_HOUR);
  const courseCapped = await patch(bookingsPatch, '/api/operator/bookings', { id: fresh.id, action: 'send_receipt', via: 'email', to: `${TAG}+new@t.local` });
  ok(`M11 past ${SENDS_PER_COURSE_HOUR} sends in an hour the course is refused, on any booking`, courseCapped.status === 429, courseCapped.status);
  await prisma.rateLimit.deleteMany({ where: { key: `send:course:${course.id}` } });

  // A loop on one booking uses up that booking, never the course: a refused send counts nothing further.
  const before = (await prisma.rateLimit.findUnique({ where: { key: `send:course:${course.id}` } }))?.count ?? 0;
  for (let i = 0; i < 5; i++) await patch(bookingsPatch, '/api/operator/bookings', { id: booking.id, action: 'send_receipt', via: 'email', to: `${TAG}+loop${i}@t.local` });
  const afterLoop = (await prisma.rateLimit.findUnique({ where: { key: `send:course:${course.id}` } }))?.count ?? 0;
  ok('M11 refused sends on a used-up booking do not eat the course\'s sends', afterLoop === before, { before, afterLoop });

  // Pay link by text, on the round's day: a number with no consent gets the "ask them" answer before anything is counted.
  const today = new Date().toISOString().slice(0, 10);
  const tToday = await prisma.teeTime.create({ data: { courseId: course.id, date: today, time: '23:50', playersAvailable: 4, greenFeeCents: 4000, cartFeeCents: 0 } });
  const due = await prisma.booking.create({ data: { teeTimeId: tToday.id, courseId: course.id, golferName: 'Ray', golferEmail: `${TAG}+ray@t.local`, golferPhone: '+12025550273', players: 1, greenFeeTotal: 4000, cartFeeTotal: 0, accessFeeTotal: 150, totalAmount: 4150, status: 'confirmed', paymentStatus: 'no_payment_method' } });
  const ask = await patch(bookingsPatch, '/api/operator/bookings', { id: due.id, action: 'send_pay_link', via: 'sms' });
  const askBody = await ask.json() as { needsConsent?: boolean };
  const counted = await prisma.rateLimit.findUnique({ where: { key: `send:pay_link:sms:booking:${due.id}` } });
  ok('M11 a pay-link text to a number that hasn\'t agreed asks first, and counts nothing', ask.status === 409 && askBody.needsConsent === true && !counted, { s: ask.status, askBody, counted });
  await seed(`send:pay_link:sms:booking:${due.id}`, SENDS_PER_BOOKING_HOUR);
  const consentsBefore = await prisma.smsConsent.count();
  const capped = await patch(bookingsPatch, '/api/operator/bookings', { id: due.id, action: 'send_pay_link', via: 'sms', smsConsent: 'verbal' });
  ok('M11 a capped pay-link text is refused before the verbal consent is recorded', capped.status === 429 && (await prisma.smsConsent.count()) === consentsBefore, capped.status);

  // Receipt by text to a number that hasn't agreed (and no consent given now): asks first, counts nothing.
  const askReceipt = await patch(bookingsPatch, '/api/operator/bookings', { id: fresh.id, action: 'send_receipt', via: 'sms', to: '+1 202 555 0288' });
  const askReceiptBody = await askReceipt.json() as { needsConsent?: boolean };
  ok('M11 a receipt text to a number that hasn\'t agreed asks first, and counts nothing', askReceipt.status === 409 && askReceiptBody.needsConsent === true && !(await prisma.rateLimit.findUnique({ where: { key: `send:receipt:sms:booking:${fresh.id}` } })), askReceipt.status);

  // A broken counter must not uncap texts: send: keys fail closed (a NUL byte makes Postgres refuse the statement).
  ok('M11 a send cap whose counter fails says no; a sign-in limit still says yes', (await rateLimit('send:x\u0000', 5, 60)) === false && (await rateLimit('login:x\u0000', 5, 60)) === true);

  const route = read('src/app/api/operator/bookings/route.ts');
  ok('M11 all four sends (pay link and receipt, text and email) are capped', (route.match(/golferSendAllowed\(/g) ?? []).length === 4);

  // ── L3 ──
  jar = { gr_operator: desk };
  ok('L3 a staff login cannot mint the preview link', (await previewLink()).status === 403);
  jar = { gr_operator: owner };
  ok('L3 the owner can', (await previewLink()).status === 200);

  // ── L9 ──
  ok('L9 the old uncapped staff Add is gone', !('POST' in staffRoute));

  jar = {};
  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
