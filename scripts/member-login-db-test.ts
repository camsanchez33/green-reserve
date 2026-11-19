// Residents log in (Cam 2026-11-18, GOLFER-LOGIN-1; RES-1, GRP-1). The per-course log-in (gr_member) is a proven
// email at one course, and its groups are read on every request: a live membership here, or a resident card good
// here or in the course's group. A resident who isn't a member logs in and gets the resident rate online.
// Pinned here:
//   - a resident-only golfer gets a session, sees the resident rate (portal list, booking preview) and is charged it
//   - a card listed at a group sibling counts; a course A session never counts at course B, even in one group
//   - emails match case-insensitively and exactly (lib/like-exact): _ and % are never wildcards
//   - send-code answers the same for a listed and an unlisted email
//   - a cookie issued before this change (it carries membershipId) still works, by its email
//   - a lapsed member who is also a resident gets the resident rate; a removed card ends the session's groups
//   - residents switched off in Settings: a card is no log-in and no rate
//   - a resident-only session: the public window, no dues, its own swap keeps the seat only with this course's session
//   - a membership linked to an older golfer account opens with the account's email only
//   - log in with a code: one answer for every wrong case, the terms box only after a right code (recorded with its
//     version, asked again for a new one), single use, a new code ends the last, expiry, 5 tries, one course
//   - the course's Log in switch: off ends log-in, existing sessions and loginGroups
// Needs the app running (TEST_URL) and its database (a local Postgres). Run: npx tsx scripts/member-login-db-test.ts
import { PrismaClient } from '@prisma/client';
import { SignJWT } from 'jose';
import { signMemberSessionToken, signMemberMagicToken, canLogIn, loginGroups } from '../src/lib/member-session';
import { issueLoginCode, MAX_TRIES, purgeOldLoginCodes } from '../src/lib/member-login-code';
import { termsVersionNow } from '../src/lib/terms';
import { todayIn, addDaysStr } from '../src/lib/course-time';
import { groupGreenFee } from '../src/lib/residents';
import { signToken } from '../src/lib/auth';
import { memberBenefitsLine, withoutRates } from '../src/lib/member-benefits';
import { sendWelcome } from '../src/lib/member-welcome';
import { maybeSendPayLink } from '../src/lib/membership-pay-link';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TAG = 'mlogin';
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
  await prisma.golferAccount.deleteMany({ where: { OR: [{ email: { endsWith: `@${TAG}.test` } }, { email: { startsWith: `${TAG}-` } }] } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
  await prisma.courseGroup.deleteMany({ where: { slug: `${TAG}-g` } });
  await prisma.securityEvent.deleteMany({ where: { email: { endsWith: `@${TAG}.test` } } });
  await prisma.sentMessage.deleteMany({ where: { to: { startsWith: `${TAG}-` } } });
  await prisma.memberLoginCode.deleteMany({ where: { email: { endsWith: `@${TAG}.test` } } });
  await prisma.memberTermsAgreement.deleteMany({ where: { email: { endsWith: `@${TAG}.test` } } });
  // Repeat runs within an hour must not trip the booking, swap, alert or send-code limits (local test buckets only).
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: `@${TAG}.test` } }, { key: { startsWith: 'manage:swap:' } }, { key: { startsWith: 'alert:ip:10.6.' } }, { key: { in: ['booking:unknown', 'booking:127.0.0.1', 'booking:::1', 'booking:::ffff:127.0.0.1'] } }] } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Login Test', email: `${TAG}@test.local`, password: 'x' } });
  const base = { hasMemberPricing: true, hasResidentPricing: true, publicAdvanceDays: 10, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NY', zipCode: '10001', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24, lateCancellationFeeCents: 0, noShowFeeCents: 0 };
  const a = await prisma.course.create({ data: { ...base, name: 'Login A', slug: `${TAG}-a` } });
  const b = await prisma.course.create({ data: { ...base, name: 'Login B', slug: `${TAG}-b` } });
  const date = addDaysStr(todayIn('UTC'), 2);
  const tt = (courseId: string, time: string) => prisma.teeTime.create({ data: { courseId, date, time, holes: 18, greenFeeCents: 10000, cartFeeCents: 2000, residentRateCents: 3000, playersAvailable: 4, playersBooked: 0 } });
  const ttA = await tt(a.id, '09:00');
  const ttB = await tt(b.id, '09:00');

  const cookie = async (courseId: string, email: string) => `gr_member=${await signMemberSessionToken({ courseId, email })}`;
  const get = async (path: string, c?: string) => { const r = await fetch(`${BASE_URL}${path}`, c ? { headers: { cookie: c } } : {}); return { status: r.status, body: await r.json().catch(() => null) } };
  const preview = async (teeTimeId: string, c?: string) => (await get(`/api/bookings/resident-rate?teeTimeId=${teeTimeId}`, c)).body as { residentGreenFee: number | null; member: unknown };
  const portalRow = async (slug: string, id: string, c: string) => { const r = await get(`/api/member/${slug}/tee-times?date=${date}`, c); return Array.isArray(r.body) ? r.body.find((x: { id: string }) => x.id === id) : r; };

  // ── A resident who isn't a member ──
  const resEmail = `rita@${TAG}.test`;
  await prisma.courseResident.create({ data: { courseId: a.id, name: 'Rita Res', email: resEmail, cardNumber: 'R1', expiresOn: '' } });
  check('a resident-only email may log in', !!(await canLogIn(a, resEmail)));
  check('…in any letter case', !!(await canLogIn(a, resEmail.toUpperCase())));
  check('an unlisted email may not', !(await canLogIn(a, `nobody@${TAG}.test`)));
  // like-exact: an underscore in the typed email is a literal, never a one-character wildcard.
  await prisma.courseResident.create({ data: { courseId: a.id, name: 'Wild', email: `ax_b@${TAG}.test`, expiresOn: '' } });
  check('"_" is not a wildcard (axyb does not match ax_b)', !(await canLogIn(a, `axyb@${TAG}.test`)));
  check('"%" is not a wildcard', !(await canLogIn(a, `%@${TAG}.test`)));

  const resCookie = await cookie(a.id, resEmail);
  const session = await get(`/api/member/${a.slug}/session`, resCookie);
  const groups = (session.body?.groups ?? []) as { kind: string }[];
  check('the session answers for a resident-only golfer, with the Resident group', session.status === 200 && groups.length === 1 && groups[0].kind === 'resident' && session.body.tier === null && session.body.name === 'Rita Res', session);
  check('…and the public window', session.body?.windowDays === 10, session.body);
  const row = await portalRow(a.slug, ttA.id, resCookie);
  check('the portal list shows their own spot at the resident rate', row?.resident_green_fee === 30, row);
  check('the booking page preview shows the resident rate', (await preview(ttA.id, resCookie)).residentGreenFee === 30);
  check('…and nothing logged out', (await preview(ttA.id)).residentGreenFee === null);

  // Charged: one resident seat, the rest public.
  const book = await fetch(`${BASE_URL}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: resCookie }, body: JSON.stringify({ teeTimeId: ttA.id, golferName: 'Rita Res', golferEmail: resEmail, golferPhone: '', players: 2, termsAccepted: true, cartSelected: false }) });
  const booked = await book.json().catch(() => null);
  const saved = booked?.bookingId ? await prisma.booking.findUnique({ where: { id: booked.bookingId }, select: { residentPlayers: true, greenFeeTotal: true, appliedRate: true } }) : null;
  check('booking charges the resident seat', !!saved && saved.residentPlayers === 1 && saved.appliedRate === 'resident' && saved.greenFeeTotal === groupGreenFee(2, 10000, 1, 3000).greenFeeTotal, { status: book.status, booked, saved });

  // A resident-only session books at the public window, has no dues, and its own swap keeps the seat only with proof.
  const ttFar = await prisma.teeTime.create({ data: { courseId: a.id, date: addDaysStr(todayIn('UTC'), 12), time: '09:00', holes: 18, greenFeeCents: 10000, cartFeeCents: 2000, residentRateCents: 3000, playersAvailable: 4, playersBooked: 0 } });
  const far = await fetch(`${BASE_URL}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: resCookie }, body: JSON.stringify({ teeTimeId: ttFar.id, golferName: 'Rita Res', golferEmail: resEmail, golferPhone: '', players: 1, termsAccepted: true, cartSelected: false }) });
  const farBody = await far.json().catch(() => null);
  check('a resident-only session past the public window is refused', far.status === 403 && farBody?.code === 'outside_window', { status: far.status, farBody });
  const nobodyCookie = await cookie(a.id, `nobody@${TAG}.test`);
  const ttA2 = await tt(a.id, '10:00');
  const nb = await fetch(`${BASE_URL}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: nobodyCookie }, body: JSON.stringify({ teeTimeId: ttA2.id, golferName: 'Nobody', golferEmail: resEmail, golferPhone: '', players: 2, termsAccepted: true, cartSelected: false }) });
  const nbBody = await nb.json().catch(() => null);
  const nbSaved = nbBody?.bookingId ? await prisma.booking.findUnique({ where: { id: nbBody.bookingId }, select: { residentPlayers: true, greenFeeTotal: true } }) : null;
  check('a session in no group (typing a resident\'s email) books at the public price', !!nbSaved && nbSaved.residentPlayers === 0 && nbSaved.greenFeeTotal === 20000, { status: nb.status, nbBody, nbSaved });
  if (booked?.bookingId) {
    const tok = (await prisma.booking.findUnique({ where: { id: booked.bookingId }, select: { checkInToken: true } }))!.checkInToken;
    const ttA3 = await tt(a.id, '11:00');
    const ttA4 = await tt(a.id, '12:00');
    const swap = async (to: string, c: string) => { const r = await fetch(`${BASE_URL}/api/manage/${booked.bookingId}/swap-time`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c }, body: JSON.stringify({ token: tok, newTeeTimeId: to, termsAccepted: true }) }); return { status: r.status, after: await prisma.booking.findUnique({ where: { id: booked.bookingId }, select: { residentPlayers: true, teeTimeId: true } }) }; };
    const s1 = await swap(ttA3.id, resCookie);
    check('the resident\'s own swap, logged in, keeps the resident seat', s1.status === 200 && s1.after?.teeTimeId === ttA3.id && s1.after?.residentPlayers === 1, s1);
    const s2 = await swap(ttA4.id, await cookie(b.id, resEmail));
    check('…and with a course B session loses it', s2.status === 200 && s2.after?.teeTimeId === ttA4.id && s2.after?.residentPlayers === 0, s2);
  }

  // ── Tenant check ──
  check('a course A session gives nothing at course B', (await get(`/api/member/${b.slug}/session`, resCookie)).status === 401);
  await prisma.courseResident.create({ data: { courseId: b.id, name: 'Rita Res', email: resEmail, expiresOn: '' } });
  check('…not even when B lists the same email', (await preview(ttB.id, resCookie)).residentGreenFee === null);
  // GRP-1: a card listed at a group sibling is good here.
  const sibEmail = `sib@${TAG}.test`;
  await prisma.courseResident.create({ data: { courseId: b.id, name: 'Sib', email: sibEmail, expiresOn: '' } });
  check('a card listed only at B is no log-in at A outside a group', !(await canLogIn(a, sibEmail)));
  const g = await prisma.courseGroup.create({ data: { name: 'Login Group', slug: `${TAG}-g` } });
  await prisma.course.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { groupId: g.id } });
  check('…but is once A and B are in one group', !!(await canLogIn(a, sibEmail)));
  check('…and A\'s session then gets A\'s resident rate', (await preview(ttA.id, await cookie(a.id, sibEmail))).residentGreenFee === 30);
  check('…while the A session still gets nothing at B', (await preview(ttB.id, resCookie)).residentGreenFee === null);
  await prisma.course.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { groupId: null } });

  // ── Cards that end ──
  const oldEmail = `old@${TAG}.test`;
  await prisma.courseResident.create({ data: { courseId: a.id, name: 'Old', email: oldEmail, expiresOn: addDaysStr(todayIn('UTC'), -1) } });
  check('an expired card is no log-in', !(await canLogIn(a, oldEmail)));
  check('…and a session for it answers 401', (await get(`/api/member/${a.slug}/session`, await cookie(a.id, oldEmail))).status === 401);
  const goneEmail = `gone@${TAG}.test`;
  const gone = await prisma.courseResident.create({ data: { courseId: a.id, name: 'Gone', email: goneEmail, expiresOn: '' } });
  const goneCookie = await cookie(a.id, goneEmail);
  check('a listed resident\'s session works', (await get(`/api/member/${a.slug}/session`, goneCookie)).status === 200);
  await prisma.courseResident.delete({ where: { id: gone.id } });
  check('…and stops the moment the card is removed', (await get(`/api/member/${a.slug}/session`, goneCookie)).status === 401 && (await preview(ttA.id, goneCookie)).residentGreenFee === null);

  // ── Members ──
  const lapsedEmail = `lapsed@${TAG}.test`;
  const tier = await prisma.membershipTier.create({ data: { courseId: a.id, name: 'Gold', discountPct: 20 } });
  const lapsed = await prisma.courseMembership.create({ data: { courseId: a.id, tierId: tier.id, membershipType: 'Gold', status: 'active', inviteEmail: lapsedEmail, inviteName: 'Lapsed', payToken: `${TAG}-lapsed`, expiresAt: new Date(`${addDaysStr(todayIn('UTC'), -30)}T00:00:00Z`) } });
  await prisma.courseResident.create({ data: { courseId: a.id, name: 'Lapsed', email: lapsedEmail, expiresOn: '' } });
  const lapsedPreview = await preview(ttA.id, await cookie(a.id, lapsedEmail));
  check('a lapsed member who is also a resident gets the resident rate, not the member rate', lapsedPreview.member === null && lapsedPreview.residentGreenFee === 30, lapsedPreview);
  const lapsedSession = await get(`/api/member/${a.slug}/session`, await cookie(a.id, lapsedEmail));
  check('…and both groups in the session', lapsedSession.status === 200 && (lapsedSession.body.groups as { kind: string }[]).map(x => x.kind).join() === 'member,resident', lapsedSession.body);

  const memEmail = `mem@${TAG}.test`;
  const mem = await prisma.courseMembership.create({ data: { courseId: a.id, tierId: tier.id, membershipType: 'Gold', status: 'active', inviteEmail: memEmail, inviteName: 'Mem', payToken: `${TAG}-mem` } });
  const memPreview = await preview(ttA.id, await cookie(a.id, memEmail.toUpperCase()));
  check('a member gets the member rate (email in any case)', !!memPreview.member && (memPreview.member as { greenFee: number }).greenFee === 80, memPreview);
  // A cookie issued before this change carries membershipId; its email is the identity now.
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');
  const oldCookie = `gr_member=${await new SignJWT({ membershipId: mem.id, courseId: a.id, email: memEmail, type: 'member_session' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(secret)}`;
  check('an older cookie (with membershipId) still works', !!(await preview(ttA.id, oldCookie)).member);
  // …but its membershipId grants nothing: someone else's id with your own email gives your groups, not theirs.
  const forged = `gr_member=${await new SignJWT({ membershipId: mem.id, courseId: a.id, email: `nobody@${TAG}.test`, type: 'member_session' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(secret)}`;
  check('…and a membershipId in a token grants nothing by itself', (await preview(ttA.id, forged)).member === null && (await get(`/api/member/${a.slug}/session`, forged)).status === 401);
  await prisma.courseMembership.update({ where: { id: mem.id }, data: { status: 'cancelled' } });
  check('a cancelled membership is no log-in', !(await canLogIn(a, memEmail)));

  // A membership linked to an older golfer account opens with the account's email only, never a stale inviteEmail.
  const acct = await prisma.golferAccount.create({ data: { email: `acct@${TAG}.test`, firstName: 'Acct', lastName: 'Holder', password: 'x' } });
  await prisma.courseMembership.create({ data: { courseId: a.id, golferId: acct.id, tierId: tier.id, membershipType: 'Gold', status: 'active', inviteEmail: `stale@${TAG}.test`, inviteName: 'Acct', payToken: `${TAG}-acct` } });
  // GOLFER-LOGIN-1 2c (Build 2026-11-18): the member's own email (inviteEmail, which staff edit) logs in; an older
  // linked account's email only where none was ever typed. All data today is test data, so no backfill.
  check('a linked membership: the member\'s own email logs in and gets the member rate', !!(await canLogIn(a, `stale@${TAG}.test`)) && !!(await preview(ttA.id, await cookie(a.id, `stale@${TAG}.test`))).member);
  check('…and the old account email no longer does', !(await canLogIn(a, acct.email)) && (await preview(ttA.id, await cookie(a.id, acct.email))).member === null);
  const acct2 = await prisma.golferAccount.create({ data: { email: `acct2@${TAG}.test`, firstName: 'Old', lastName: 'Row', password: 'x' } });
  await prisma.courseMembership.create({ data: { courseId: a.id, golferId: acct2.id, tierId: tier.id, membershipType: 'Gold', status: 'active', inviteEmail: '', inviteName: '', payToken: `${TAG}-acct2` } });
  check('a linked membership with no member email typed logs in with the account email', !!(await canLogIn(a, acct2.email)));

  // Staff edit a linked member's contact (no golfer account signs in now); the new email logs in, the old one stops.
  const owner = `gr_operator=${await signToken({ operatorId: op.id, email: op.email })}`;
  const linked = await prisma.courseMembership.findFirstOrThrow({ where: { golferId: acct.id } });
  const patch = async (body: Record<string, unknown>) => { const r = await fetch(`${BASE_URL}/api/operator/members`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: owner }, body: JSON.stringify({ id: linked.id, ...body }) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const ed = await patch({ name: 'Renamed Member', email: `edited@${TAG}.test`, phone: '555 0100' });
  const edited = await prisma.courseMembership.findUniqueOrThrow({ where: { id: linked.id } });
  check('staff can edit a linked member\'s name, email and phone', ed.status === 200 && edited.inviteEmail === `edited@${TAG}.test` && edited.inviteName === 'Renamed Member' && edited.invitePhone === '555 0100', ed);
  check('…the edited email logs in, the one before it no longer does', !!(await canLogIn(a, `edited@${TAG}.test`)) && !(await canLogIn(a, `stale@${TAG}.test`)));
  check('…a linked member can\'t be left with no email', (await patch({ email: '' })).status === 400);
  check('…nor take an email another member uses (an account email counts where none was typed)', (await patch({ email: acct2.email })).status === 409 && (await patch({ email: memEmail })).status === 409);
  const list = await (await fetch(`${BASE_URL}/api/operator/members`, { headers: { cookie: owner } })).json().catch(() => null);
  const listRow = (Array.isArray(list) ? list : list?.members ?? []).find((x: { id: string }) => x.id === linked.id);
  // One email, one membership: a staff add can't give a second membership an email that already logs in here.
  const post = async (email: string, extra: Record<string, unknown> = {}) => { const r = await fetch(`${BASE_URL}/api/operator/members`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: owner }, body: JSON.stringify({ email, name: 'Dup', tierId: tier.id, ...extra }) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  check('adding a member with an email another membership logs in with is refused', (await post(`edited@${TAG}.test`)).status === 409 && (await post(acct2.email)).status === 409);
  // Linked branch: an account with no membership here whose email a member was edited to.
  const spare = await prisma.golferAccount.create({ data: { email: `spare@${TAG}.test`, firstName: 'Spare', lastName: 'Acct', password: 'x' } });
  await patch({ email: spare.email });
  const dupLinked = await post(spare.email);
  check('…also when the email belongs to an older account (the linked add path)', dupLinked.status === 409 && (await prisma.courseMembership.count({ where: { golferId: spare.id } })) === 0, dupLinked);
  await patch({ email: `edited@${TAG}.test` });
  // Invite branch: the stored email in other letter case.
  await prisma.courseMembership.create({ data: { courseId: a.id, tierId: tier.id, membershipType: 'Gold', status: 'active', inviteEmail: `Mixed.Case@${TAG}.test`, inviteName: 'Mixed', payToken: `${TAG}-mixed` } });
  check('…and when the stored email differs only in letter case', (await post(`mixed.case@${TAG}.test`)).status === 409);
  // Counter pick-up: a linked unpaid row whose email was edited is not reused for the old account email.
  const acct3 = await prisma.golferAccount.create({ data: { email: `acct3@${TAG}.test`, firstName: 'Three', lastName: 'Acct', password: 'x' } });
  const unpaidRow = await prisma.courseMembership.create({ data: { courseId: a.id, golferId: acct3.id, tierId: tier.id, membershipType: 'Gold', status: 'awaiting_payment', addedBy: 'counter', inviteEmail: `moved3@${TAG}.test`, inviteName: 'Three', payToken: `${TAG}-three` } });
  const pick = await post(acct3.email, { payFirst: true });
  const unpaidAfter = await prisma.courseMembership.findUniqueOrThrow({ where: { id: unpaidRow.id } });
  check('…a counter add for an old account email never picks up a row that logs in as another email', pick.status === 409 && unpaidAfter.inviteEmail === `moved3@${TAG}.test` && unpaidAfter.status === 'awaiting_payment', { pick, unpaidAfter: { inviteEmail: unpaidAfter.inviteEmail, status: unpaidAfter.status } });

  // The invite and the dues link go to the member's own email (placeholder addresses: logged, never sent).
  // The Resend client needs a key to be made; placeholder addresses are logged and never handed to it.
  process.env.RESEND_API_KEY ||= 're_test_placeholder_only';
  const PH = '@noemail.greenreserve.app';
  const ownAddr = `${TAG}-own${PH}`, acctAddr = `${TAG}-acct${PH}`;
  const phAcct = await prisma.golferAccount.create({ data: { email: acctAddr, firstName: 'Ph', lastName: 'Acct', password: 'x' } });
  const payTier = await prisma.membershipTier.create({ data: { courseId: a.id, name: 'Paid', annualFeeCents: 10000 } });
  const ph = await prisma.courseMembership.create({ data: { courseId: a.id, golferId: phAcct.id, tierId: payTier.id, membershipType: 'Paid', status: 'active', inviteEmail: ownAddr, inviteName: 'Ph', payToken: `${TAG}-ph` } });
  await sendWelcome(ph.id);
  const sentTo = async (kind: string) => (await prisma.sentMessage.findMany({ where: { kind, to: { in: [ownAddr, acctAddr] } }, select: { to: true } })).map(r => r.to);
  check('the invite goes to the member\'s own email, not the old account\'s', JSON.stringify(await sentTo('member_invite_email')) === JSON.stringify([ownAddr]));
  await prisma.course.update({ where: { id: a.id }, data: { stripeAccountActive: true, stripeAccountId: 'acct_test' } });
  const linkSent = await maybeSendPayLink(ph.id);
  check('the dues link goes there too', linkSent === 'sent' && JSON.stringify(await sentTo('membership_payment_link_email')) === JSON.stringify([ownAddr]), { linkSent, to: await sentTo('membership_payment_link_email') });
  await prisma.course.update({ where: { id: a.id }, data: { stripeAccountActive: false, stripeAccountId: '' } });
  await prisma.sentMessage.deleteMany({ where: { to: { in: [ownAddr, acctAddr] } } });
  for (const status of ['cancelled', 'inactive', 'requested']) {
    await prisma.courseMembership.update({ where: { id: ph.id }, data: { status } });
    await sendWelcome(ph.id);
  }
  check('no invite for a cancelled, paused or requested membership', (await sentTo('member_invite_email')).length === 0);
  await prisma.courseMembership.update({ where: { id: ph.id }, data: { status: 'awaiting_payment' } });
  await sendWelcome(ph.id);
  check('…nor one still waiting for its dues (it goes out once they are paid)', (await sentTo('member_invite_email')).length === 0);
  await prisma.courseMembership.delete({ where: { id: ph.id } });
  await prisma.membershipTier.delete({ where: { id: payTier.id } });
  await prisma.golferAccount.delete({ where: { id: phAcct.id } });
  await prisma.sentMessage.deleteMany({ where: { to: { in: [ownAddr, acctAddr] } } });

  check('the member list shows the member\'s own contact first', listRow?.email === `edited@${TAG}.test` && listRow?.name === 'Renamed Member', listRow);

  // ── Residents switched off ──
  await prisma.course.update({ where: { id: a.id }, data: { hasResidentPricing: false } });
  check('residents off: a card is no log-in', !(await canLogIn({ ...a, hasResidentPricing: false }, resEmail)));
  check('…and the session answers 401', (await get(`/api/member/${a.slug}/session`, resCookie)).status === 401);
  await prisma.course.update({ where: { id: a.id }, data: { hasResidentPricing: true } });

  // ── send-code says the same thing for everyone ──
  const send = async (email: string) => { const r = await fetch(`${BASE_URL}/api/member/${a.slug}/send-code`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(Math.random() * 200)}.1` }, body: JSON.stringify({ email }) }); return `${r.status} ${await r.text()}`; };
  const listed = await send(resEmail);
  const unlisted = await send(`stranger@${TAG}.test`);
  check('send-code answers a listed and an unlisted email identically', listed === unlisted && listed.startsWith('200'), { listed, unlisted });

  // ── verify: the link's email is checked again when opened, and the sign-in is recorded ──
  const verify = async (email: string) => fetch(`${BASE_URL}/api/member/${a.slug}/verify?token=${encodeURIComponent(await signMemberMagicToken({ courseId: a.id, email }))}`, { redirect: 'manual' });
  const ok = await verify(resEmail);
  check('a resident\'s link signs them in', ok.status >= 300 && ok.status < 400 && (ok.headers.get('set-cookie') ?? '').includes('gr_member=') && !(ok.headers.get('location') ?? '').includes('error'), { status: ok.status, location: ok.headers.get('location') });
  const okEvent = await prisma.securityEvent.findFirst({ where: { email: resEmail, kind: 'signin_ok', surface: 'member' } });
  check('…and writes a signin_ok security event', !!okEvent);
  const no = await verify(oldEmail);
  check('a link for an email no longer in a group is refused', (no.headers.get('location') ?? '').includes('error=inactive') && !(no.headers.get('set-cookie') ?? '').includes('gr_member=ey'), { location: no.headers.get('location') });
  const otherCourse = await fetch(`${BASE_URL}/api/member/${b.slug}/verify?token=${encodeURIComponent(await signMemberMagicToken({ courseId: a.id, email: resEmail }))}`, { redirect: 'manual' });
  check('a link for course A opened at course B is refused', (otherCourse.headers.get('location') ?? '').includes('error=invalid'), { location: otherCourse.headers.get('location') });


  // ── Log in with a code (GOLFER-LOGIN-1) ──
  // Each block uses its own listed email and clears its limiter keys, so a check tests the logic, never the limiter.
  const vc = async (email: string, code: string, agreeTerms?: boolean, slug = a.slug) => {
    const r = await fetch(`${BASE_URL}/api/member/${slug}/verify-code`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.8.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}` }, body: JSON.stringify({ email, code, ...(agreeTerms ? { agreeTerms: true } : {}) }) });
    return { status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie') ?? '' };
  };
  const clearLimits = () => prisma.rateLimit.deleteMany({ where: { key: { contains: `@${TAG}.test` } } });
  let nth = 0;
  const fresh = async (courseId = a.id) => { const email = `code${++nth}@${TAG}.test`; await prisma.courseResident.create({ data: { courseId, name: 'Coda', email, expiresOn: '' } }); await clearLimits(); return email; };
  const version = await termsVersionNow();
  const other = (c: string) => (c === '000000' ? '000001' : '000000');

  // send-code in code mode makes a code only for a listed email, and answers both the same.
  let e1 = await fresh();
  const sendC = async (email: string) => { const r = await fetch(`${BASE_URL}/api/member/${a.slug}/send-code`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.7.${Math.floor(Math.random() * 200)}.1` }, body: JSON.stringify({ email, mode: 'code' }) }); return `${r.status} ${await r.text()}`; };
  const l1 = await sendC(e1.toUpperCase()), u1 = await sendC(`nocode@${TAG}.test`);
  check('send-code (code) answers a listed and an unlisted email identically', l1 === u1 && l1.startsWith('200'), { l1, u1 });
  let made = 0;
  for (let i = 0; i < 40 && !made; i++) { made = await prisma.memberLoginCode.count({ where: { courseId: a.id, email: e1 } }); if (!made) await new Promise(r => setTimeout(r, 250)); }
  check('…a code is made for the listed email (stored lower-cased, hashed)', made === 1 && !!(await prisma.memberLoginCode.findFirst({ where: { email: e1, codeHash: { not: '' } } })));
  check('…and none for the unlisted one', (await prisma.memberLoginCode.count({ where: { email: `nocode@${TAG}.test` } })) === 0);

  // Wrong answers all look alike; the terms box after a right code; recorded with its version.
  e1 = await fresh();
  let code = await issueLoginCode(a.id, e1);
  const w = await vc(e1, other(code));
  const never = await vc(`nocode@${TAG}.test`, code);
  check('a wrong code and an email with no code get the same answer', w.status === 400 && never.status === 400 && JSON.stringify(w.body) === JSON.stringify(never.body) && w.body?.code === 'bad_code', { w, never });
  check('…and a code that isn\'t 6 digits is refused without spending a try', (await vc(e1, '12')).status === 400 && (await prisma.memberLoginCode.findFirst({ where: { email: e1 } }))?.attempts === 1);
  const first = await vc(e1, code);
  check('first log-in: a right code without the box asks for the terms (409), sets no cookie', first.status === 409 && first.body?.code === 'terms_required' && first.body?.error === 'Tick the box to agree before you log in.' && !first.cookie.includes('gr_member='), first);
  const agreed = await vc(e1, code, true);
  check('…the same code with the box ticked logs in', agreed.status === 200 && agreed.cookie.includes('gr_member='), agreed);
  const rec = await prisma.memberTermsAgreement.findUnique({ where: { courseId_email_version: { courseId: a.id, email: e1, version } } });
  check('…and records the agreement with the terms version', !!rec && rec.version === version);
  check('…and writes signin_ok', !!(await prisma.securityEvent.findFirst({ where: { email: e1, kind: 'signin_ok', detail: 'log-in code' } })));
  check('a code works once', (await vc(e1, code, true)).status === 400);
  await clearLimits();
  code = await issueLoginCode(a.id, e1);
  const again = await vc(e1, code);
  check('a later log-in needs no box', again.status === 200 && again.cookie.includes('gr_member='), again);
  await prisma.memberTermsAgreement.update({ where: { id: rec!.id }, data: { version: '2000-01-01' } });
  code = await issueLoginCode(a.id, e1);
  check('a new terms version asks again', (await vc(e1, code)).body?.code === 'terms_required');

  // A new code ends the last — also when two are issued at the same instant; expiry.
  e1 = await fresh();
  const old1 = await issueLoginCode(a.id, e1);
  const new1 = await issueLoginCode(a.id, e1);
  check('a new code ends the last one', old1 === new1 || (await vc(e1, old1, true)).status === 400);
  await prisma.memberLoginCode.updateMany({ where: { email: e1, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  check('an expired code is refused', (await vc(e1, new1, true)).status === 400);
  e1 = await fresh();
  const burst = await Promise.all([1, 2, 3, 4].map(() => issueLoginCode(a.id, e1)));
  const newest = await prisma.memberLoginCode.findFirst({ where: { email: e1 }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  let worked = 0;
  for (let pass = 0; pass < 2; pass++) for (const c of burst) { const r = await vc(e1, c, true); if (r.status === 200) worked++; await clearLimits(); }
  check('four codes sent at once: exactly one ever works (only the newest counts)', worked === 1 && !!newest, { worked });
  check('…and all four are ended once that one logs in', (await prisma.memberLoginCode.count({ where: { email: e1, usedAt: { not: null } } })) === 4);

  // Five tries — held against parallel guesses too.
  e1 = await fresh();
  const tried = await issueLoginCode(a.id, e1);
  for (let i = 0; i < MAX_TRIES; i++) await vc(e1, other(tried));
  const deadRow = await prisma.memberLoginCode.findFirst({ where: { email: e1 } });
  check(`${MAX_TRIES} wrong tries end the code`, deadRow?.attempts === MAX_TRIES && !!deadRow?.usedAt, deadRow);
  check('…and the right code no longer works', (await vc(e1, tried, true)).status === 400);
  // A right code on the last try still gets through the terms question.
  e1 = await fresh();
  const lastTry = await issueLoginCode(a.id, e1);
  for (let i = 0; i < MAX_TRIES - 1; i++) await vc(e1, other(lastTry));
  const lt409 = await vc(e1, lastTry);
  const lt200 = await vc(e1, lastTry, true);
  check('4 wrong, then the right code: the terms question, then log in with the same code', lt409.status === 409 && lt200.status === 200, { lt409, lt200 });
  check('…and the 409 itself is not recorded as a failed sign-in', !(await prisma.securityEvent.findFirst({ where: { email: e1, kind: 'signin_failed', detail: { contains: 'terms' } } })));
  e1 = await fresh();
  const par = await issueLoginCode(a.id, e1);
  const flood = await Promise.all([...Array(8).fill(other(par)), par].map(c => vc(e1, c, true)));
  const parRow = await prisma.memberLoginCode.findFirst({ where: { email: e1 } });
  check(`nine guesses at once compare at most ${MAX_TRIES} times`, (parRow?.attempts ?? 99) <= MAX_TRIES && flood.filter(r => r.status === 200).length <= 1, { attempts: parRow?.attempts, ok: flood.filter(r => r.status === 200).length });
  // The per-address cap: the 11th verify in an hour is refused even with the right code.
  e1 = await fresh();
  for (let i = 0; i < 10; i++) await vc(e1, '000000');
  await prisma.memberLoginCode.deleteMany({ where: { email: e1 } });
  const capped = await issueLoginCode(a.id, e1);
  check('the 11th verify for one address in an hour is refused, right code or not', (await vc(e1, capped, true)).status === 400);

  // A code is for one course.
  e1 = await fresh();
  await prisma.courseResident.create({ data: { courseId: b.id, name: 'Coda', email: e1, expiresOn: '' } });
  const forA = await issueLoginCode(a.id, e1);
  check('a code for course A does not log in at course B', (await vc(e1, forA, true, b.slug)).status === 400);
  // A card removed after the code went out: the right code gets the same "didn't work", and the reason is recorded.
  e1 = await fresh();
  const late = await issueLoginCode(a.id, e1);
  await prisma.courseResident.deleteMany({ where: { courseId: a.id, email: e1 } });
  const lateR = await vc(e1, late, true);
  check('an email no longer in a group gets the same answer as a wrong code', lateR.status === 400 && lateR.body?.code === 'bad_code' && !lateR.cookie.includes('gr_member='), lateR);
  check('…recorded as not in a group', !!(await prisma.securityEvent.findFirst({ where: { email: e1, kind: 'signin_failed', detail: 'not in a group at this course' } })));

  // Housekeeping: codes older than a day go.
  const oldRow = await prisma.memberLoginCode.create({ data: { courseId: a.id, email: `purge@${TAG}.test`, codeHash: 'x', expiresAt: new Date(Date.now() - 2 * 86400000), createdAt: new Date(Date.now() - 2 * 86400000) } });
  const freshRow = await prisma.memberLoginCode.create({ data: { courseId: a.id, email: `purge@${TAG}.test`, codeHash: 'y', expiresAt: new Date(Date.now() + 60000) } });
  await purgeOldLoginCodes();
  check('codes older than a day are purged, newer ones kept', !(await prisma.memberLoginCode.findUnique({ where: { id: oldRow.id } })) && !!(await prisma.memberLoginCode.findUnique({ where: { id: freshRow.id } })));

  // ── The course's Log in switch ──
  check('loginGroups: members and residents', JSON.stringify(await loginGroups({ ...a, memberLoginOn: true })) === '["members","residents"]');
  const offEmail = `offmem@${TAG}.test`;
  await prisma.courseMembership.create({ data: { courseId: a.id, tierId: tier.id, membershipType: 'Gold', status: 'active', inviteEmail: offEmail, inviteName: 'Off', payToken: `${TAG}-off` } });
  const offCookie = await cookie(a.id, offEmail);
  check('(a live member gets the member rate while Log in is on)', !!(await preview(ttA.id, offCookie)).member);
  // Tee time alerts read the log-in too (one tap, the member window, "my alerts").
  await prisma.course.update({ where: { id: a.id }, data: { teeTimeAlertsOn: true } });
  const alert = async (c: string, n: number) => { const r = await fetch(`${BASE_URL}/api/alerts`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: c, 'x-forwarded-for': `10.6.${n}.1` }, body: JSON.stringify({ courseId: a.id, dates: [date], parts: [], players: 1, email: `alert-guest${n}@${TAG}.test` }) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  const mine = async (c: string) => (await fetch(`${BASE_URL}/api/alerts/mine?courseId=${a.id}`, { headers: { cookie: c } })).status;
  const onAlert = await alert(offCookie, 1);
  check('(with Log in on, a logged-in member\'s alert is on in one tap and "my alerts" answers)', onAlert.status === 200 && onAlert.body?.status === 'active' && (await mine(offCookie)) === 200, onAlert);
  const myAlert = await prisma.teeTimeAlert.findFirst({ where: { courseId: a.id, email: offEmail }, select: { id: true } });
  await prisma.course.update({ where: { id: a.id }, data: { memberLoginOn: false } });
  check('Log in off: send-code says so (404 login_off)', (await fetch(`${BASE_URL}/api/member/${a.slug}/send-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resEmail, mode: 'code' }) })).status === 404);
  check('…verify-code too', (await vc(resEmail, '123456')).body?.code === 'login_off');
  check('…an existing session gets no rate and no session', (await preview(ttA.id, resCookie)).residentGreenFee === null && (await get(`/api/member/${a.slug}/session`, resCookie)).status === 401);
  const ttOff = await tt(a.id, '13:00');
  const offBook = await fetch(`${BASE_URL}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: offCookie }, body: JSON.stringify({ teeTimeId: ttOff.id, golferName: 'Off', golferEmail: offEmail, golferPhone: '', players: 1, termsAccepted: true, cartSelected: false }) });
  const offBody = await offBook.json().catch(() => null);
  const offSaved = offBody?.bookingId ? await prisma.booking.findUnique({ where: { id: offBody.bookingId }, select: { appliedRate: true, greenFeeTotal: true } }) : null;
  check('…a member\'s booking is charged the public price', !!offSaved && offSaved.appliedRate === 'standard' && offSaved.greenFeeTotal === 10000, { status: offBook.status, offBody, offSaved });
  // Every route that reads the log-in treats the cookie as a guest's.
  const activeBefore = await prisma.teeTimeAlert.count({ where: { courseId: a.id, email: offEmail, status: 'active' } });
  const offAlert = await alert(offCookie, 2);
  // The guest path emails a confirm link (no mail key in tests, so the answer may be the send error); the row shows it.
  const guestRow = await prisma.teeTimeAlert.findFirst({ where: { courseId: a.id, email: `alert-guest2@${TAG}.test` }, select: { status: true, membershipId: true } });
  check('…a tee time alert is a guest\'s: the typed email, waiting for its confirm link, not one tap', !!guestRow && guestRow.status !== 'active' && guestRow.membershipId === null && (await prisma.teeTimeAlert.count({ where: { courseId: a.id, email: offEmail, status: 'active' } })) === activeBefore, { offAlert, guestRow });
  check('…"my alerts" answers 401', (await mine(offCookie)) === 401);
  const stop = await fetch(`${BASE_URL}/api/alerts/mine/${myAlert?.id ?? 'x'}/stop`, { method: 'POST', headers: { cookie: offCookie } });
  check('…stopping "my" alert by the log-in answers 401, and the alert stays on', stop.status === 401 && (await prisma.teeTimeAlert.findUniqueOrThrow({ where: { id: myAlert!.id } })).status === 'active', { status: stop.status });
  check('…the member tee-time list answers 401', (await get(`/api/member/${a.slug}/tee-times?date=${date}`, offCookie)).status === 401);
  const offSwapRes = await preview(ttA.id, resCookie);
  check('…and the booking page preview gives a resident nothing', offSwapRes.residentGreenFee === null && offSwapRes.member === null);
  // No route reads the cookie except through loggedInAt / currentLogIn (which check the switch).
  const { execSync } = await import('child_process');
  const direct = execSync("git grep -l -e 'getMemberSession' -e \"get('gr_member')\" -e 'get(\"gr_member\")' -- src || true").toString().trim().split('\n').filter(f => f && f !== 'src/lib/member-session.ts');
  check('no route reads the log-in cookie except through loggedInAt', direct.length === 0, direct);
  check('…and loginGroups is empty', (await loginGroups({ ...a, memberLoginOn: false })).length === 0);
  // Only a card someone could log in with now counts toward "residents": not a counter-only card (no email), not an expired one.
  const lg = await prisma.course.create({ data: { ...base, name: 'Login Groups', slug: `${TAG}-lg` } });
  await prisma.courseResident.create({ data: { courseId: lg.id, name: 'Counter only', email: null, expiresOn: '' } });
  await prisma.courseResident.create({ data: { courseId: lg.id, name: 'Expired', email: `lg-old@${TAG}.test`, expiresOn: addDaysStr(todayIn('UTC'), -1) } });
  check('loginGroups: counter-only and expired cards don\'t make "residents"', (await loginGroups(lg)).length === 0);
  await prisma.courseResident.create({ data: { courseId: lg.id, name: 'Good', email: `lg-good@${TAG}.test`, expiresOn: '' } });
  check('…a card good today with an email does', JSON.stringify(await loginGroups(lg)) === '["residents"]');
  // 'members' follows canLogIn too: an active membership with an email, not an active tier.
  const lgTier = await prisma.membershipTier.create({ data: { courseId: lg.id, name: 'Unused', active: true } });
  check('loginGroups: an active tier with no members gives no "members"', JSON.stringify(await loginGroups(lg)) === '["residents"]');
  await prisma.membershipTier.update({ where: { id: lgTier.id }, data: { active: false } });
  const lgMem = await prisma.courseMembership.create({ data: { courseId: lg.id, tierId: lgTier.id, membershipType: 'Unused', status: 'active', inviteEmail: `lg-mem@${TAG}.test`, inviteName: 'LG', payToken: `${TAG}-lg` } });
  check('…an active member on an inactive tier does', JSON.stringify(await loginGroups(lg)) === '["members","residents"]');
  // The two rules agree: loginGroups is non-empty exactly when some email at the course could log in.
  const agree = async (label: string) => {
    const [cardRows, memRows] = await Promise.all([prisma.courseResident.findMany({ where: { courseId: lg.id }, select: { email: true } }), prisma.courseMembership.findMany({ where: { courseId: lg.id }, select: { inviteEmail: true } })]);
    const emails = [...cardRows.map(r => r.email ?? ''), ...memRows.map(r => r.inviteEmail)].filter(Boolean);
    const any = (await Promise.all(emails.map(e => canLogIn(lg, e)))).some(Boolean);
    check(`loginGroups agrees with canLogIn: ${label}`, ((await loginGroups(lg)).length > 0) === any, { any, groups: await loginGroups(lg) });
  };
  await agree('a member and a resident');
  await prisma.courseMembership.update({ where: { id: lgMem.id }, data: { status: 'cancelled' } });
  await prisma.courseResident.deleteMany({ where: { courseId: lg.id, email: `lg-good@${TAG}.test` } });
  await agree('nobody who can log in');
  await prisma.courseMembership.update({ where: { id: lgMem.id }, data: { status: 'active' } });
  await agree('only a member');
  await prisma.course.update({ where: { id: a.id }, data: { memberLoginOn: true } });

  // ── Your <Course> (Build 2026-11-18 session shape): benefits, renews/expires, upcoming bookings ──
  const home = await prisma.course.create({ data: { ...base, publicAdvanceDays: 5, name: 'Home Course', slug: `${TAG}-home` } });
  const homeTier = await prisma.membershipTier.create({ data: { courseId: home.id, name: 'Gold', discountPct: 20, advanceBookingDays: 9, guestPassesPerYear: 6 } });
  const homeEmail = `home@${TAG}.test`;
  const homeEnd = addDaysStr(todayIn('UTC'), 120);
  await prisma.courseMembership.create({ data: { courseId: home.id, tierId: homeTier.id, membershipType: 'Gold', status: 'active', inviteEmail: homeEmail, inviteName: 'Home Member', payToken: `${TAG}-home`, autoRenew: true, expiresAt: new Date(`${homeEnd}T00:00:00Z`) } });
  const htt = (date: string, time: string, courseId = home.id) => prisma.teeTime.create({ data: { courseId, date, time, holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0 } });
  const tomorrow = addDaysStr(todayIn('UTC'), 1), farDay = addDaysStr(todayIn('UTC'), 8);
  const tNear = await htt(tomorrow, '09:00'), tFar = await htt(farDay, '10:00'), tPast = await htt(todayIn('UTC'), '00:00'), tPaid = await htt(tomorrow, '11:00'), tGone = await htt(tomorrow, '12:00');
  const tOther = await htt(tomorrow, '09:00', b.id);
  let tok = 0;
  const hb = (teeTimeId: string, courseId: string, golferEmail: string, extra: Record<string, unknown> = {}) => prisma.booking.create({ data: { teeTimeId, courseId, golferName: 'Home Member', golferEmail, players: 2, greenFeeTotal: 10000, accessFeeTotal: 300, totalAmount: 10300, status: 'confirmed', checkInToken: `${TAG}-tok-${++tok}`, ...extra } });
  const bNear = await hb(tNear.id, home.id, homeEmail.toUpperCase());
  const bFar = await hb(tFar.id, home.id, homeEmail, { stripePaymentMethodId: 'pm_test', feePaidCents: 300 });
  await hb(tPast.id, home.id, homeEmail);
  const bPaid = await hb(tPaid.id, home.id, homeEmail, { paymentStatus: 'paid', paidAt: new Date() });
  await hb(tGone.id, home.id, homeEmail, { status: 'cancelled' });
  await hb(tNear.id, home.id, `someone-else@${TAG}.test`);
  await hb(tOther.id, b.id, homeEmail);
  const hs = await get(`/api/member/${home.slug}/session`, await cookie(home.id, homeEmail));
  const up = (hs.body?.upcoming ?? []) as { bookingId: string; manageUrl: string; date: string; time: string; players: number; holes: number; membersOnlyDay: boolean; dueLine: string }[];
  check('Your <Course>: benefits in one line', hs.body?.benefits === '20% off every round and you can book 9 days out. 6 guest passes a year.', hs.body?.benefits);
  check('…renews on the end date when it renews itself', hs.body?.renewsOn === homeEnd && hs.body?.expiresOn === null && hs.body?.autoRenew === true, hs.body);
  check('…renewalFailed false while renewals go through', hs.body?.renewalFailed === false, hs.body);
  check('…inGrace false mid-term', hs.body?.inGrace === false, hs.body);
  // A decline happens at the end of the term; within the grace days the membership still logs in with its rates.
  await prisma.course.update({ where: { id: home.id }, data: { memberGraceDays: 10 } });
  await prisma.courseMembership.updateMany({ where: { courseId: home.id, inviteEmail: homeEmail }, data: { autoRenewFailedAt: new Date(), expiresAt: new Date(`${addDaysStr(todayIn('UTC'), -1)}T00:00:00Z`) } });
  const hsFail = await get(`/api/member/${home.slug}/session`, await cookie(home.id, homeEmail));
  check('…renewalFailed true after a declined renewal at the end of the term (the Golfer lane\'s "Your renewal didn\'t go through")', hsFail.body?.renewalFailed === true, hsFail.body);
  check('…inGrace true: the term ended yesterday and the course\'s 10 grace days still give member rates', hsFail.body?.inGrace === true, hsFail.body);
  // The end date itself is still a member day, not grace.
  await prisma.courseMembership.updateMany({ where: { courseId: home.id, inviteEmail: homeEmail }, data: { expiresAt: new Date(`${todayIn('UTC')}T00:00:00Z`) } });
  check('…inGrace false on the end date itself', (await get(`/api/member/${home.slug}/session`, await cookie(home.id, homeEmail))).body?.inGrace === false);
  await prisma.courseMembership.updateMany({ where: { courseId: home.id, inviteEmail: homeEmail }, data: { expiresAt: new Date(`${addDaysStr(todayIn('UTC'), -1)}T00:00:00Z`) } });
  // The member turns automatic renewal off from their emailed link: nothing is failing any more (Build 2026-11-18).
  const homeM = await prisma.courseMembership.findFirstOrThrow({ where: { courseId: home.id, inviteEmail: homeEmail }, select: { id: true } });
  const off = await fetch(`${BASE_URL}/api/membership/${homeM.id}/auto-renew`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: `${TAG}-home` }) });
  const hsOffRenew = await get(`/api/member/${home.slug}/session`, await cookie(home.id, homeEmail));
  check('…and false once auto-renew is turned off (the flag is cleared)', off.status === 200 && hsOffRenew.body?.renewalFailed === false && hsOffRenew.body?.autoRenew === false && (await prisma.courseMembership.findUniqueOrThrow({ where: { id: homeM.id } })).autoRenewFailedAt === null, { status: off.status, body: hsOffRenew.body });
  await prisma.courseMembership.update({ where: { id: homeM.id }, data: { autoRenew: true, autoRenewFailedAt: new Date() } });
  // Staff moved "Runs until" on by hand (comped, or paid outside): the old flag stays set, but the term is current.
  await prisma.courseMembership.updateMany({ where: { courseId: home.id, inviteEmail: homeEmail }, data: { expiresAt: new Date(`${homeEnd}T00:00:00Z`) } });
  const hsMoved = await get(`/api/member/${home.slug}/session`, await cookie(home.id, homeEmail));
  check('…but false once the term runs into the future again, flag or not', hsMoved.body?.renewalFailed === false && hsMoved.body?.renewsOn === homeEnd, hsMoved.body);
  check('…and not in grace with the term running', hsMoved.body?.inGrace === false, hsMoved.body);
  await prisma.courseMembership.updateMany({ where: { courseId: home.id, inviteEmail: homeEmail }, data: { autoRenewFailedAt: null } });
  await prisma.course.update({ where: { id: home.id }, data: { memberGraceDays: 0 } });
  check('…upcoming: this course, this email (any case), confirmed, still to come, soonest first', up.map(u => u.bookingId).join() === [bNear.id, bPaid.id, bFar.id].join() && up.length === 3, up);
  check('…each opens its manage page with the emailed token, as a path on this site', up[0]?.manageUrl === `/manage/${bNear.id}?token=${TAG}-tok-1` && up[0].date === tomorrow && up[0].time === '09:00' && up[0].players === 2 && up[0].holes === 18, up[0]);
  check('…no card held: "Total due at the course"', up[0]?.dueLine === 'Total due at the course: $103.00', up[0]);
  check('…paid: "Paid"', up[1]?.dueLine === 'Paid', up[1]);
  check('…card on file, fee taken at booking: "Estimated total at check-in" less the fee', up[2]?.dueLine === 'Estimated total at check-in: $100.00', up[2]);
  check('…a day outside the public window is a members-only day', up[2]?.membersOnlyDay === true && up[0]?.membersOnlyDay === false, up.map(u => u.membersOnlyDay));
  // Members switched off in Settings (lib/pricing-switch): no member rate is charged, so none is promised.
  await prisma.course.update({ where: { id: home.id }, data: { hasMemberPricing: false } });
  const hsOff = await get(`/api/member/${home.slug}/session`, await cookie(home.id, homeEmail));
  check('…Members pricing off: the line keeps the window and guest passes, not the rate', hsOff.body?.benefits === 'You can book 9 days out. 6 guest passes a year.', hsOff.body?.benefits);
  check('…and the session sends no member rate fields for a page to rebuild a price from', hsOff.body?.tier && hsOff.body.tier.discountPct === null && hsOff.body.tier.greenFeeWeekday === null && hsOff.body.tier.greenFeeWeekend === null && hsOff.body.tier.cartFeeWeekday === null && hsOff.body.tier.cartFeeWeekend === null, hsOff.body?.tier);
  check('(with it on, the tier\'s rate is sent)', hs.body?.tier?.discountPct === 20, hs.body?.tier);
  // withoutRates drops the prices and keeps the window and passes (the invite itself sends no benefits with pricing off).
  check('withoutRates keeps the window and passes only', memberBenefitsLine(withoutRates({ discountPct: 20, greenFeeWeekdayCents: null, greenFeeWeekendCents: null, lineRates: null, advanceBookingDays: 9, windowPublic: false, guestPassesPerYear: 6 }), {}) === 'book 9 days out · 6 guest passes a year');
  const welcomeSrc = (await import('fs')).readFileSync('src/lib/member-welcome.ts', 'utf8');
  check('…and sendWelcome applies it from the course\'s switch', welcomeSrc.includes("benefits: memberPricingOn(m.course) ? memberBenefitsLine(m.tier, m.course) : ''") && welcomeSrc.includes('memberPricing: memberPricingOn(m.course)') && welcomeSrc.includes('hasMemberPricing: true'));
  const emailSrc = (await import('fs')).readFileSync('src/lib/email.ts', 'utf8');
  check('…the invite reads "with this email to book." with Members pricing off, and "to get your rates" with it on', emailSrc.includes("with this email ${data.memberPricing ? `to get your rates") && emailSrc.includes(": 'to book.'}"));
  // The dues-history route is gone (no page has used it since #502).
  check('the member payments route is gone (404)', (await get(`/api/member/${home.slug}/payments`, await cookie(home.id, homeEmail))).status === 404);
  await prisma.course.update({ where: { id: home.id }, data: { hasMemberPricing: true } });
  // More due-line cases and the no-token link, found by id.
  const tMore = await htt(addDaysStr(todayIn('UTC'), 3), '08:00');
  const bCardNoFee = await hb(tMore.id, home.id, homeEmail, { stripePaymentMethodId: 'pm_test', feePaidCents: 0 });
  const bGrown = await hb(tMore.id, home.id, homeEmail, { stripePaymentMethodId: 'pm_test', feePaidCents: 300, accessFeeTotal: 600, totalAmount: 10600 });
  const bNoTok = await hb(tMore.id, home.id, homeEmail, { checkInToken: null });
  const upMore = ((await get(`/api/member/${home.slug}/session`, await cookie(home.id, homeEmail))).body?.upcoming ?? []) as { bookingId: string; manageUrl: string; dueLine: string }[];
  const byId = (id: string) => upMore.find(u => u.bookingId === id);
  check('…card on file, no fee taken: the whole estimated total', byId(bCardNoFee.id)?.dueLine === 'Estimated total at check-in: $103.00', byId(bCardNoFee.id));
  check('…a party that grew after the fee was taken: only the fee already taken comes off', byId(bGrown.id)?.dueLine === 'Estimated total at check-in: $103.00', byId(bGrown.id));
  check('…a booking with no emailed token opens the course page', byId(bNoTok.id)?.manageUrl === `/courses/${home.slug}`, byId(bNoTok.id));
  // At most 20, soonest first — counted in the query, so today's passed times never shorten the list.
  for (let i = 0; i < 20; i++) await hb(tPast.id, home.id, homeEmail);
  for (let i = 0; i < 20; i++) await hb(tFar.id, home.id, homeEmail);
  const upCap = ((await get(`/api/member/${home.slug}/session`, await cookie(home.id, homeEmail))).body?.upcoming ?? []) as { bookingId: string; date: string }[];
  check('…the list stops at 20, and a pile of today\'s passed bookings doesn\'t shorten it', upCap.length === 20 && upCap[0]?.bookingId === bNear.id, { n: upCap.length, first: upCap[0] });
  await prisma.courseMembership.updateMany({ where: { courseId: home.id }, data: { autoRenew: false } });
  const hs2 = await get(`/api/member/${home.slug}/session`, await cookie(home.id, homeEmail));
  check('…expires on the end date when it does not renew itself', hs2.body?.expiresOn === homeEnd && hs2.body?.renewsOn === null && hs2.body?.autoRenew === false, hs2.body);
  await prisma.course.update({ where: { id: home.id }, data: { hasResidentPricing: true } });
  await prisma.courseResident.create({ data: { courseId: home.id, name: 'Home Res', email: `home-res@${TAG}.test`, expiresOn: homeEnd } });
  const rs = await get(`/api/member/${home.slug}/session`, await cookie(home.id, `home-res@${TAG}.test`));
  check('…a resident: the resident line, the card\'s expiry, an empty list', rs.body?.benefits === 'The resident rate on your own round.' && rs.body?.expiresOn === homeEnd && rs.body?.renewsOn === null && rs.body?.autoRenew === false && rs.body?.renewalFailed === false && Array.isArray(rs.body?.upcoming) && rs.body.upcoming.length === 0, rs.body);
  await prisma.courseMembership.updateMany({ where: { courseId: home.id }, data: { expiresAt: new Date(Date.now() - 400 * 86400_000) } });
  const hs3 = await get(`/api/member/${home.slug}/session`, await cookie(home.id, homeEmail));
  check('…a lapsed membership gives no benefits line, and is past its grace (not inGrace)', hs3.status === 200 && hs3.body?.benefits === null && hs3.body?.inGrace === false, hs3.body);

  // The benefits line (invite email, Your <Course>).
  const tb = { discountPct: null, greenFeeWeekdayCents: null, greenFeeWeekendCents: null, lineRates: null, advanceBookingDays: 9, windowPublic: false, guestPassesPerYear: 6 };
  check('benefits: % off, window, passes', memberBenefitsLine({ ...tb, discountPct: 20 }, { publicAdvanceDays: 7 }) === '20% off every round · book 9 days out · 6 guest passes a year');
  check('benefits: a flat price, one pass', memberBenefitsLine({ ...tb, greenFeeWeekdayCents: 4500, greenFeeWeekendCents: 5000, guestPassesPerYear: 1 }, {}) === 'rounds from $45 · book 9 days out · 1 guest pass a year');
  check('benefits: the public window says nothing about days', memberBenefitsLine({ ...tb, discountPct: 10, windowPublic: true, guestPassesPerYear: 0 }, {}) === '10% off every round');

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}

main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
