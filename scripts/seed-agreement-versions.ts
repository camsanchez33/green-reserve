// AG-1 §2 — insert an AgreementVersion row for every document version on
// disk. Idempotent. REFUSES to run if a file's hash differs from the stored
// row for the same version: versions are immutable — bump instead.
// Run: npx dotenv -e .env.local -- npx tsx scripts/seed-agreement-versions.ts
// The same step is Admin → System → Agreement versions → Publish (owner only),
// which needs no local database access; both go through publishAgreementVersion().
import { prisma } from '../src/lib/prisma';
import { DOCUMENT_DIR, listVersions, loadDocument, type AgreementDocument } from '../src/lib/agreements';
import { publishAgreementVersion } from '../src/lib/agreement-publish';

async function main() {
  let inserted = 0, unchanged = 0;
  for (const document of Object.keys(DOCUMENT_DIR) as AgreementDocument[]) {
    for (const version of listVersions(document)) {
      // AG-3 §1: a bump that requires re-acceptance is a legal event — it
      // refuses to seed until counsel has reviewed it (`counselReviewed: <date>`)
      // or Cam has recorded a waiver (`counselWaived: <date> by <who>` — never a
      // fake review date), and it takes effect NOW with a 30-day window,
      // whatever the file's effectiveAt says.
      const r = await publishAgreementVersion(document, version);
      if (!r.ok) throw new Error(`${document} ${version}: ${r.error}`);
      if (!r.created) { unchanged++; continue; }
      if (r.waived) console.warn(`${document} ${version}: seeding WITHOUT counsel review — waived: ${loadDocument(document, version).counselWaived}`);
      inserted++;
      console.log(`inserted ${document} ${version} ${loadDocument(document, version).hash.slice(0, 12)}`);
    }
  }
  console.log(`done — ${inserted} inserted, ${unchanged} already present`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
