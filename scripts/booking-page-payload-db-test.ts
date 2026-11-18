// Booking page payload (Golfer lane item 1, Build 2026-11-18): booking_look, has_live_promo,
// resident_advance_days and closed_dates on the public course payload, and the Settings save
// for the look (settings.edit, audited). Pure checks first, then a real database.
// Run: npx tsx scripts/booking-page-payload-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { readBookingLook, bookingLookOf, previewAccentHex, hasLivePromo, closedDatesIn, BOOKING_ACCENTS, BOOKING_LOOKS, BOOKING_ACCENT_COLOURS } from '../src/lib/booking-look';
import { saveBookingLook } from '../src/lib/booking-look-save';
import { loadPublicCourse } from '../src/lib/public-course';
import { normalizeDbCourse } from '../src/lib/normalize-course';
import { todayIn, addDaysStr } from '../src/lib/course-time';

const TAG = 'bookpayload';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };

// WCAG relative luminance and contrast.
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.courseSettingChange.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.promoCode.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.blackout.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseResident.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@t.local` } });
}

(async () => {
  // ── The look: allowlists ────────────────────────────────────────────────
  ok('four accents, no red', BOOKING_ACCENTS.join(',') === 'black,green,blue,yellow');
  ok('a valid look and accent are accepted', readBookingLook({ look: 'dark', accent: 'blue' }).ok);
  ok('red is refused', !readBookingLook({ look: 'light', accent: 'red' }).ok);
  ok('a hex colour is refused', !readBookingLook({ look: 'light', accent: '#FF0000' }).ok);
  ok('a missing look is refused', !readBookingLook({ accent: 'green' }).ok);
  ok('an unknown look is refused', !readBookingLook({ look: 'sepia', accent: 'green' }).ok);
  ok('a non-object body is refused', !readBookingLook(null).ok && !readBookingLook('x').ok);
  ok('a bad stored value reads as Light with no accent (golfer pages fall back to brand_color)', JSON.stringify(bookingLookOf({ bookingLook: 'neon', bookingAccent: 'red' })) === '{"look":"light","accent":null}');
  ok('an unset accent (null) reads as null, not a default', bookingLookOf({ bookingLook: 'dark', bookingAccent: null }).accent === null);
  ok('a stored pair reads as itself', JSON.stringify(bookingLookOf({ bookingLook: 'dark', bookingAccent: 'yellow' })) === '{"look":"dark","accent":"yellow"}');

  // Every preset's button text passes AA (4.5:1) on its accent, in both looks.
  for (const a of BOOKING_ACCENTS) for (const l of BOOKING_LOOKS) {
    const c = BOOKING_ACCENT_COLOURS[a][l];
    ok(`${a} on ${l}: button text on the accent is AA (${contrast(c.onAcc, c.acc).toFixed(2)}:1)`, contrast(c.onAcc, c.acc) >= 4.5);
    ok(`${a} on ${l}: hover text is AA (${contrast(c.onAcc, c.hover).toFixed(2)}:1)`, contrast(c.onAcc, c.hover) >= 4.5);
  }

  ok('a null accent is refused on save (null means only "not set yet")', !readBookingLook({ look: 'light', accent: null }).ok);
  // The Settings preview is a light page with white text on the accent: every preset, in either look, is AA there.
  for (const a of BOOKING_ACCENTS) for (const l of BOOKING_LOOKS) {
    const hex = previewAccentHex({ bookingLook: l, bookingAccent: a })!;
    ok(`preview ${a} with ${l} look: white on ${hex} is AA (${contrast('#FFFFFF', hex).toFixed(2)}:1)`, contrast('#FFFFFF', hex) >= 4.5);
  }
  ok('no look set: the preview keeps the brand colour', previewAccentHex({ bookingLook: 'dark', bookingAccent: null }) === null);

  // ── has_live_promo ──────────────────────────────────────────────────────
  const T = '2026-12-01', L = '2026-12-08';
  const code = (o: Partial<{ active: boolean; startsOn: string | null; endsOn: string | null; maxUses: number | null; usesCount: number }> = {}) => ({ active: true, startsOn: null, endsOn: null, maxUses: null, usesCount: 0, ...o });
  ok('no codes: false', !hasLivePromo([], T, L));
  ok('an open-ended active code: true', hasLivePromo([code()], T, L));
  ok('an inactive code: false', !hasLivePromo([code({ active: false })], T, L));
  ok('a used-up code: false', !hasLivePromo([code({ maxUses: 5, usesCount: 5 })], T, L));
  ok('a code with uses left: true', hasLivePromo([code({ maxUses: 5, usesCount: 4 })], T, L));
  ok('a code that ended yesterday: false', !hasLivePromo([code({ endsOn: '2026-11-30' })], T, L));
  ok('a code that ends today: true', hasLivePromo([code({ endsOn: T })], T, L));
  ok('a code starting tomorrow (usable on tomorrow’s tee times): true', hasLivePromo([code({ startsOn: '2026-12-02' })], T, L));
  ok('a code starting on the last bookable day: true', hasLivePromo([code({ startsOn: L })], T, L));
  ok('a code starting after the window: false', !hasLivePromo([code({ startsOn: '2026-12-09' })], T, L));

  // ── closed_dates ────────────────────────────────────────────────────────
  const rows = [
    { date: '2026-12-05', reason: ' Aeration ' }, { date: '2026-11-30', reason: 'past' }, { date: '2026-12-09', reason: 'after' },
    { date: '2026-12-01', reason: 'Frost' }, { date: '2026-12-05', reason: 'dup' }, { date: 'bad', reason: 'x' },
  ];
  ok('only days in the window, sorted, one per date, reasons trimmed', JSON.stringify(closedDatesIn(rows, T, L)) === JSON.stringify([{ date: '2026-12-01', reason: 'Frost' }, { date: '2026-12-05', reason: 'Aeration' }]));

  // ── The course list leaves the per-course fields out ────────────────────
  const listShape = normalizeDbCourse({ id: 'x', bookingLook: 'dark', bookingAccent: 'blue' });
  ok('the list payload has booking_look and resident_advance_days (null)', JSON.stringify(listShape.booking_look) === '{"look":"dark","accent":"blue"}' && listShape.resident_advance_days === null);
  ok('the list payload has no has_live_promo or closed_dates', !('has_live_promo' in listShape) && !('closed_dates' in listShape));

  // ── Static: gates ───────────────────────────────────────────────────────
  const route = readFileSync('src/app/api/operator/settings/booking-look/route.ts', 'utf8');
  ok('the save route requires settings.edit', route.includes("requirePermission(session, 'settings.edit')"));
  ok('the save route checks the agreement', route.includes('requireAgreementCurrent('));
  ok('the actor comes from the login’s own row', /courseStaff\.findUnique|courseOperator\.findUnique/.test(route));
  const settings = readFileSync('src/app/api/operator/settings/route.ts', 'utf8');
  ok('the generic settings PATCH cannot write the look (one writer)', !settings.includes("'bookingLook'") && !settings.includes("'bookingAccent'"));
  const pub = readFileSync('src/lib/public-course.ts', 'utf8');
  ok('the promo query selects no code, value or note', pub.includes('promoCode.findMany({ where: { courseId: c.id, active: true }, select: { active: true, startsOn: true, endsOn: true, maxUses: true, usesCount: true } })'));

  // ── Database ────────────────────────────────────────────────────────────
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Pat Owner', email: `${TAG}@t.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'Payload Links', slug: `${TAG}-a`, operatorId: op.id, address: '1 Main', city: 'X', state: 'NJ', zipCode: '07001', holes: 18, timezone: 'America/New_York', active: true, liveStatus: 'live', publicAdvanceDays: 7, memberAdvanceDays: 14 } });
  ok('a new course is Light with no accent (no default, nothing recoloured)', course.bookingLook === 'light' && course.bookingAccent === null);
  ok('the payload of a course that never saved a look has accent null', (await loadPublicCourse(`${TAG}-a`)).booking_look.accent === null);

  const actor = { type: 'operator' as const, id: op.id, name: 'Pat Owner' };
  const r1 = await saveBookingLook(course.id, { look: 'dark', accent: 'yellow' }, actor);
  const after = await prisma.course.findUnique({ where: { id: course.id }, select: { bookingLook: true, bookingAccent: true } });
  ok('the save writes both fields', r1?.changed === 2 && after?.bookingLook === 'dark' && after?.bookingAccent === 'yellow');
  const log = await prisma.courseSettingChange.findMany({ where: { courseId: course.id }, orderBy: { field: 'asc' } });
  ok('one audit row per changed field, with who, before and after', log.length === 2
    && log[0].field === 'bookingAccent' && log[0].before === '' && log[0].after === 'yellow'
    && log[1].field === 'bookingLook' && log[1].before === 'light' && log[1].after === 'dark'
    && log.every(l => l.actorType === 'operator' && l.actorId === op.id && l.actorName === 'Pat Owner'), log);
  const r2 = await saveBookingLook(course.id, { look: 'dark', accent: 'yellow' }, actor);
  ok('saving the same look writes nothing', r2?.changed === 0 && (await prisma.courseSettingChange.count({ where: { courseId: course.id } })) === 2);
  await saveBookingLook(course.id, { look: 'dark', accent: 'blue' }, actor);
  ok('changing only the colour writes one row', (await prisma.courseSettingChange.count({ where: { courseId: course.id } })) === 3);
  ok('an unknown course saves nothing', (await saveBookingLook('nope', { look: 'light', accent: 'green' }, actor)) === null);

  // Payload: nothing live, then a code and closed days.
  const today = todayIn('America/New_York');
  let p = await loadPublicCourse(`${TAG}-a`);
  ok('the payload carries the saved look', JSON.stringify(p.booking_look) === '{"look":"dark","accent":"blue"}');
  ok('no resident window set: resident_advance_days is null (the public window)', p.resident_advance_days === null);
  ok('Log in is on by default', p.member_login_on === true);
  ok('no memberships or resident cards: login_groups is empty', Array.isArray(p.login_groups) && p.login_groups.length === 0);
  ok('no codes: has_live_promo false; no closures: closed_dates empty', p.has_live_promo === false && Array.isArray(p.closed_dates) && p.closed_dates.length === 0);

  await prisma.promoCode.create({ data: { courseId: course.id, code: 'SECRETFALL', kind: 'percent', value: 20, note: 'internal: for the Smith outing', startsOn: addDaysStr(today, 2) } });
  await prisma.blackout.createMany({ data: [
    { courseId: course.id, date: addDaysStr(today, 3), reason: 'Aeration' },
    { courseId: course.id, date: addDaysStr(today, 12), reason: 'Member event' },
    { courseId: course.id, date: addDaysStr(today, 20), reason: 'Too far' },
    { courseId: course.id, date: addDaysStr(today, -1), reason: 'Yesterday' },
  ] });
  p = await loadPublicCourse(`${TAG}-a`);
  ok('a code starting in two days makes has_live_promo true', p.has_live_promo === true);
  ok('closed_dates covers today through the widest window (14 days), in order', JSON.stringify(p.closed_dates) === JSON.stringify([{ date: addDaysStr(today, 3), reason: 'Aeration' }, { date: addDaysStr(today, 12), reason: 'Member event' }]), p.closed_dates);
  const wire = JSON.stringify(p);
  ok('the payload never carries a code, its value or its note', !wire.includes('SECRETFALL') && !wire.includes('Smith outing') && !wire.includes('promoCodes'));
  ok('the payload never carries adminNotes or the Stripe account', !wire.includes('adminNotes') && !wire.includes('stripeAccountId'));

  await prisma.promoCode.updateMany({ where: { courseId: course.id }, data: { startsOn: addDaysStr(today, 30) } });
  p = await loadPublicCourse(`${TAG}-a`);
  ok('a code that starts after the widest window does not count', p.has_live_promo === false);

  // A membership that books further ahead than the course default widens both fields (reviewer repro).
  await prisma.membershipTier.create({ data: { courseId: course.id, name: 'Thirty-day', advanceBookingDays: 30 } });
  await prisma.promoCode.updateMany({ where: { courseId: course.id }, data: { startsOn: addDaysStr(today, 25) } });
  p = await loadPublicCourse(`${TAG}-a`);
  ok('a 30-day membership: the day closed at +20 is listed', p.closed_dates.some((d: { date: string }) => d.date === addDaysStr(today, 20)), p.closed_dates);
  ok('a 30-day membership: a code starting at +25 counts', p.has_live_promo === true);
  await prisma.membershipTier.updateMany({ where: { courseId: course.id }, data: { windowPublic: true } });
  p = await loadPublicCourse(`${TAG}-a`);
  ok('a membership on the public window does not widen it', !p.closed_dates.some((d: { date: string }) => d.date === addDaysStr(today, 20)) && p.has_live_promo === false);
  await prisma.promoCode.updateMany({ where: { courseId: course.id }, data: { startsOn: null, active: false } });
  p = await loadPublicCourse(`${TAG}-a`);
  ok('a switched-off code does not count', p.has_live_promo === false);

  // GOLFER-LOGIN-1 fields: groups, the Log in switch, and the resident window (which widens closed_dates too).
  ok('an active membership makes login_groups ["members"]', JSON.stringify(p.login_groups) === '["members"]', p.login_groups);
  await prisma.course.update({ where: { id: course.id }, data: { hasResidentPricing: true, residentAdvanceDays: 21 } });
  await prisma.courseResident.create({ data: { courseId: course.id, name: 'Res Ident', email: `res@${TAG}.local` } });
  await prisma.blackout.create({ data: { courseId: course.id, date: addDaysStr(today, 18), reason: 'Resident-window day' } });
  p = await loadPublicCourse(`${TAG}-a`);
  ok('resident cards add "residents"', JSON.stringify(p.login_groups) === '["members","residents"]', p.login_groups);
  ok('resident_advance_days carries the course value', p.resident_advance_days === 21);
  ok('a 21-day resident window lists the day closed at +18', p.closed_dates.some((d: { date: string }) => d.date === addDaysStr(today, 18)), p.closed_dates);
  ok('the payload never carries a resident’s name or email', !JSON.stringify(p).includes('Res Ident') && !JSON.stringify(p).includes(`res@${TAG}`));
  await prisma.course.update({ where: { id: course.id }, data: { hasResidentPricing: false } });
  p = await loadPublicCourse(`${TAG}-a`);
  ok('resident pricing off: no "residents" group and the resident window does not widen closed_dates', JSON.stringify(p.login_groups) === '["members"]' && !p.closed_dates.some((d: { date: string }) => d.date === addDaysStr(today, 18)));
  ok('resident pricing off: resident_advance_days is null even with the column set', p.resident_advance_days === null);
  await prisma.course.update({ where: { id: course.id }, data: { memberLoginOn: false } });
  p = await loadPublicCourse(`${TAG}-a`);
  ok('Log in switched off: member_login_on false and no groups', p.member_login_on === false && p.login_groups.length === 0);
  ok('the list payload carries member_login_on from the row', normalizeDbCourse({ id: 'x', memberLoginOn: false }).member_login_on === false && normalizeDbCourse({ id: 'x' }).member_login_on === true);

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
