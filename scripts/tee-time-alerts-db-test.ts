// ALERTS-2 (Cam 2026-11-18, lanes/golfer.md item 7; Build rulings 2026-11-18):
//  1. text consent is split by scope: a booking-text yes never lets an alert text through, nor
//     the reverse; a STOP ends both; every existing booking-text sender still uses 'bookings';
//  2. a guest's alert starts pending and turns on only from the confirm (a POST), a live member's
//     turns on at once with the log-in email; the course switch off refuses new alerts;
//  3. a guest can't edit an alert that's already on (anyone can type any email);
//  4. matching sends at most once per date, and two openings at once never both send (the claim);
//  5. stop is idempotent; the sweep ends alerts past their last tee time;
//  6. endsAt = the last tee time on the last date; the confirm and stop links change nothing on GET.
// Needs a database. Run: npx tsx scripts/tee-time-alerts-db-test.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { prisma } from '../src/lib/prisma';
import { recordSmsConsent, hasSmsConsent, consentedPhones, optInByReply } from '../src/lib/sms-consent';
import { createAlert, alertRateKeys, confirmAlert, stopAlertByToken, notifyAlertsFor, sweepTeeTimeAlerts, alertMatches, partOf, endsAtFor, memberAlerts, stopMemberAlert } from '../src/lib/tee-time-alerts';
import { addDaysStr, todayIn } from '../src/lib/course-time';
import { WIPED_TABLES } from '../src/lib/data-reset';

const TAG = 'ttalertdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
// 212-555-03xx: outside the fictional 555-01xx block, never texted here (no Twilio creds in tests).
const P1 = '+12125550301', P2 = '+12125550302', P3 = '+12125550303', P4 = '+12125550304', P5 = '+12125550305', P6 = '+12125550306', P7 = '+12125550307';
const PHONES = [P1, P2, P3, P4, P5, P6, P7];

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.teeTimeAlert.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.smsConsent.deleteMany({ where: { phone: { in: PHONES } } });
}

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

