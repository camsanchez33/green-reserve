// AG-1 §3 — turn every legacy OPERATOR_AGREEMENT_ACCEPTED timeline line into
// an AgreementAcceptance row (legacy: true, no signer, hash of the stored
// version's file). Idempotent: a course+version that already has a row is
// skipped. The timeline line is left in place as history.
// Run: npx dotenv -e .env.local -- npx tsx scripts/migrate-agreement-lines.ts
import { prisma } from '../src/lib/prisma';
import { AGREEMENT_ACCEPTED_PREFIX } from '../src/lib/course-timeline';
import { listVersions, loadDocument } from '../src/lib/agreements';

async function main() {
  const events = await prisma.inquiryStatusEvent.findMany({
    where: { actorName: { startsWith: AGREEMENT_ACCEPTED_PREFIX } },
    select: { createdAt: true, actorName: true, inquiry: { select: { builtCourseId: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const onDisk = new Set(listVersions('operator_agreement'));
  let inserted = 0, skipped = 0, orphan = 0;
  for (const ev of events) {
    const courseId = ev.inquiry?.builtCourseId;
    if (!courseId) { orphan++; continue; }
    let payload: { version?: string; acceptedBy?: string } = {};
    try { payload = JSON.parse((ev.actorName ?? '').slice(AGREEMENT_ACCEPTED_PREFIX.length)); } catch { /* unreadable line */ }
    const version = payload.version || '2026-08';
    const exists = await prisma.agreementAcceptance.findFirst({ where: { courseId, document: 'operator_agreement', version } });
    if (exists) { skipped++; continue; }
    const hash = onDisk.has(version) ? loadDocument('operator_agreement', version).hash : '';
    await prisma.agreementAcceptance.create({
      data: {
        courseId, document: 'operator_agreement', version, textHash: hash,
        signerName: '', signerTitle: '', signerEmail: payload.acceptedBy ?? '',
        legacy: true, acceptedAt: ev.createdAt,
      },
    });
    inserted++;
  }
  console.log(`done — ${inserted} inserted, ${skipped} already present, ${orphan} lines with no built course`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
