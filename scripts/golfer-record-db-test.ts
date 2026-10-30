// The golfer record (Cam 2026-10-29): one course's view of one golfer, staff notes,
// and who may not book online — the owner's block, or the course's rule of N
// no-shows or late cancels in M months. Needs a database.
// Run: npx tsx scripts/golfer-record-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { golferKey, parseGolferKey } from '../src/lib/golfer-key';
import { golferRecord, onlineBookingBlock, isLateCancel, autoBlockReason } from '../src/lib/golfer-record';
import { WIPED_TABLES } from '../src/lib/data-reset';

const TAG = 'golferrecorddbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const EMAIL = `${TAG}@t.local`;

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.golferNote.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.golferBlock.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  // Keys.
  ok('a key is the email, lower-cased', golferKey({ golferEmail: ' Pat@X.com ' }) === 'e:pat@x.com');
  ok('…else the mobile\'s last 10 digits, never a placeholder address', golferKey({ golferEmail: 'x@noemail.greenreserve.app', golferPhone: '+1 (201) 555-0101' }) === 'p:2015550101');
  ok('…and no email, phone or account is no key', golferKey({ golferEmail: '', golferPhone: '55' }) === null);
  ok('a key from a link is checked', parseGolferKey('p:2015550101') === 'p:2015550101' && parseGolferKey('e:nope') === null && parseGolferKey('x:1') === null);

  // Pure rules.
  const tee = new Date('2031-05-13T12:00:00Z');
  ok('a cancel inside the booking\'s own window is late', isLateCancel({ status: 'cancelled', cancelledAt: new Date(tee.getTime() - 3_600_000), cancellationHoursAtBooking: 24 }, tee, false));
  ok('…one before it is not', !isLateCancel({ status: 'cancelled', cancelledAt: new Date(tee.getTime() - 48 * 3_600_000), cancellationHoursAtBooking: 24 }, tee, false));
  ok('…nor one the course called off', !isLateCancel({ status: 'cancelled', cancelledAt: new Date(tee.getTime() - 3_600_000), cancellationHoursAtBooking: 24 }, tee, true));
  ok('the course\'s rule is off when unset', autoBlockReason({ onlineBlockNoShows: null, onlineBlockLateCancels: null, onlineBlockMonths: 12 }, { noShows: 9, lateCancels: 9 }) === null);
  ok('…and says why when met', /2 no-shows in the last 12 months/.test(autoBlockReason({ onlineBlockNoShows: 2, onlineBlockLateCancels: null, onlineBlockMonths: 12 }, { noShows: 2, lateCancels: 0 }) ?? ''));

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@op.local`, password: 'x' } });
  const mk = (s: string) => prisma.course.create({ data: { name: `GC ${s}`, slug: `${TAG}-${s}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', phone: '201-555-0000' } });
  const c = await mk('a'), other = await mk('b');
  const slot = (courseId: string, date: string, time = '08:00') => prisma.teeTime.create({ data: { courseId, date, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4 } });
  const book = async (courseId: string, date: string, extra: Record<string, unknown> = {}) => prisma.booking.create({ data: { teeTimeId: (await slot(courseId, date)).id, courseId, golferName: 'Pat Golfer', golferEmail: EMAIL, players: 2,
    greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'confirmed', paymentStatus: 'card_on_file', cancellationHoursAtBooking: 24, ...extra } });
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  await book(c.id, day(-20), { status: 'completed', paymentStatus: 'paid', checkedInPlayers: 2 });
  await book(c.id, day(-10), { noShowAt: new Date(Date.now() - 10 * 86_400_000) });
  const late = await book(c.id, day(-5), { status: 'cancelled', cancelledAt: new Date(Date.now() - 5 * 86_400_000) }); // same day as the 08:00 tee time — inside 24h
  const rain = await book(c.id, day(-3), { status: 'cancelled', cancelledAt: new Date(Date.now() - 3 * 86_400_000) });
  await prisma.bookingEvent.create({ data: { bookingId: rain.id, courseId: c.id, type: 'booking_cancelled', actorType: 'staff', metadata: { courseCalledOff: true } } });
  await book(c.id, day(7));
  // Staff removing a booking made by mistake (waived) is not the golfer's late cancel.
  const oops = await book(c.id, day(-2), { status: 'cancelled', cancelledAt: new Date(Date.now() - 2 * 86_400_000) });
  await prisma.bookingEvent.create({ data: { bookingId: oops.id, courseId: c.id, type: 'booking_cancelled', actorType: 'staff', metadata: { waived: true } } });
  await book(other.id, day(-15), { status: 'completed', paymentStatus: 'paid' });

  const key = `e:${EMAIL}`;
  const rec = await golferRecord(c.id, key, { money: true, contact: true });
  ok('the record counts this course\'s rounds, no-shows, late cancels and what\'s coming', !!rec && rec.counts.rounds === 1 && rec.counts.noShows === 1 && rec.counts.upcoming === 1 && rec.counts.cancels === 3, rec?.counts);
  ok('…a cancel the course called off isn\'t a late cancel', rec?.counts.lateCancels === 1 && rec.bookings.find(b => b.id === rain.id)?.state === 'called_off' && rec.bookings.find(b => b.id === late.id)?.state === 'late_cancel' && rec.bookings.find(b => b.id === oops.id)?.state !== 'late_cancel', rec?.counts);
  ok('…only this course\'s history (Cam: "only their own history")', rec?.bookings.length === 6);
  ok('…spend is the course\'s share only', rec?.spend?.roundsCents === 10000, rec?.spend);
  const bare = await golferRecord(c.id, key, { money: false, contact: false });
  ok('no money or contact for a login without them', !!bare && !('spend' in bare) && !('email' in bare) && !('phone' in bare) && !bare.bookings.some(b => 'courseShareCents' in b));

  // Online booking blocks.
  ok('no block by default', (await onlineBookingBlock(c.id, { golferEmail: EMAIL })) === null);
  await prisma.course.update({ where: { id: c.id }, data: { onlineBlockNoShows: 1 } });
  const rule = await onlineBookingBlock(c.id, { golferEmail: EMAIL.toUpperCase() });
  ok('the course\'s rule stops them booking online and says to call', !!rule && /call GC a at 201-555-0000/.test(rule), rule);
  ok('…another course\'s rule is its own', (await onlineBookingBlock(other.id, { golferEmail: EMAIL })) === null);
  await prisma.course.update({ where: { id: c.id }, data: { onlineBlockNoShows: null, onlineBlockLateCancels: 2 } });
  ok('one late cancel doesn\'t meet a rule of two', (await onlineBookingBlock(c.id, { golferEmail: EMAIL })) === null);
  await prisma.course.update({ where: { id: c.id }, data: { onlineBlockLateCancels: null } });
  await prisma.golferBlock.create({ data: { courseId: c.id, golferKey: key, reason: 'Abusive to staff', blockedBy: 'owner@x' } });
  ok('the owner\'s block stops them', !!(await onlineBookingBlock(c.id, { golferEmail: EMAIL })));
  const blocked = await golferRecord(c.id, key, { money: false, contact: false });
  ok('…and the record shows it with the reason', blocked?.onlineBlock?.by === 'owner' && blocked.onlineBlock.reason === 'Abusive to staff');

  // A block on a phone-only record holds when they book online with an email and that phone.
  await prisma.golferBlock.create({ data: { courseId: c.id, golferKey: 'p:2015550199', reason: 'No-shows by phone', blockedBy: 'owner@x' } });
  ok('a phone-keyed block holds online when the phone is given', !!(await onlineBookingBlock(c.id, { golferEmail: 'new@t.local', golferPhone: '(201) 555-0199' })));
  ok('…not for someone else', (await onlineBookingBlock(c.id, { golferEmail: 'new@t.local', golferPhone: '201-555-0100' })) === null);
  // Notes reach the record and the tee sheet.
  await prisma.golferNote.create({ data: { courseId: c.id, golferKey: key, body: 'Prefers a cart', createdBy: 'desk@x' } });
  ok('notes are on the record', (await golferRecord(c.id, key, { money: false, contact: false }))?.notes[0]?.body === 'Prefers a cart');

  // Wiring.
  const bookings = readFileSync('src/app/api/bookings/route.ts', 'utf8');
  ok('online booking asks onlineBookingBlock and refuses with 403', /onlineBookingBlock\(/.test(bookings) && /onlineBlock[\s\S]{0,120}status: 403/.test(bookings));
  const route = readFileSync('src/app/api/operator/golfers/[key]/route.ts', 'utf8');
  ok('the record route is gated on the tee sheet', route.includes("requirePermission(session, 'sheet.view')"));
  ok('…blocking is the owner\'s only', route.includes("if (session.isStaff) return NextResponse.json({ error: 'Only the course owner can stop a golfer booking online.' }, { status: 403 })"));
  ok('…a staff note is deleted only by its writer or the owner', route.includes('session.isStaff && n.createdBy !== who'));
  ok('…the key (an email or phone) only with golfer contact', route.includes("...(contact ? { key: r.key } : {})"));
  ok('…links open it by booking, checked against this course', route.includes("where: { id: raw.slice(2), courseId: session.courseId }"));
  ok('the course\'s rule is owner-only in settings', /OWNER_ONLY_FIELDS[\s\S]{0,800}onlineBlockNoShows/.test(readFileSync('src/app/api/operator/settings/route.ts', 'utf8')));
  ok('the launch wipe clears notes and blocks', WIPED_TABLES.includes('GolferNote') && WIPED_TABLES.includes('GolferBlock'));
  const sheet = readFileSync('src/app/api/operator/tee-times/route.ts', 'utf8');
  ok('the tee sheet reads notes for this course only and never ships the account id', sheet.includes('where: { courseId: session.courseId, OR: [{ golferKey: { in: keys }') && sheet.includes('golferAccountId: _acct'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('golfer-record-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
