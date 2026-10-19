// GRP-1 (Cam 2026-10-19): course groups. A resident card added at one course of
// a group works at every course in it, and nowhere else; leaving the group (or
// deleting it) ends the sharing. Needs a database. Run: npx tsx scripts/course-groups-test.ts
import { PrismaClient } from '@prisma/client';
import { groupCourseIds } from '../src/lib/course-group';
import { residentOn } from '../src/lib/member-session';
import { loadPublicTeeTimes } from '../src/lib/public-tee-times';

const prisma = new PrismaClient();
const TAG = 'grouptest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const courseId = { in: courses.map(c => c.id) };
  await prisma.teeTime.deleteMany({ where: { courseId } });
  await prisma.courseResident.deleteMany({ where: { courseId } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseGroup.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Group Test', email: `${TAG}@test.local`, password: 'x' } });
  const op2 = await prisma.courseOperator.create({ data: { name: 'Group Test 2', email: `${TAG}2@test.local`, password: 'x' } });
  const mk = (n: string, operatorId = op.id) => prisma.course.create({ data: { name: `Group ${n}`, slug: `${TAG}-${n}`, operatorId, address: '1 Test Dr', city: 'T', state: 'NJ', zipCode: '07601', holes: 18, liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24 } });
  const a = await mk('a');
  const b = await mk('b', op2.id); // a group can span operators (a county's courses)
  const lone = await mk('lone');
  const group = await prisma.courseGroup.create({ data: { name: 'Group Test', slug: `${TAG}-county` } });
  await prisma.course.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { groupId: group.id } });

  check('a grouped course sees every course in its group', (await groupCourseIds(a.id)).sort().join() === [a.id, b.id].sort().join());
  check('a course on its own sees only itself', (await groupCourseIds(lone.id)).join() === lone.id);

  await prisma.courseResident.create({ data: { courseId: a.id, name: 'Jane', email: 'jane@x.com', expiresOn: '2030-12-31' } });
  check('a card added at course A works at course A', !!(await residentOn(a.id, 'jane@x.com', '2030-06-04')));
  check('… and at course B in the same group', !!(await residentOn(b.id, 'JANE@x.com ', '2030-06-04')));
  check('… but not at a course outside the group', !(await residentOn(lone.id, 'jane@x.com', '2030-06-04')));
  check('an expired card works nowhere', !(await residentOn(b.id, 'jane@x.com', '2031-01-02')));

  // A second, expired card at B does not hide the valid one at A.
  await prisma.courseResident.create({ data: { courseId: b.id, name: 'Jane', email: 'jane2@x.com', expiresOn: '2020-01-01' } });
  await prisma.courseResident.create({ data: { courseId: a.id, name: 'Jane', email: 'jane2@x.com', expiresOn: '2030-12-31' } });
  check('any valid card in the group counts', !!(await residentOn(b.id, 'jane2@x.com', '2030-06-04')));

  await prisma.course.update({ where: { id: b.id }, data: { groupId: null } });
  check('after B leaves the group, A\'s card no longer works at B', !(await residentOn(b.id, 'jane@x.com', '2030-06-04')));
  await prisma.course.update({ where: { id: b.id }, data: { groupId: group.id } });

  // Deleting the group leaves the courses, ungrouped (onDelete: SetNull).
  await prisma.courseGroup.delete({ where: { id: group.id } });
  const after = await prisma.course.findMany({ where: { id: { in: [a.id, b.id] } }, select: { groupId: true } });
  check('deleting a group keeps its courses, ungrouped', after.length === 2 && after.every(c => c.groupId === null));
  check('… and the sharing ends', !(await residentOn(b.id, 'jane@x.com', '2030-06-04')));

  // The group page lists each course with its own rules: a hidden (archived) course 404s.
  await prisma.course.update({ where: { id: lone.id }, data: { liveStatus: 'building' } });
  const hidden = await loadPublicTeeTimes(lone.slug, '2030-06-04');
  check('a course that isn\'t live has no public times', !hidden.ok && hidden.status === 404);

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
