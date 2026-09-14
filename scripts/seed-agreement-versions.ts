// AG-1 §2 — insert an AgreementVersion row for every document version on
// disk. Idempotent. REFUSES to run if a file's hash differs from the stored
// row for the same version: versions are immutable — bump instead.
// Run: npx dotenv -e .env.local -- npx tsx scripts/seed-agreement-versions.ts
import { prisma } from '../src/lib/prisma';
import { DOCUMENT_DIR, listVersions, loadDocument, type AgreementDocument } from '../src/lib/agreements';

async function main() {
  let inserted = 0, unchanged = 0;
  for (const document of Object.keys(DOCUMENT_DIR) as AgreementDocument[]) {
    for (const version of listVersions(document)) {
      const doc = loadDocument(document, version);
      const existing = await prisma.agreementVersion.findUnique({ where: { document_version: { document, version } } });
      if (existing) {
        if (existing.textHash !== doc.hash) {
          throw new Error(`${document} ${version}: file hash ${doc.hash.slice(0, 12)} differs from the stored ${existing.textHash.slice(0, 12)} — versions are immutable; bump the version instead.`);
        }
        unchanged++; continue;
      }
      // AG-3 §1: a bump that requires re-acceptance is a legal event — it
      // refuses to seed until counsel has reviewed it (front matter
      // `counselReviewed: <date>`), and it takes effect NOW with a 30-day
      // window, whatever the file's effectiveAt says.
      if (doc.reacceptRequired && !doc.counselReviewed) {
        throw new Error(`${document} ${version}: reacceptRequired is set but the front matter has no counselReviewed date — not seeding a re-acceptance bump counsel has not reviewed.`);
      }
      if (doc.reacceptRequired && doc.draft) {
        throw new Error(`${document} ${version}: still marked as a draft — remove the draft marker before seeding a re-acceptance bump.`);
      }
      const now = new Date();
      const effectiveAt = doc.reacceptRequired ? now : new Date(doc.effectiveAt + 'T00:00:00.000Z');
      await prisma.agreementVersion.create({
        data: {
          document, version, textHash: doc.hash,
          effectiveAt,
          reacceptBy: doc.reacceptRequired ? new Date(effectiveAt.getTime() + 30 * 86_400_000) : null,
        },
      });
      inserted++;
      console.log(`inserted ${document} ${version} ${doc.hash.slice(0, 12)}`);
    }
  }
  console.log(`done — ${inserted} inserted, ${unchanged} already present`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
