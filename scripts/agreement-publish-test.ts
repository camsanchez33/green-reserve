// AG-3 publish against a real database (CI has Postgres, migrated): the Admin →
// System button and the seed script share publishAgreementVersion().
import { prisma } from '../src/lib/prisma';
import { publishAgreementVersion } from '../src/lib/agreement-publish';
import { loadDocument } from '../src/lib/agreements';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
}

const KEYS = [
  { document: 'operator_agreement', version: '2026-11' },
  { document: 'operator_agreement', version: '2026-08' },
];

async function main() {
  // Leave whatever was there before exactly as it was.
  const before = await prisma.agreementVersion.findMany({ where: { OR: KEYS } });
  await prisma.agreementVersion.deleteMany({ where: { OR: KEYS } });
  try {
    const now = new Date('2026-10-12T15:00:00.000Z');
    const r = await publishAgreementVersion('operator_agreement', '2026-11', now);
    check('publishes the current version', r.ok && r.created === true, JSON.stringify(r));
    const row = await prisma.agreementVersion.findUnique({ where: { document_version: { document: 'operator_agreement', version: '2026-11' } } });
    check('stores the file hash', row?.textHash === loadDocument('operator_agreement', '2026-11').hash);
    check('takes effect at publish time with a 30-day window',
      row?.effectiveAt.toISOString() === now.toISOString() && row?.reacceptBy?.toISOString() === '2026-11-11T15:00:00.000Z',
      `${row?.effectiveAt.toISOString()} ${row?.reacceptBy?.toISOString()}`);
    check('a waived publish says so', r.ok && r.created === true && r.waived === true);

    const again = await publishAgreementVersion('operator_agreement', '2026-11');
    check('publishing again creates nothing', again.ok && again.created === false, JSON.stringify(again));

    const race = await Promise.all([1, 2, 3].map(() => publishAgreementVersion('operator_agreement', '2026-08')));
    const rows = await prisma.agreementVersion.count({ where: { document: 'operator_agreement', version: '2026-08' } });
    check('three publishes at once make one row', rows === 1 && race.every(x => x.ok), JSON.stringify(race));

    await prisma.agreementVersion.update({ where: { document_version: { document: 'operator_agreement', version: '2026-08' } }, data: { textHash: 'not-the-file' } });
    const changed = await publishAgreementVersion('operator_agreement', '2026-08');
    check('a file changed after publishing is refused', !changed.ok && changed.status === 409, JSON.stringify(changed));

    const bogusDoc = await publishAgreementVersion('toString', '2026-11');
    check('an unknown document is a 400, not a crash', !bogusDoc.ok && bogusDoc.status === 400, JSON.stringify(bogusDoc));
    const bogusVersion = await publishAgreementVersion('operator_agreement', '../../etc/passwd');
    check('a version not on disk is a 404', !bogusVersion.ok && bogusVersion.status === 404, JSON.stringify(bogusVersion));
  } finally {
    await prisma.agreementVersion.deleteMany({ where: { OR: KEYS } });
    for (const b of before) {
      const { id: _id, ...data } = b;
      await prisma.agreementVersion.create({ data });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    if (failed) { console.error(`${failed} failed`); process.exit(1); }
    console.log('agreement-publish: all passed');
  })
  .catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });
