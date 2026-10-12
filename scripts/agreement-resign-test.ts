// AG-3 re-acceptance (Cam 2026-10-12: "after they sign it the banner stays"):
// a course on an older Operator Agreement, inside the re-accept window, signs
// the new version — a row is written, the banner's source clears, the screen
// asks for exactly the new version. Needs a database. Run: npx tsx scripts/agreement-resign-test.ts
import { prisma } from '../src/lib/prisma';
import { currentVersion, loadDocument, signableDocuments } from '../src/lib/agreements';
import { agreementStatus } from '../src/lib/agreement-gate';
import { agreementReacceptance } from '../src/lib/agreement-required';

const TAG = 'resigntest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function cleanup() {
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  await prisma.agreementAcceptance.deleteMany({ where: { courseId: { in: courses.map(c => c.id) } } });
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

async function main() {
  const current = currentVersion('operator_agreement');
  const older = '2026-08';
  if (current === older) { console.log('no newer operator agreement on disk — nothing to test'); return; }
  await cleanup();
  // The window for the current version, as Admin → System → Publish leaves it.
  const before = await prisma.agreementVersion.findUnique({ where: { document_version: { document: 'operator_agreement', version: current } } });
  const doc = loadDocument('operator_agreement', current);
  await prisma.agreementVersion.upsert({
    where: { document_version: { document: 'operator_agreement', version: current } },
    create: { document: 'operator_agreement', version: current, textHash: doc.hash, effectiveAt: new Date(), reacceptBy: new Date(Date.now() + 30 * 86_400_000) },
    update: {},
  });
  try {
    const op = await prisma.courseOperator.create({ data: { name: 'Resign', email: `${TAG}@test.local`, password: 'x' } });
    const course = await prisma.course.create({ data: { name: 'Resign Course', slug: `${TAG}-c`, operatorId: op.id, address: '1', city: 'X', state: 'CA', zipCode: '9', holes: 18, timezone: 'UTC' } });
    // Signed everything at the time: the older OA, the other documents at their current versions.
    const old = loadDocument('operator_agreement', older);
    await prisma.agreementAcceptance.create({ data: { courseId: course.id, document: 'operator_agreement', version: older, textHash: old.hash, signerName: 'A', signerTitle: 'O', signerEmail: 'a@x', authorityAttested: true } });
    for (const d of signableDocuments().filter(d => d.document !== 'operator_agreement')) {
      await prisma.agreementAcceptance.create({ data: { courseId: course.id, document: d.document, version: d.version, textHash: d.hash, signerName: 'A', signerTitle: 'O', signerEmail: 'a@x' } });
    }

    const st = await agreementStatus(course.id);
    const oa = st.documents.find(d => d.document === 'operator_agreement');
    check('inside the window the older row still counts (not gated)', oa?.signed === true, oa);
    check('…but the new version needs signing', oa?.needsSigning === true, oa);
    check('the other documents do not', st.documents.filter(d => d.document !== 'operator_agreement').every(d => !d.needsSigning), st.documents);
    check('the banner shows', !!(await agreementReacceptance(course.id)));

    // recordSigning (lib/agreement-sign.ts, which pulls in the PDF renderer
    // and cannot load under tsx) signs exactly the documents with needsSigning.
    const toSign = st.documents.filter(d => d.needsSigning);
    check('the signer is asked for exactly the new Operator Agreement', toSign.length === 1 && toSign[0].document === 'operator_agreement' && toSign[0].version === current, toSign);
    await prisma.agreementAcceptance.create({ data: { courseId: course.id, document: 'operator_agreement', version: current, textHash: doc.hash, signerName: 'Alex', signerTitle: 'Owner', signerEmail: 'a@x', authorityAttested: true } });
    check('the banner clears after signing', (await agreementReacceptance(course.id)) === null);
    const after = await agreementStatus(course.id);
    check('nothing left to sign', after.documents.every(d => !d.needsSigning), after.documents);
  } finally {
    await cleanup();
    if (!before) await prisma.agreementVersion.deleteMany({ where: { document: 'operator_agreement', version: current } });
  }
}

main()
  .then(async () => { await prisma.$disconnect(); if (failed) { console.error(`${failed} failed`); process.exit(1); } console.log('agreement-resign: all passed'); })
  .catch(async e => { console.error(e); await cleanup().catch(() => {}); await prisma.$disconnect(); process.exit(1); });
