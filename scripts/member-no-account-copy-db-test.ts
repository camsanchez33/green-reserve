// Audit 2026-11-24 H1: Members → Import (and the single Add) linked any listed email that had a
// GreenReserve golfer account and copied that account's name and phone onto the course's list, so course A
// could pull a golfer's details by uploading a CSV of email addresses (and the skip reason said which
// addresses had no account). Now an import or add never reads golfer accounts: it makes an invite with
// only what the course typed, and needs a name on every row.
// Real database. Run: npx tsx scripts/member-no-account-copy-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { importMembers } from '../src/lib/member-import';

const TAG = 'memnocopytest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.golferAccount.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const a = await prisma.course.create({ data: { name: 'Course A', slug: `${TAG}-a`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const tier = await prisma.membershipTier.create({ data: { courseId: a.id, name: 'Gold', termMonths: 12 } });
  // A golfer with an account (from golfing elsewhere) — their name and phone must not reach course A.
  await prisma.golferAccount.create({ data: { email: `${TAG}+pat@t.local`, password: 'x', firstName: 'Pat', lastName: 'Secret', phone: '+15555550142' } });

  const r = await importMembers(a.id, [
    { line: 2, email: `${TAG}+pat@t.local`, name: '', phone: '', tier: '', expires: '', paid: null },
    { line: 3, email: `${TAG}+nobody@t.local`, name: '', phone: '', tier: '', expires: '', paid: null },
    { line: 4, email: `${TAG}+lee@t.local`, name: 'Lee Typed', phone: '555 0100', tier: '', expires: '', paid: null },
  ], { defaultTierId: tier.id, paidByDefault: false, addedBy: 'test' });
  if ('error' in r) throw new Error(r.error);
  const rows = await prisma.courseMembership.findMany({ where: { courseId: a.id }, select: { inviteEmail: true, inviteName: true, invitePhone: true, golferId: true } });
  ok('H1 a nameless row is skipped whether or not the email has an account', r.added === 1 && r.skipped.length === 2, r);
  ok('H1 …with the same reason for both, so it says nothing about accounts', r.skipped.every(s => s.reason === r.skipped[0].reason) && !/account/i.test(r.skipped[0].reason), r.skipped);
  ok('H1 nothing from the golfer account reaches the course', !rows.some(m => m.inviteName.includes('Secret') || m.invitePhone.includes('0142') || m.golferId), rows);
  ok('H1 a named row is an invite with only what the course typed', rows.length === 1 && rows[0].inviteName === 'Lee Typed' && rows[0].invitePhone === '555 0100' && rows[0].golferId === null, rows);

  const named = await importMembers(a.id, [{ line: 2, email: `${TAG}+pat@t.local`, name: 'Pat Typed', phone: '', tier: '', expires: '', paid: null }], { defaultTierId: tier.id, paidByDefault: false, addedBy: 'test' });
  const pat = await prisma.courseMembership.findFirst({ where: { courseId: a.id, inviteEmail: `${TAG}+pat@t.local` } });
  ok('H1 with a name, an address that has an account is added like any other (not linked)', !('error' in named) && named.added === 1 && pat?.golferId === null && pat?.inviteName === 'Pat Typed', pat);
  const again = await importMembers(a.id, [{ line: 2, email: `${TAG}+pat@t.local`, name: 'Pat Typed', phone: '', tier: '', expires: '', paid: null }], { defaultTierId: tier.id, paidByDefault: false, addedBy: 'test' });
  ok('H1 importing the same member again is skipped', !('error' in again) && again.added === 0 && again.skipped[0]?.reason === 'Already a member');

  const lib = readFileSync('src/lib/member-import.ts', 'utf8');
  const route = readFileSync('src/app/api/operator/members/route.ts', 'utf8');
  ok('H1 neither the import nor the single add reads golfer accounts', !lib.includes('golferAccount') && !route.includes('prisma.golferAccount'));
  ok('H1 the single add needs a name and never says "account"', route.includes("{ error: 'Name is required' }") && !/without an existing account/.test(route));

  await cleanup();
  await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
