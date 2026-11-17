// Company docs data (Cam 2026-11-17): labels, legacy adoption, history, and
// the FRESH second-factor check that guards delete. Run:
//   npx tsx scripts/company-docs-db-test.ts   (needs DATABASE_URL)
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { prisma } from '../src/lib/prisma';
import { freshStepUpRequired, type AdminSession } from '../src/lib/admin-session';
import { allLabels, labelExists, adoptLegacy, documentHistory, cleanName, legacyId, legacyPathOf, defaultDocName } from '../src/lib/company-documents-data';
import { auditAdmin } from '../src/lib/admin-audit';

let failed = 0;
const ok = (l: string, c: boolean, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + i}`); if (!c) failed++; };
const EMAIL = 'codocs-test@t.local';
async function cleanup() {
  const v = await prisma.companyDocumentVersion.findMany({ where: { pathname: { startsWith: 'company/tax/codocs-test' } }, select: { documentId: true } });
  await prisma.companyDocument.deleteMany({ where: { id: { in: v.map(x => x.documentId) } } });
  await prisma.companyDocLabel.deleteMany({ where: { name: { startsWith: 'Codocs test' } } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
}

(async () => {
  // Static: every Company docs route goes through the owner gate.
  const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('route.ts') ? [p] : []; });
  for (const f of walk('src/app/api/admin/company-documents')) {
    const src = readFileSync(f, 'utf8');
    ok(`${f} is owner-only`, src.includes('companyDocsGate()') || (src.includes('OWNER_ONLY') && src.includes("areaGate(session, 'company')")));
  }
  const main = readFileSync('src/app/api/admin/company-documents/route.ts', 'utf8');
  const del = main.slice(main.indexOf('export async function DELETE'));
  ok('delete asks for a reason and a fresh second factor', del.includes("needReason('company_document_delete'") && del.includes('freshStepUpRequired('));
  ok('…and checks the second factor after everything else, right before deleting', del.indexOf('freshStepUpRequired(') < del.indexOf('await del(') && del.indexOf('not found') < del.indexOf('freshStepUpRequired('));

  await cleanup();
  const owner = await prisma.adminUser.create({ data: { email: EMAIL, name: 'Codocs Owner', role: 'owner', passwordHash: 'x' } });
  const signedIn = new Date(Date.now() - 60_000);
  const s = await prisma.ownerSession.create({ data: { adminId: owner.id, method: 'totp', createdAt: signedIn, stepUpAt: signedIn, expiresAt: new Date(Date.now() + 3600_000) } });
  const sess = (stepUpAt: Date | null, extra: Partial<AdminSession> = {}): AdminSession => ({ adminId: owner.id, email: EMAIL, name: 'Codocs Owner', role: 'owner', mfa: true, ownerSessionId: s.id, stepUpAt, ownerSessionCreatedAt: signedIn, ...extra });

  ok('signing in alone is not a fresh check', (await freshStepUpRequired(sess(signedIn)))?.status === 403);
  const confirmed = new Date();
  await prisma.ownerSession.update({ where: { id: s.id }, data: { stepUpAt: confirmed } });
  ok('an employee never passes', (await freshStepUpRequired(sess(confirmed, { role: 'manager' })))?.status === 403);
  ok('a confirm made just now passes', (await freshStepUpRequired(sess(confirmed))) === null);
  ok('…and is used up', (await prisma.ownerSession.findUniqueOrThrow({ where: { id: s.id } })).stepUpAt === null);
  ok('…so the same confirm cannot pass twice', (await freshStepUpRequired(sess(confirmed))) !== null);
  const stale = new Date(Date.now() - 3 * 60_000);
  await prisma.ownerSession.update({ where: { id: s.id }, data: { stepUpAt: stale } });
  ok('a confirm older than two minutes does not pass', (await freshStepUpRequired(sess(stale))) !== null);
  const twin = new Date();
  await prisma.ownerSession.update({ where: { id: s.id }, data: { stepUpAt: twin } });
  const both = await Promise.all([freshStepUpRequired(sess(twin)), freshStepUpRequired(sess(twin))]);
  ok('two deletes racing on one confirm: only one passes', both.filter(x => x === null).length === 1);
  await prisma.ownerSession.update({ where: { id: s.id }, data: { stepUpAt: new Date(), revokedAt: new Date() } });
  const revoked = await prisma.ownerSession.findUniqueOrThrow({ where: { id: s.id } });
  ok('a signed-out session does not pass', (await freshStepUpRequired(sess(revoked.stepUpAt))) !== null);

  // Labels.
  const before = await allLabels();
  ok('the six built-in labels come first', before.slice(0, 6).map(l => l.key).join() === 'formation,tax,banking,insurance,contracts,other' && before.slice(0, 6).every(l => l.builtIn));
  const mine = await prisma.companyDocLabel.create({ data: { name: 'Codocs test Trademark' } });
  ok('Cam’s label is listed and exists', (await allLabels()).some(l => l.key === mine.id && !l.builtIn) && (await labelExists(mine.id)));
  ok('a built-in label exists; a made-up one does not', (await labelExists('tax')) && !(await labelExists('nope')) && !(await labelExists(123)));
  ok('names are trimmed to one line and bounded', cleanName('  A\nB  ', 40) === 'A B' && cleanName('', 40) === null && cleanName('x'.repeat(41), 40) === null);

  // Legacy files.
  const path = 'company/tax/codocs-test-ein-letter-AbCdEfGhIjKlMnOpQrStUv.pdf';
  ok('a legacy id round-trips; a bad path is refused', legacyPathOf(legacyId(path)) === path && legacyPathOf('legacy:../x') === null && legacyPathOf('abc') === null);
  ok('the default name drops the storage suffix and extension', defaultDocName(path) === 'codocs-test-ein-letter');
  const file = { url: 'https://x.private.blob.vercel-storage.com/' + path, pathname: path, size: 1234, uploadedAt: new Date('2026-10-01T12:00:00Z') };
  const id1 = await prisma.$transaction(tx => adoptLegacy(tx, file, null));
  const id2 = await prisma.$transaction(tx => adoptLegacy(tx, file, null));
  const doc = await prisma.companyDocument.findUniqueOrThrow({ where: { id: id1 }, include: { versions: true } });
  ok('a legacy file becomes a document once (label from its folder, version 1)', id1 === id2 && doc.label === 'tax' && doc.versions.length === 1 && doc.versions[0].version === 1);

  // History reads entries naming the path (before this change) and the document id.
  await auditAdmin({ adminId: owner.id, name: 'Codocs Owner' }, { action: 'company_document_add', targetType: 'company_document', targetId: path });
  await auditAdmin({ adminId: owner.id, name: 'Codocs Owner' }, { action: 'company_document_open', targetType: 'company_document', targetId: id1, detail: 'version 1' });
  await auditAdmin({ adminId: owner.id, name: 'Codocs Owner' }, { action: 'note_add', targetType: 'company_document', targetId: id1 });
  const h = await documentHistory(id1, [path]);
  ok('history has the upload and the open, newest first, and nothing else', h.length === 2 && h[0].what === 'Opened' && h[1].what === 'Uploaded' && h[0].who === 'Codocs Owner', JSON.stringify(h));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('company-docs-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
