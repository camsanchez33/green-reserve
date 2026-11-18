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
import { issueLoginCode, MAX_TRIES } from '../src/lib/member-login-code';
import { termsVersionNow } from '../src/lib/terms';
import { todayIn, addDaysStr } from '../src/lib/course-time';
import { groupGreenFee } from '../src/lib/residents';

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
  await prisma.moneyMove.deleteMany({ where: { courseId } });
  await prisma.booking.deleteMany({ where: { courseId } });
  await prisma.courseMembership.deleteMany({ where: { courseId } });
  await prisma.courseResident.deleteMany({ where: { courseId } });
  await prisma.membershipTier.deleteMany({ where: { courseId } });
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.golferAccount.deleteMany({ where: { email: { endsWith: `@${TAG}.test` } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
  await prisma.courseGroup.deleteMany({ where: { slug: `${TAG}-g` } });
  await prisma.securityEvent.deleteMany({ where: { email: { endsWith: `@${TAG}.test` } } });
  await prisma.memberLoginCode.deleteMany({ where: { email: { endsWith: `@${TAG}.test` } } });
  await prisma.memberTermsAgreement.deleteMany({ where: { email: { endsWith: `@${TAG}.test` } } });
  // Repeat runs within an hour must not trip the booking, swap or send-code limits (test rows only).
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: `@${TAG}.test` } }, { key: { startsWith: 'manage:swap:' } }] } });
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
  check('…and has no dues (payments 404)', (await get(`/api/member/${a.slug}/payments`, resCookie)).status === 404);
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
  check('a linked membership: its stale invite email is no log-in', !(await canLogIn(a, `stale@${TAG}.test`)));
  check('…and gets no member rate', (await preview(ttA.id, await cookie(a.id, `stale@${TAG}.test`))).member === null);
  check('…while the account email logs in and gets it', !!(await canLogIn(a, acct.email)) && !!(await preview(ttA.id, await cookie(a.id, acct.email))).member);

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
  const vc = async (email: string, code: string, agreeTerms?: boolean, slug = a.slug) => {
    const r = await fetch(`${BASE_URL}/api/member/${slug}/verify-code`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.8.${Math.floor(Math.random() * 200)}.1` }, body: JSON.stringify({ email, code, ...(agreeTerms ? { agreeTerms: true } : {}) }) });
    return { status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie') ?? '' };
  };
  const version = await termsVersionNow();
  const codeEmail = `code@${TAG}.test`;
  await prisma.courseResident.create({ data: { courseId: a.id, name: 'Coda', email: codeEmail, expiresOn: '' } });
  // send-code in code mode makes a code only for a listed email, and answers both the same.
  const sendC = async (email: string) => { const r = await fetch(`${BASE_URL}/api/member/${a.slug}/send-code`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.7.${Math.floor(Math.random() * 200)}.1` }, body: JSON.stringify({ email, mode: 'code' }) }); return `${r.status} ${await r.text()}`; };
  const l1 = await sendC(codeEmail.toUpperCase()), u1 = await sendC(`nocode@${TAG}.test`);
  check('send-code (code) answers a listed and an unlisted email identically', l1 === u1 && l1.startsWith('200'), { l1, u1 });
  let made = 0;
  for (let i = 0; i < 40 && !made; i++) { made = await prisma.memberLoginCode.count({ where: { courseId: a.id, email: codeEmail } }); if (!made) await new Promise(r => setTimeout(r, 250)); }
  check('…a code is made for the listed email (stored lower-cased, hashed)', made === 1 && !!(await prisma.memberLoginCode.findFirst({ where: { email: codeEmail, codeHash: { not: '' } } })));
  check('…and none for the unlisted one', (await prisma.memberLoginCode.count({ where: { email: `nocode@${TAG}.test` } })) === 0);

  let code = await issueLoginCode(a.id, codeEmail);
  const wrong = code === '000000' ? '000001' : '000000';
  const w = await vc(codeEmail, wrong);
  const never = await vc(`nocode@${TAG}.test`, code);
  check('a wrong code and an email with no code get the same answer', w.status === 400 && never.status === 400 && JSON.stringify(w.body) === JSON.stringify(never.body) && w.body?.code === 'bad_code', { w, never });
  const first = await vc(codeEmail, code);
  check('first log-in: a right code without the box asks for the terms (409), sets no cookie', first.status === 409 && first.body?.code === 'terms_required' && first.body?.error === 'Tick the box to agree before you log in.' && !first.cookie.includes('gr_member='), first);
  const agreed = await vc(codeEmail, code, true);
  check('…the same code with the box ticked logs in', agreed.status === 200 && agreed.cookie.includes('gr_member='), agreed);
  const rec = await prisma.memberTermsAgreement.findUnique({ where: { courseId_email_version: { courseId: a.id, email: codeEmail, version } } });
  check('…and records the agreement with the terms version', !!rec && rec.version === version);
  check('…and writes signin_ok', !!(await prisma.securityEvent.findFirst({ where: { email: codeEmail, kind: 'signin_ok', detail: 'log-in code' } })));
  check('a code works once', (await vc(codeEmail, code, true)).status === 400);
  code = await issueLoginCode(a.id, codeEmail);
  const again = await vc(codeEmail, code);
  check('a later log-in needs no box', again.status === 200 && again.cookie.includes('gr_member='), again);
  // A new terms version asks once more.
  await prisma.memberTermsAgreement.update({ where: { id: rec!.id }, data: { version: '2000-01-01' } });
  code = await issueLoginCode(a.id, codeEmail);
  check('a new terms version asks again', (await vc(codeEmail, code)).body?.code === 'terms_required');
  // A new code ends the last; expiry; tries.
  const old1 = await issueLoginCode(a.id, codeEmail);
  const new1 = await issueLoginCode(a.id, codeEmail);
  check('a new code ends the last one', old1 === new1 || (await vc(codeEmail, old1, true)).status === 400);
  await prisma.memberLoginCode.updateMany({ where: { email: codeEmail, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  check('an expired code is refused', (await vc(codeEmail, new1, true)).status === 400);
  const tried = await issueLoginCode(a.id, codeEmail);
  const bad = tried === '111111' ? '222222' : '111111';
  for (let i = 0; i < MAX_TRIES; i++) await vc(codeEmail, bad);
  check(`after ${MAX_TRIES} wrong tries the right code no longer works`, (await vc(codeEmail, tried, true)).status === 400);
  // A code is for one course.
  const forA = await issueLoginCode(a.id, codeEmail);
  await prisma.courseResident.create({ data: { courseId: b.id, name: 'Coda', email: codeEmail, expiresOn: '' } });
  check('a code for course A does not log in at course B', (await vc(codeEmail, forA, true, b.slug)).status === 400);
  // A card removed after the code went out: the right code still gets the same "didn't work".
  const late = await issueLoginCode(a.id, codeEmail);
  await prisma.courseResident.deleteMany({ where: { courseId: a.id, email: codeEmail } });
  const lateR = await vc(codeEmail, late, true);
  check('an email no longer in a group gets the same answer as a wrong code', lateR.status === 400 && lateR.body?.code === 'bad_code' && !lateR.cookie.includes('gr_member='), lateR);

  // ── The course's Log in switch ──
  check('loginGroups: members and residents', JSON.stringify(await loginGroups({ ...a, memberLoginOn: true })) === '["members","residents"]');
  await prisma.course.update({ where: { id: a.id }, data: { memberLoginOn: false } });
  check('Log in off: send-code says so (404 login_off)', (await fetch(`${BASE_URL}/api/member/${a.slug}/send-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resEmail, mode: 'code' }) })).status === 404);
  check('…verify-code too', (await vc(resEmail, '123456')).body?.code === 'login_off');
  check('…an existing session gets no rate and no session', (await preview(ttA.id, resCookie)).residentGreenFee === null && (await get(`/api/member/${a.slug}/session`, resCookie)).status === 401);
  check('…and loginGroups is empty', (await loginGroups({ ...a, memberLoginOn: false })).length === 0);
  await prisma.course.update({ where: { id: a.id }, data: { memberLoginOn: true } });

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}

main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
