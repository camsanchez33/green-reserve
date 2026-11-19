// Booking page look on the member statement and the event sign-up page (Build 2026-11-19, BOOKING-LOOK-1): each sends
// `booking_look` ({ look, accent }) next to brandColor, from bookingLookOf, and nothing else new. A course that never set
// a look sends accent null (the page uses brandColor). Run: npx tsx scripts/statement-signup-look-db-test.ts
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { signupPage } from '../src/lib/event-signup';
import { GET as statementGET } from '../src/app/api/statement/[id]/route';

const TAG = 'stsglook';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
const DAY = 86_400_000;

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.memberStatement.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseEventPlayer.deleteMany({ where: { event: { courseId: { in: ids } } } });
  await prisma.courseEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@t.local` } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string, look: { bookingLook?: string; bookingAccent?: string | null }) => prisma.course.create({ data: {
    name: `Look ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Main', city: 'X', state: 'NJ', zipCode: '07001', holes: 18,
    timezone: 'America/New_York', active: true, liveStatus: 'live', brandColor: '#7A1F5C', adminNotes: 'INTERNAL-NOTE', ...look,
  } });
  const set = await mk('set', { bookingLook: 'dark', bookingAccent: 'yellow' });
  const unset = await mk('unset', {});

  for (const [c, want] of [[set, { look: 'dark', accent: 'yellow' }], [unset, { look: 'light', accent: null }]] as const) {
    const label = c.id === set.id ? 'set look' : 'no look';
    const check = (name: string, body: Record<string, unknown> | null | undefined) => {
      ok(`${name} (${label}): answers`, !!body);
      if (!body) return;
      ok(`${name} (${label}): booking_look is ${JSON.stringify(want)}`, JSON.stringify(body.booking_look) === JSON.stringify(want), body.booking_look);
      ok(`${name} (${label}): booking_look carries only look and accent`, !!body.booking_look && JSON.stringify(Object.keys(body.booking_look as object).sort()) === '["accent","look"]');
      ok(`${name} (${label}): brandColor still sent`, body.brandColor === '#7A1F5C');
      const wire = JSON.stringify(body);
      ok(`${name} (${label}): no raw columns, notes or Stripe fields`, !wire.includes('bookingAccent') && !wire.includes('"bookingLook"') && !wire.includes('INTERNAL-NOTE') && !wire.includes('adminNotes') && !wire.includes('stripeAccount'));
    };

    // Member statement pay link: token-gated route.
    const tier = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full', accountOn: true, accountSettle: 'manual' } });
    const m = await prisma.courseMembership.create({ data: { courseId: c.id, tierId: tier.id, inviteName: 'Kim', inviteEmail: `${TAG}+${c.id}@t.local`, status: 'active' } });
    const now = new Date();
    const st = await prisma.memberStatement.create({ data: { courseId: c.id, membershipId: m.id, period: '2026-10', closedAt: now, dueAt: new Date(now.getTime() + 30 * DAY), totalCents: 1800, payToken: `${TAG}-${c.id}` } });
    const r = await statementGET(new NextRequest(`http://localhost/api/statement/${st.id}?token=${TAG}-${c.id}`), { params: Promise.resolve({ id: st.id }) });
    check('statement', r.ok ? await r.json() : null);
    ok(`statement (${label}): a wrong token is refused`, !(await statementGET(new NextRequest(`http://localhost/api/statement/${st.id}?token=nope`), { params: Promise.resolve({ id: st.id }) })).ok);

    // Event sign-up page: the look sits in its course object, beside brandColor.
    const ev = await prisma.courseEvent.create({ data: { courseId: c.id, name: 'Member-guest', date: '2031-05-14', startTime: '08:00', holdFrom: '07:00', holdTo: '12:30', signupOpen: true } });
    const page = await signupPage(ev.id);
    check('event sign-up', page?.course as Record<string, unknown> | undefined);
    ok(`event sign-up (${label}): nothing new outside the course object`, !!page && !('booking_look' in page));
  }

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
