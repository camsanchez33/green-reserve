// Cam 2026-10-27 ("do the column and fix it"): a course built with Admin → Create
// course has no inquiry, so approving its page used to fail with "no linked
// inquiry". Its decision now lives on the course (Course.pageDecision). Real database.
// Run: npx tsx scripts/course-page-decision-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { getApprovalState, recordCoursePageDecision, coursePageDecision } from '../src/lib/approval-state';
import { submitChangeRequest } from '../src/lib/submit-change-request';

const TAG = 'pagedecisiontest';
let failed = 0;
const ok = (l: string, c: boolean, d?: unknown) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || d === undefined ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.message.deleteMany({ where: { thread: { courseId: { in: ids } } } });
  await prisma.messageThread.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@test.local` } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'Decision Test', email: `${TAG}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: { name: 'Wizard GC', slug: `${TAG}-1`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'NY', zipCode: '12866' } });

  ok('a new course without an inquiry has no decision', (await getApprovalState(course.id)).status === 'none');
  await recordCoursePageDecision(course.id, 'approved');
  const approved = await getApprovalState(course.id);
  ok('approving records it on the course, with the time', approved.status === 'approved' && !!approved.approvedAt && approved.inquiryId === null);
  ok('…and gates another preview, as for a pipeline course', approved.sendPreviewGated);
  await recordCoursePageDecision(course.id, null);
  const reopened = await prisma.course.findUniqueOrThrow({ where: { id: course.id } });
  ok('re-review or a new preview reopens it', reopened.pageDecision === null && reopened.pageDecidedAt === null && (await getApprovalState(course.id)).status === 'none');

  // The change request writes before it emails (after() throws outside a request here).
  await submitChangeRequest(course.id, [{ category: 'pricing', detail: 'Weekend rate is $55' }]).catch(() => null);
  ok('asking for changes records changes_requested on the course', (await getApprovalState(course.id)).status === 'changes_requested');
  ok('…and the request still reaches GreenReserve as a message', (await prisma.message.count({ where: { thread: { courseId: course.id }, body: { contains: 'Weekend rate is $55' } } })) === 1);
  ok('anything else on the column reads as no decision', coursePageDecision('maybe') === 'none' && coursePageDecision(null) === 'none');

  const src = (f: string) => readFileSync(f, 'utf8');
  for (const f of ['src/app/api/operator/approve-page/route.ts', 'src/app/api/preview/[courseId]/approve/route.ts']) {
    ok(`${f.split('/api/')[1]} records approval on the course instead of refusing`, !src(f).includes('approval can’t be recorded') && src(f).includes("recordCoursePageDecision(") && src(f).includes("'approved')"));
  }
  ok('the dashboard and the preview read the course decision when there is no inquiry', src('src/app/api/operator/courses/route.ts').includes('coursePageDecision(course.pageDecision)') && src('src/app/api/preview/[courseId]/route.ts').includes('coursePageDecision(dbCourse.pageDecision)'));
  ok('re-review and a new preview reopen it', src('src/app/api/admin/request-re-review/route.ts').includes('recordCoursePageDecision(courseId, null)') && src('src/app/api/preview/send/route.ts').includes('recordCoursePageDecision(rawCourseId, null)'));
  ok('the admin courses list shows it', src('src/app/api/admin/courses/route.ts').includes('coursePageDecision(c.pageDecision)'));

  await cleanup();
  await prisma.$disconnect();
  if (failed) { console.error(`course-page-decision: ${failed} failed`); process.exit(1); }
  console.log('course-page-decision: all passed');
})();
