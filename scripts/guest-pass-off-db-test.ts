// GUEST-PASS-OFF (Cam 2026-11-24, "no guest passes for now, get rid of that completely"). The tiers route neither
// reads nor writes MembershipTier.guestPassesPerYear (the column stays, unused), and it never goes on the wire; the
// Memberships pages show no guest passes. The benefits line is pinned in member-login-db-test.ts.
// Needs the app running (TEST_URL) and its database (a local Postgres). Run: npx tsx scripts/guest-pass-off-db-test.ts
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { signToken } from '../src/lib/auth';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const TAG = 'gpoff';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: courses.map(c => c.id) } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

async function main() {
  // Source guards: no control, no line, no field on the dashboard's tier shape.
  for (const f of ['src/app/dashboard/members/page.tsx', 'src/components/dashboard/members/MembershipSetup.tsx', 'src/components/dashboard/members/shared.tsx']) {
    const s = readFileSync(f, 'utf8');
    check(`${f}: no guest passes`, !/guest pass/i.test(s) && !s.includes('guestPassesPerYear'));
  }
  check('the tier card still says when guests pay the member rate', readFileSync('src/app/dashboard/members/page.tsx', 'utf8').includes('k="Guests" v="Pay the member rate"'));

  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'GP Off', email: `${TAG}@test.local`, password: 'x' } });
  await prisma.course.create({ data: { name: 'GP Off', slug: `${TAG}-c`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NY', zipCode: '10001', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC' } });
  const owner = `gr_operator=${await signToken({ operatorId: op.id, email: op.email })}`;
  const call = async (method: string, body?: unknown) => {
    const r = await fetch(`${BASE_URL}/api/operator/tiers`, { method, headers: { 'Content-Type': 'application/json', cookie: owner }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  const made = await call('POST', { name: 'Gold', discountPct: 10, advanceBookingDays: 9, termMonths: 12, guestPassesPerYear: 6, guestsPayMemberRate: true });
  const row = made.body?.id ? await prisma.membershipTier.findUnique({ where: { id: made.body.id } }) : null;
  check('create: a sent guestPassesPerYear is not stored (the default 0)', made.status === 201 && row?.guestPassesPerYear === 0, { made, row });
  check('…and not sent back; guestsPayMemberRate is', made.body && !('guestPassesPerYear' in made.body) && made.body.guestsPayMemberRate === true, made.body);

  if (row) {
    await prisma.membershipTier.update({ where: { id: row.id }, data: { guestPassesPerYear: 6 } });
    const patched = await call('PATCH', { id: row.id, guestPassesPerYear: 9, notes: 'edited' });
    const after = await prisma.membershipTier.findUnique({ where: { id: row.id } });
    check('update: a sent guestPassesPerYear changes nothing (a stored 6 stays 6)', patched.status === 200 && after?.guestPassesPerYear === 6 && after?.notes === 'edited', { patched, after });
    check('…and not sent back', patched.body && !('guestPassesPerYear' in patched.body), patched.body);
    const list = await call('GET');
    const listed = Array.isArray(list.body) ? list.body.find((t: { id: string }) => t.id === row.id) : null;
    check('the tier list carries no guestPassesPerYear', list.status === 200 && !!listed && !('guestPassesPerYear' in listed), list);
  }

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nguest-pass-off-db: all passed');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
