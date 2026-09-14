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
      await prisma.agreementVersion.create({
        data: {
          document, version, textHash: doc.hash,
          effectiveAt: new Date(doc.effectiveAt + 'T00:00:00.000Z'),
          reacceptBy: null, // AG-3 sets this on a bump that requires re-acceptance
        },
      });
      inserted++;
      console.log(`inserted ${document} ${version} ${doc.hash.slice(0, 12)}`);
    }
  }
  console.log(`done — ${inserted} inserted, ${unchanged} already present`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
