// MEM-JOIN (Cam 2026-10-30: "Join online", "Course decides per tier"): a golfer joins a tier
// online — instantly once the dues are paid, or by request that staff approve — and gets member
// rates only once paid. Needs a database. Run: npx tsx scripts/membership-join-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { joinTier, approveJoin, declineJoin, joinableTiers, myMembership, readJoinMode } from '../src/lib/membership-join';
import { membershipLive } from '../src/lib/member-rates';

const TAG = 'membershipjoindbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const RULE = { memberGraceDays: 0, timezone: 'UTC' };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.golferAccount.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  ok('join modes are checked', readJoinMode('instant') === 'instant' && readJoinMode('request') === 'request' && readJoinMode('off') === 'off' && readJoinMode('yes') === null);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Join ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const c = await mk('a'), other = await mk('b');
  // The course's "$800 for unlimited rounds": dues $800, green fee $0.
  const unlimited = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Unlimited', annualFeeCents: 80000, greenFeeWeekdayCents: 0, greenFeeWeekendCents: 0, joinOnline: 'instant' } });
  const club = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Club', annualFeeCents: 200000, initiationFeeCents: 50000, joinOnline: 'request' } });
  const free = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Free', annualFeeCents: 0, greenFeeWeekdayCents: 0, joinOnline: 'instant' } });
  const staffOnly = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Staff only', annualFeeCents: 50000 } });
  const g = await prisma.golferAccount.create({ data: { email: `${TAG}+pat@t.local`, password: 'x', firstName: 'Pat', lastName: 'Golfer' } });
  const G = { id: g.id, email: g.email, name: 'Pat Golfer', phone: '' };

  const offered = await joinableTiers(c.id);
  ok('offered online: only tiers with joining on and dues to pay', offered.map(t => t.name).sort().join(',') === 'Club,Unlimited', offered.map(t => t.name));
  ok('a free tier can\'t be joined online', !(await joinTier(c.id, G, free.id)).ok);
  ok('nor a tier staff add members to', !(await joinTier(c.id, G, staffOnly.id)).ok);
  ok('nor another course\'s tier', !(await joinTier(other.id, G, unlimited.id)).ok);

  const j = await joinTier(c.id, G, unlimited.id);
  const row = j.ok ? await prisma.courseMembership.findUniqueOrThrow({ where: { id: j.membershipId } }) : null;
  ok('pay and join: awaiting payment, on the tier, a pay token, the golfer\'s account', j.ok && j.status === 'awaiting_payment' && row?.tierId === unlimited.id && row.golferId === g.id && !!row.payToken && row.addedBy === 'online', { j, row });
  ok('…no member rates before paying', !!row && !membershipLive(row, RULE));
  const again = await joinTier(c.id, G, unlimited.id);
  ok('…joining again gives back the same unfinished join', j.ok && again.ok && again.membershipId === j.membershipId && again.payToken === j.payToken);
  ok('…the page sees where they stand', (await myMembership(c.id, g.id, g.email))?.status === 'awaiting_payment');
  // Paid (what api/membership/[id] records): active, member rates.
  await prisma.courseMembership.update({ where: { id: row!.id }, data: { status: 'active', paymentStatus: 'paid', lastPaidAt: new Date(), expiresAt: new Date(Date.now() + 365 * 86_400_000) } });
  ok('paid: a member with member rates', membershipLive(await prisma.courseMembership.findUniqueOrThrow({ where: { id: row!.id } }), RULE));
  ok('…and can\'t join again', !(await joinTier(c.id, G, club.id)).ok);

  // Request to join: staff approve or decline.
  const g2 = await prisma.golferAccount.create({ data: { email: `${TAG}+lee@t.local`, password: 'x', firstName: 'Lee', lastName: 'Golfer' } });
  const L = { id: g2.id, email: g2.email, name: 'Lee Golfer', phone: '' };
  const req = await joinTier(c.id, L, club.id);
  ok('request to join: requested, nothing to pay yet', req.ok && req.status === 'requested');
  ok('another course can\'t approve it', req.ok && !(await approveJoin(other.id, req.membershipId)).ok);
  const ap = req.ok ? await approveJoin(c.id, req.membershipId) : null;
  ok('approved: awaiting payment (no Stripe here, so the link isn\'t sent, and staff are told)', !!ap && ap.ok && !ap.sent && /Stripe/.test(ap.note) && (await prisma.courseMembership.findUniqueOrThrow({ where: { id: req.ok ? req.membershipId : '' } })).status === 'awaiting_payment', ap);
  ok('…approving twice is refused', req.ok && !(await approveJoin(c.id, req.membershipId)).ok);
  ok('…staff can drop an unpaid join', req.ok && (await declineJoin(c.id, req.membershipId)).ok);
  const back = await joinTier(c.id, L, club.id);
  ok('a declined golfer can ask again — the same row, reused', req.ok && back.ok && back.membershipId === req.membershipId && back.status === 'requested');
  ok('decline never touches a paid member', !(await declineJoin(c.id, row!.id)).ok);
  // A member the course made not active can't turn themselves back on by joining online.
  await prisma.courseMembership.update({ where: { id: row!.id }, data: { status: 'inactive' } });
  const paused = await joinTier(c.id, G, unlimited.id);
  ok('a paused member can\'t rejoin online — the course turns them back on', !paused.ok && /paused by the course/.test(paused.error), paused);

  // Wiring.
  const pay = readFileSync('src/app/api/membership/[id]/route.ts', 'utf8');
  ok('the dues pay link takes an online join and makes it active', pay.includes("status: { in: ['active', 'awaiting_payment'] }") && /paymentStatus: 'paid',\n\s+status: 'active',/.test(readFileSync('src/lib/membership-dues.ts', 'utf8')) && pay.includes('recordPaidTerm('));
  const tiers = readFileSync('src/app/api/operator/tiers/route.ts', 'utf8');
  ok('a tier joined online needs dues (create and edit)', (tiers.match(/JOIN_NEEDS_DUES/g) ?? []).length >= 3);
  const route = readFileSync('src/app/api/courses/[slug]/join/route.ts', 'utf8');
  ok('joining online: signed in, rate limited, a live course with Stripe', route.includes("if (!golfer?.email) return NextResponse.json({ error: 'Sign in to join") && route.includes('rateLimit(`join:') && route.includes("liveStatus: 'live', archivedAt: null") && route.includes('stripeAccountActive'));
  const members = readFileSync('src/app/api/operator/members/route.ts', 'utf8');
  ok('approve and decline are staff actions behind members.edit', members.includes("action === 'approve_join'") && members.includes("requirePermission(session, 'members.edit')"));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('membership-join-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
