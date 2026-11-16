// Memberships item 2 (Cam 2026-11-16): member numbers — an automatic per-membership prefix and sequence, never
// reused — and the member photo kept in the private store. Against a real database.
// Run: npx tsx scripts/member-number-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { assignMemberNumber, nextMemberNumber, initials, formatMemberNumber } from '../src/lib/member-number';
const TAG = 'memnum2';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  ok('initials: course and membership names', initials('Pine Hollow Golf Club', 'GC') === 'PH' && initials('Full Member', 'MB') === 'FM' && initials('Junior', 'MB') === 'JU' && initials('The Links', 'GC') === 'LI' && initials('', 'MB') === 'MB');
  ok('the mockup’s format: four digits', formatMemberNumber('PH-FM', 12) === 'PH-FM-0012' && formatMemberNumber('PH-FM', 12345) === 'PH-FM-12345');

  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string, name: string) => prisma.course.create({ data: { name, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '0', holes: 18, timezone: 'UTC' } });
  const c = await mk('a', 'Pine Hollow Golf Club'), other = await mk('b', 'Other Course');
  const full = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Full Member' } });
  const family = await prisma.membershipTier.create({ data: { courseId: c.id, name: 'Family Membership' } });
  let n = 0;
  const add = (courseId: string, tierId: string | null) => prisma.courseMembership.create({ data: { courseId, tierId, inviteEmail: `${TAG}+${n++}@t.local`, inviteName: 'M' } });

  ok('the add form previews the first number', (await nextMemberNumber(c.id, full.id)) === 'PH-FM-0001');
  ok('another course can’t preview this course’s membership', (await nextMemberNumber(other.id, full.id)) === null);
  const a = await add(c.id, full.id);
  ok('the first member gets 0001', (await assignMemberNumber(a.id)) === 'PH-FM-0001');
  ok('asking again keeps the same number', (await assignMemberNumber(a.id)) === 'PH-FM-0001');
  const many = await Promise.all(Array.from({ length: 6 }, () => add(c.id, full.id)));
  const nums = await Promise.all(many.map(m => assignMemberNumber(m.id)));
  ok('six added at once: six different numbers, 0002–0007', new Set(nums).size === 6 && nums.every(x => /^PH-FM-000[2-7]$/.test(x ?? '')), nums);
  const f1 = await add(c.id, family.id);
  ok('a second membership with the same initials gets its own prefix', (await assignMemberNumber(f1.id)) === 'PH-FM2-0001');
  await prisma.courseMembership.delete({ where: { id: many[5].id } });
  const after = await add(c.id, full.id);
  ok('a removed member’s number is never given again', (await assignMemberNumber(after.id)) === 'PH-FM-0008');
  await prisma.membershipTier.update({ where: { id: full.id }, data: { name: 'Gold' } });
  await prisma.course.update({ where: { id: c.id }, data: { name: 'Renamed Golf Club' } });
  const renamed = await add(c.id, full.id);
  ok('renaming the membership or the course never changes the prefix', (await assignMemberNumber(renamed.id)) === 'PH-FM-0009');
  await prisma.courseMembership.update({ where: { id: a.id }, data: { tierId: family.id } });
  ok('a member keeps their number on another membership', (await assignMemberNumber(a.id)) === 'PH-FM-0001');
  const noTier = await add(c.id, null);
  ok('a request with no membership yet has no number', (await assignMemberNumber(noTier.id)) === null);
  const otherTier = await prisma.membershipTier.create({ data: { courseId: other.id, name: 'Full Member' } });
  const o = await add(other.id, otherTier.id);
  ok('each course numbers its own members', (await assignMemberNumber(o.id)) === 'OT-FM-0001');

  // The photo is private: stored in the private store and only streamed to the course's staff.
  const photo = readFileSync('src/app/api/operator/members/photo/route.ts', 'utf8');
  ok('the photo goes in the private store, and is streamed, never handed out as a URL', photo.includes("access: 'private', token") && photo.includes('new NextResponse(r.stream') && !/json\(\{[^}]*photoUrl/.test(photo));
  ok('seeing it is members.view, changing it members.edit, the member always the session’s course', photo.includes("gate('members.view')") && (photo.match(/gate\('members\.edit'\)/g) ?? []).length === 2 && photo.includes('where: { id, courseId }'));
  const members = readFileSync('src/app/api/operator/members/route.ts', 'utf8');
  ok('the members list says whether there is a photo, never where it is', members.includes('hasPhoto:       !!m.photoUrl') && !members.includes('photoUrl:'));

  await cleanup(); await prisma.$disconnect();
  console.log(failed ? `\n${failed} FAILED` : '\nmember-number-db: all passed');
  process.exit(failed ? 1 : 0);
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