async function main() {
  await cleanup();

  // ── 1. Consent scopes ──────────────────────────────────────────────────────
  await recordSmsConsent(P1, 'opt_in', { method: 'web_booking' });
  ok('a booking-text yes counts for booking texts', await hasSmsConsent(P1));
  ok('…but never for alert texts', !(await hasSmsConsent(P1, 'alerts')));
  await recordSmsConsent(P2, 'opt_in', { method: 'web_alert', scope: 'alerts' });
  ok('an alert-text yes counts for alert texts', await hasSmsConsent(P2, 'alerts'));
  ok('…but never for booking texts', !(await hasSmsConsent(P2)) && !(await consentedPhones([P2])).has(P2));
  ok('consentedPhones reads the scope asked', (await consentedPhones([P1, P2], 'alerts')).has(P2) && !(await consentedPhones([P1, P2], 'alerts')).has(P1));
  await recordSmsConsent(P3, 'opt_in', { method: 'web_booking' });
  await recordSmsConsent(P3, 'opt_in', { method: 'web_alert', scope: 'alerts' });
  await recordSmsConsent(P3, 'opt_out', { method: 'sms_reply' });
  ok('a STOP ends both kinds', !(await hasSmsConsent(P3)) && !(await hasSmsConsent(P3, 'alerts')));
  ok('…and is written as scope all', (await prisma.smsConsent.findFirst({ where: { phone: P3, action: 'opt_out' } }))?.scope === 'all');
  await recordSmsConsent(P3, 'opt_in', { method: 'sms_reply' });
  ok('START after a STOP brings back booking texts only', (await hasSmsConsent(P3)) && !(await hasSmsConsent(P3, 'alerts')));
  // A STOP recorded before ALERTS-2 has the default scope ('bookings'); it must still end alert texts.
  await prisma.smsConsent.create({ data: { phone: P4, action: 'opt_in', method: 'web_alert', wording: 'x', scope: 'alerts', createdAt: new Date(Date.now() - 60_000) } });
  await prisma.smsConsent.create({ data: { phone: P4, action: 'opt_out', method: 'carrier', wording: 'x' } });
  ok('an old carrier STOP (scope bookings) still ends alert texts', !(await hasSmsConsent(P4, 'alerts')));
  // A YES / START reply goes back into only the kinds the number agreed to (review 2026-11-18).
  await recordSmsConsent(P5, 'opt_in', { method: 'web_alert', scope: 'alerts' });
  const yes = await optInByReply(P5);
  ok('an alerts-only number replying YES gets no booking texts', yes.length === 0 && !(await hasSmsConsent(P5)) && !(await consentedPhones([P5])).has(P5), yes);
  await recordSmsConsent(P5, 'opt_out', { method: 'sms_reply' });
  const back = await optInByReply(P5);
  ok('…stored with the alert wording version', (await prisma.smsConsent.findFirst({ where: { phone: P5, scope: 'alerts', method: 'sms_reply' }, orderBy: { createdAt: 'desc' } }))?.wording === 'alerts-2026-11-18');
  ok('…STOP then START brings back alert texts only', JSON.stringify(back) === '["alerts"]' && (await hasSmsConsent(P5, 'alerts')) && !(await hasSmsConsent(P5)), back);
  ok('a number with no record replying START gets booking texts, as before', JSON.stringify(await optInByReply(P6)) === '["bookings"]' && (await hasSmsConsent(P6)) && !(await hasSmsConsent(P6, 'alerts')));
  ok('the reply webhook uses optInByReply and answers with the matching confirmation', /optInByReply\(from\)/.test(read('src/app/api/twilio/inbound/route.ts')) && /ALERT_SMS_CONFIRMATION/.test(read('src/app/api/twilio/inbound/route.ts')));
  ok('a repeat alert yes records nothing', !(await recordSmsConsent(P2, 'opt_in', { method: 'web_alert', scope: 'alerts' })));

  // Every text sender before ALERTS-2 keeps needing the booking-text yes: only the alert sender passes 'alerts'.
  const twilio = read('src/lib/twilio.ts');
  ok('sendSms defaults to the booking-text consent', /consentScope = 'bookings'/.test(twilio) && /hasSmsConsent\(to, consentScope\)/.test(twilio));
  const alertScoped = walk('src').filter(f => /consentScope:\s*(SMS_SCOPE|'alerts')/.test(read(f)));
  ok('only lib/tee-time-alerts.ts sends with the alert consent', alertScoped.length === 1 && alertScoped[0].endsWith('tee-time-alerts.ts'), alertScoped);
  const scopedOther = walk('src').filter(f => !f.endsWith('tee-time-alerts.ts') && /scope:\s*'alerts'/.test(read(f)) && /recordSmsConsent|optInAndConfirm/.test(read(f)));
  ok('no other path records an alert-text yes', scopedOther.length === 0, scopedOther);

  // ── 2. Creating ────────────────────────────────────────────────────────────
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const c = await prisma.course.create({ data: { name: 'Alert Links', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', active: true, liveStatus: 'live', publicAdvanceDays: 7 } });
  const d1 = addDaysStr(todayIn('UTC'), 2), d2 = addDaysStr(todayIn('UTC'), 3), far = addDaysStr(todayIn('UTC'), 20);
  const tt = (date: string, time: string, booked = 4) => prisma.teeTime.create({ data: { courseId: c.id, date, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: booked, status: booked >= 4 ? 'full' : 'available' } });
  const t1 = await tt(d1, '08:00'), t2 = await tt(d1, '12:30'); await tt(d1, '16:40'); await tt(d2, '09:00');

  const guest = await createAlert({ courseId: c.id, dates: [d1, d2], parts: ['morning'], players: 2, email: `${TAG}-g@t.local`, phone: P1, textConsent: true }, null);
  ok('a guest alert starts pending', guest.ok && guest.status === 'pending', guest);
  const gRow = guest.ok ? await prisma.teeTimeAlert.findUniqueOrThrow({ where: { id: guest.alert.id } }) : null;
  ok('…keeps the alert-text consent with its time and wording', !!gRow?.textConsentAt && !!gRow?.textConsentWording?.includes('separate from booking texts'));
  ok('…but no alert-text yes is recorded before the confirm', !(await hasSmsConsent(P1, 'alerts')));
  const lastTee = await endsAtFor(c.id, d2, 'UTC');
  ok('it ends after the last tee time on its last date', gRow?.endsAt?.toISOString() === `${d2}T09:00:00.000Z` && lastTee.toISOString() === `${d2}T09:00:00.000Z`, gRow?.endsAt);
  ok('a day with no times ends at midnight', (await endsAtFor(c.id, addDaysStr(d2, 1), 'UTC')).toISOString() === `${addDaysStr(d2, 2)}T00:00:00.000Z`);
  ok('a phone without the ticked box is refused', !(await createAlert({ courseId: c.id, dates: [d1], parts: [], players: 1, email: `${TAG}-x@t.local`, phone: P1 }, null)).ok);
  const outside = await createAlert({ courseId: c.id, dates: [far], parts: [], players: 1, email: `${TAG}-x@t.local` }, null);
  ok('a date past the booking window is refused', !outside.ok && outside.status === 400, outside);
  ok('a date in the past is refused', !(await createAlert({ courseId: c.id, dates: [addDaysStr(todayIn('UTC'), -1)], parts: [], players: 1, email: `${TAG}-x@t.local` }, null)).ok);
  ok('an unknown part of the day is refused', !(await createAlert({ courseId: c.id, dates: [d1], parts: ['night'], players: 1, email: `${TAG}-x@t.local` }, null)).ok);

  // Confirm (a POST; the GET page changes nothing).
  const confirmRoute = read('src/app/api/alerts/confirm/[token]/route.ts');
  const getPart = confirmRoute.slice(confirmRoute.indexOf('export async function GET'), confirmRoute.indexOf('export async function POST'));
  ok('the confirm link’s GET only shows a button', !/confirmAlert\(/.test(getPart) && /method="post"/.test(read('src/lib/alert-pages.ts')));
  const stopRoute = read('src/app/api/alerts/stop/[token]/route.ts');
  ok('the stop link’s GET only shows a button', !/stopAlertByToken\(/.test(stopRoute.slice(stopRoute.indexOf('export async function GET'), stopRoute.indexOf('export async function POST'))));
  const conf = guest.ok ? await confirmAlert(guest.alert.token) : null;
  ok('the confirm turns it on', conf?.result === 'confirmed', conf);
  ok('…and records the alert-text yes (scope alerts) only now', await hasSmsConsent(P1, 'alerts'));
  ok('…which still isn’t a booking-text yes for a new number', !(await hasSmsConsent(P2)));
  ok('a second confirm changes nothing', guest.ok && (await confirmAlert(guest.alert.token)).result === 'already');

  // A guest typing the same email can't edit an alert that's on.
  const again = await createAlert({ courseId: c.id, dates: [d1, d2], parts: ['morning'], players: 2, email: `${TAG}-g@t.local`, phone: P4, textConsent: true }, null);
  const after = gRow ? await prisma.teeTimeAlert.findUniqueOrThrow({ where: { id: gRow.id } }) : null;
  ok('a guest re-asking an alert that’s on gets the same answer and changes nothing', again.ok && again.status === 'pending' && after?.phone === P1 && after?.status === 'active', { again, phone: after?.phone });

  // A stranger re-asking a pending alert with a phone gets a NEW link; the old one stops working.
  const first = await createAlert({ courseId: c.id, dates: [d2], parts: [], players: 1, email: `${TAG}-v@t.local` }, null);
  const second = await createAlert({ courseId: c.id, dates: [d2], parts: [], players: 1, email: `${TAG}-v@t.local`, phone: P7, textConsent: true }, null);
  ok('a re-asked pending alert gets a new confirm link', first.ok && second.ok && first.alert.id === second.alert.id && first.alert.token !== second.alert.token);
  ok('…so the first email can no longer turn on a phone it never named', first.ok && (await confirmAlert(first.alert.token)).result === 'missing' && !(await hasSmsConsent(P7, 'alerts')));
  ok('the confirm email and page name the phone’s last four digits', /number ending \$\{escHtml\(data\.phone\.slice\(-4\)\)\}/.test(read('src/lib/email.ts')) && /number ending \$\{alert\.phone\.slice\(-4\)\}/.test(read('src/app/api/alerts/confirm/[token]/route.ts')));
  const keysLapsed = alertRateKeys({ courseId: c.id, email: `${TAG}-l@t.local` }, { courseId: c.id, email: 'Victim@T.local' });
  ok('a lapsed member typing another email is counted against that email too', keysLapsed.includes('victim@t.local') && keysLapsed.includes(`${TAG}-l@t.local`), keysLapsed);
  ok('a log-in at another course counts only the typed email', JSON.stringify(alertRateKeys({ courseId: 'other', email: 'me@t.local' }, { courseId: c.id, email: 'v@t.local' })) === '["v@t.local"]');
  ok('a member at this course with no typed email counts the log-in email', JSON.stringify(alertRateKeys({ courseId: c.id, email: 'M@t.local' }, { courseId: c.id })) === '["m@t.local"]');
  ok('the route counts every key', /for \(const key of alertRateKeys\(session, body\)\)/.test(read('src/app/api/alerts/route.ts')));

  // A live member: on at once, with the log-in email.
  const m = await prisma.courseMembership.create({ data: { courseId: c.id, inviteEmail: `${TAG}-m@t.local`, status: 'active' } });
  const mem = await createAlert({ courseId: c.id, dates: [d1], parts: [], players: 3, email: 'typed@else.where', phone: P2, textConsent: true }, { membershipId: m.id, courseId: c.id, email: `${TAG}-m@t.local` });
  ok('a logged-in member’s alert is on in one tap', mem.ok && mem.status === 'active', mem);
  ok('…with the log-in email, not a typed one', mem.ok && mem.alert.email === `${TAG}-m@t.local` && mem.maskedEmail.startsWith('t•••@'));
  const lapsed = await prisma.courseMembership.create({ data: { courseId: c.id, inviteEmail: `${TAG}-l@t.local`, status: 'active', expiresAt: new Date(Date.now() - 400 * 86400_000) } });
  const lap = await createAlert({ courseId: c.id, dates: [d1], parts: [], players: 1, email: `${TAG}-l@t.local` }, { membershipId: lapsed.id, courseId: c.id, email: `${TAG}-l@t.local` });
  ok('a lapsed member is a guest (confirm by email)', lap.ok && lap.status === 'pending', lap);
  const otherCourse = await createAlert({ courseId: c.id, dates: [d1], parts: [], players: 1, email: `${TAG}-o@t.local` }, { membershipId: m.id, courseId: 'another-course', email: `${TAG}-m@t.local` });
  ok('another course’s log-in is a guest here', otherCourse.ok && otherCourse.status === 'pending' && otherCourse.alert.email === `${TAG}-o@t.local`);
  ok('the member sees their own alerts', (await memberAlerts(c.id, `${TAG}-m@t.local`)).length === 1);

  // ── 4. Matching and the claim ─────────────────────────────────────────────
  ok('parts of the day', partOf('06:30') === 'morning' && partOf('11:00') === 'midday' && partOf('13:59') === 'midday' && partOf('14:00') === 'late');
  const base = { teeTimeId: null, parts: [] as string[], players: 2, windowStart: '', windowEnd: '' };
  ok('a time with too few seats doesn’t match', !alertMatches(base, { id: 'x', time: '08:00', spots: 1, minPlayers: 1 }));
  ok('a time below the course minimum doesn’t match', !alertMatches(base, { id: 'x', time: '08:00', spots: 4, minPlayers: 3 }));
  ok('a part of the day filters', !alertMatches({ ...base, parts: ['late'] }, { id: 'x', time: '08:00', spots: 4, minPlayers: 1 }));
  ok('a slot alert matches only its time', alertMatches({ ...base, teeTimeId: 'a' }, { id: 'a', time: '08:00', spots: 4, minPlayers: 1 }) && !alertMatches({ ...base, teeTimeId: 'a' }, { id: 'b', time: '08:10', spots: 4, minPlayers: 1 }));
  ok('…or its part of the day when widened', alertMatches({ ...base, teeTimeId: 'a', parts: ['morning'] }, { id: 'b', time: '08:10', spots: 4, minPlayers: 1 }));

  ok('nothing open → nobody told', (await notifyAlertsFor(c.id, [d1])) === 0);
  await prisma.teeTime.update({ where: { id: t2.id }, data: { playersBooked: 0, status: 'available' } }); // a midday time opens
  const midTold = await notifyAlertsFor(c.id, [d1]);
  const gMid = gRow ? await prisma.teeTimeAlert.findUniqueOrThrow({ where: { id: gRow.id } }) : null;
  ok('a midday opening tells the any-time member, not the morning guest', midTold === 1 && !gMid?.notifiedDates.includes(d1), { midTold, nd: gMid?.notifiedDates });

  await prisma.teeTime.update({ where: { id: t1.id }, data: { playersBooked: 1, status: 'available' } }); // a morning time opens
  const race = await Promise.all([notifyAlertsFor(c.id, [d1]), notifyAlertsFor(c.id, [d1]), notifyAlertsFor(c.id, [d1])]);
  ok('three openings at once tell the guest exactly once', race.reduce((a, b) => a + b, 0) === 1, race);
  const gAfter = gRow ? await prisma.teeTimeAlert.findUniqueOrThrow({ where: { id: gRow.id } }) : null;
  ok('…and the date is claimed', JSON.stringify(gAfter?.notifiedDates) === JSON.stringify([d1]));
  ok('the same date never tells again', (await notifyAlertsFor(c.id, [d1])) === 0);
  await prisma.teeTime.updateMany({ where: { courseId: c.id, date: d2 }, data: { playersBooked: 0, status: 'available' } });
  ok('its other date still tells once', (await notifyAlertsFor(c.id, [d2])) === 1);

  // Switch off: no new alerts and none sent.
  await prisma.course.update({ where: { id: c.id }, data: { teeTimeAlertsOn: false } });
  const off = await createAlert({ courseId: c.id, dates: [d1], parts: [], players: 1, email: `${TAG}-x@t.local` }, null);
  ok('switch off: new alerts are refused', !off.ok && off.status === 403 && off.body.alertsOff === true, off);
  const late = await prisma.teeTimeAlert.create({ data: { courseId: c.id, email: `${TAG}-z@t.local`, date: d1, dates: [d1], players: 1, status: 'active', token: `${TAG}-z`, endsAt: new Date(Date.now() + 86400_000 * 5) } });
  ok('switch off: nothing is sent', (await notifyAlertsFor(c.id, [d1])) === 0);
  const offConf = second.ok ? await confirmAlert(second.alert.token) : null;
  ok('switch off: a confirm turns nothing on and records no consent', offConf?.result === 'off' && !(await hasSmsConsent(P7, 'alerts')), offConf?.result);
  await prisma.course.update({ where: { id: c.id }, data: { teeTimeAlertsOn: true } });
  ok('switch on again: it is', (await notifyAlertsFor(c.id, [d1])) === 1);

  // ── 5. Stop and the sweep ─────────────────────────────────────────────────
  ok('the stop link stops it', (await stopAlertByToken(late.token)).result === 'stopped');
  ok('…and again changes nothing', (await stopAlertByToken(late.token)).result === 'already');
  ok('a member can’t stop someone else’s alert', !(await stopMemberAlert(late.id, c.id, `${TAG}-m@t.local`)));
  const old = await prisma.teeTimeAlert.create({ data: { courseId: c.id, email: `${TAG}-y@t.local`, date: d1, dates: [d1], players: 1, status: 'active', token: `${TAG}-y`, endsAt: new Date(Date.now() - 1000) } });
  const legacy = await prisma.teeTimeAlert.create({ data: { courseId: c.id, email: `${TAG}-w@t.local`, date: d1, players: 1, token: `${TAG}-w` } });
  const sw = await sweepTeeTimeAlerts();
  ok('the sweep ends an alert past its last tee time', (await prisma.teeTimeAlert.findUniqueOrThrow({ where: { id: old.id } })).status === 'ended' && sw.ended >= 1, sw);
  const lg = await prisma.teeTimeAlert.findUniqueOrThrow({ where: { id: legacy.id } });
  ok('…tells an alert from before ALERTS-2 once, without writing it an end (no backfill)', lg.endsAt === null && lg.notifiedDates.includes(d1), lg);
  const pastLegacy = await prisma.teeTimeAlert.create({ data: { courseId: c.id, email: `${TAG}-p@t.local`, date: addDaysStr(todayIn('UTC'), -2), players: 1, token: `${TAG}-p` } });
  await tt(addDaysStr(todayIn('UTC'), -2), '09:00', 0);
  ok('a date that has passed is never told', (await notifyAlertsFor(c.id, [pastLegacy.date])) === 0);

  // A request (a cancel, a move) tells at most REQUEST_SEND_CAP; the sweep tells the rest.
  const capDay = addDaysStr(todayIn('UTC'), 4);
  await tt(capDay, '10:00', 0);
  await prisma.teeTimeAlert.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ courseId: c.id, email: `${TAG}-cap${i}@t.local`, date: capDay, dates: [capDay], players: 1, status: 'active', token: `${TAG}-cap${i}`, endsAt: new Date(Date.now() + 86400_000 * 6) })) });
  ok('a request tells at most 25', (await notifyAlertsFor(c.id, [capDay])) === 25);
  ok('…and the sweep tells the other 5', (await sweepTeeTimeAlerts()).told === 5);

  // ── 6. Wiring ─────────────────────────────────────────────────────────────
  ok('TeeTimeAlert is in the launch wipe', WIPED_TABLES.includes('TeeTimeAlert'));
  ok('cancelling tells alerts through the one matcher', /await notifyAlertsFor\(booking\.courseId/.test(read('src/lib/cancel-booking.ts')));
  const cb = read('src/lib/cancel-booking.ts');
  ok('cancelling tells alerts only after every refund and the round release', cb.indexOf('await notifyAlertsFor(') > cb.indexOf('await releaseBookingRounds(') && cb.indexOf('await notifyAlertsFor(') > cb.indexOf('await refundBookingFee('));
  ok('a frost delay moves groups without telling alerts (its early times are blocked next)', /notifyAlerts: false/.test(read('src/lib/frost-delay.ts')) && /opts\.notifyAlerts !== false/.test(read('src/lib/move-booking.ts')));
  ok('moving and shrinking a party do too', /await notifyAlertsFor\(/.test(read('src/lib/move-booking.ts')) && /await notifyAlertsFor\(/.test(read('src/lib/change-party.ts')));
  ok('staff opening a time does, inside after()', (read('src/app/api/operator/tee-times/route.ts').match(/after\(/g) ?? []).length >= 2);
  ok('the hourly cron sweeps alerts', /await sweepTeeTimeAlerts\(now\)/.test(read('src/app/api/cron/hourly/route.ts')));
  ok('every alert email carries the stop link and one-click header', /List-Unsubscribe-Post/.test(read('src/lib/email.ts')) && (read('src/lib/email.ts').match(/headers: stop\.headers/g) ?? []).length === 2);
  ok('the switch is a course setting and on the public course', /'teeTimeAlertsOn'/.test(read('src/app/api/operator/settings/route.ts')) && /tee_time_alerts_on/.test(read('src/lib/normalize-course.ts')));

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('tee-time-alerts-db: all passed');
}

main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
