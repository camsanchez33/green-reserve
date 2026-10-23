// Cam 2026-10-23: the dashboard's "Please sign the Operator Agreement" prompt
// asked a course built by hand to sign forever — it read only the onboarding
// timeline, which exists only for a course built from an inquiry.
// latestOperatorAgreement() reads the signed rows first. Needs a database.
// Run: npx tsx scripts/agreement-prompt-db-test.ts
import { prisma } from '../src/lib/prisma';
import { latestOperatorAgreement } from '../src/lib/agreement-gate';
import { logAgreementAccepted } from '../src/lib/course-timeline';

const TAG = 'agreepromptdbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = courses.map(c => c.id);
  await prisma.agreementAcceptance.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseInquiry.deleteMany({ where: { builtCourseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'A', email: `${TAG}@test.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Agree ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'T', state: 'NJ', zipCode: '07000', holes: 18, liveStatus: 'live', active: true } });
  const byHand = await mk('hand'); const other = await mk('other'); const legacy = await mk('legacy');

  check('a course with no record has no acceptance', (await latestOperatorAgreement(byHand.id)) === null);
  await prisma.agreementAcceptance.create({ data: { courseId: other.id, document: 'operator_agreement', version: '2026-11', textHash: 'h', signerName: 'X', signerTitle: 'Owner', signerEmail: 'x@test.local', ip: '1', userAgent: 'test' } });
  check('another course signing doesn’t count for this one', (await latestOperatorAgreement(byHand.id)) === null);

  // Built by hand (no inquiry), signed through the real signing flow's row.
  await prisma.agreementAcceptance.create({ data: { courseId: byHand.id, document: 'operator_agreement', version: '2026-11', textHash: 'h', signerName: 'Dana', signerTitle: 'GM', signerEmail: 'dana@test.local', ip: '1', userAgent: 'test' } });
  const a = await latestOperatorAgreement(byHand.id);
  check('a course built by hand that signed is not asked again', a?.version === '2026-11' && a.acceptedBy === 'dana@test.local', a);
  await prisma.agreementAcceptance.create({ data: { courseId: byHand.id, document: 'brand_license', version: '2026-12', textHash: 'h', signerName: 'Dana', signerTitle: 'GM', signerEmail: 'dana@test.local', ip: '1', userAgent: 'test' } });
  check('only the Operator Agreement counts', (await latestOperatorAgreement(byHand.id))?.version === '2026-11');

  // Accepted before AG-1: only the line on its inquiry's timeline.
  await prisma.courseInquiry.create({ data: { contactName: 'L', contactTitle: 'GM', email: `${TAG}-l@test.local`, phone: '1', courseName: 'Legacy', address: '1', city: 'T', state: 'NJ', zipCode: '07000', courseType: 'public', status: 'live', builtCourseId: legacy.id } });
  await logAgreementAccepted(legacy.id, 'old@test.local', '2026-08');
  check('an acceptance from before the signed rows still counts', (await latestOperatorAgreement(legacy.id))?.version === '2026-08');

  await cleanup();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}
main().catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
