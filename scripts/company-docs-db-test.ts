// Company docs data (Cam 2026-11-17): labels, legacy adoption, history, and
// the FRESH second-factor check that guards delete. Run:
//   npx tsx scripts/company-docs-db-test.ts   (needs DATABASE_URL)
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { prisma } from '../src/lib/prisma';
import { freshStepUpRequired, type AdminSession } from '../src/lib/admin-session';
import { markStepUp } from '../src/lib/owner-session';
import { allLabels, labelExists, adoptLegacy, documentHistory, cleanName, legacyId, legacyPathOf, defaultDocName } from '../src/lib/company-documents-data';
import { auditAdmin } from '../src/lib/admin-audit';
import { recordUpload, deleteDocument, updateDocument, removeLabel, listDocuments, auditOpen, documentDetails, type DocStore } from '../src/lib/company-documents-ops';

let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
const EMAIL = 'codocs-test@t.local';
async function cleanup() {
  const v = await prisma.companyDocumentVersion.findMany({ where: { pathname: { contains: 'codocs-test' } }, select: { documentId: true } });
  await prisma.companyDocument.deleteMany({ where: { id: { in: v.map(x => x.documentId) } } });
  await prisma.companyDocLabel.deleteMany({ where: { name: { startsWith: 'Codocs test' } } });
  await prisma.adminAuditLog.deleteMany({ where: { admin: { email: EMAIL } } });
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
  const delRoute = main.slice(main.indexOf('export async function DELETE'));
  ok('the delete route asks for a reason and passes the fresh second-factor check', delRoute.includes("needReason('company_document_delete'") && delRoute.includes('freshStepUpRequired('));

  await cleanup();
  const owner = await prisma.adminUser.create({ data: { email: EMAIL, name: 'Codocs Owner', role: 'owner', passwordHash: 'x' } });
  const signedIn = new Date(Date.now() - 60_000);
  // A sign-in stamps stepUpAt (createOwnerSession) but never stepUpFresh.
  const s = await prisma.ownerSession.create({ data: { adminId: owner.id, method: 'totp', createdAt: signedIn, stepUpAt: signedIn, expiresAt: new Date(Date.now() + 3600_000) } });
  /** The session as resolveAdminSession builds it from the row, right now. */
  const live = async (extra: Partial<AdminSession> = {}): Promise<AdminSession> => {
    const r = await prisma.ownerSession.findUniqueOrThrow({ where: { id: s.id } });
    return { adminId: owner.id, email: EMAIL, name: 'Codocs Owner', role: 'owner', mfa: true, ownerSessionId: s.id, stepUpAt: r.stepUpAt, stepUpFresh: r.stepUpFresh, ...extra };
  };

  ok('signing in alone is not a fresh check', (await freshStepUpRequired(await live()))?.status === 403);
  await markStepUp(s.id);
  ok('an employee never passes', (await freshStepUpRequired(await live({ role: 'manager' })))?.status === 403);
  const confirmed = await live();
  ok('a confirm made just now passes', (await freshStepUpRequired(confirmed)) === null);
  const after = await prisma.ownerSession.findUniqueOrThrow({ where: { id: s.id } });
  ok('…and is used up, while the ordinary 5-minute window keeps its full time', !after.stepUpFresh && after.stepUpAt?.getTime() === confirmed.stepUpAt?.getTime());
  ok('…so the same confirm cannot pass twice, even replayed as it was', (await freshStepUpRequired(confirmed)) !== null && (await freshStepUpRequired(await live())) !== null);
  // A confirm stamped by a server whose clock runs ahead: single use must not depend on clocks.
  const ahead = new Date(Date.now() + 1500);
  await prisma.ownerSession.update({ where: { id: s.id }, data: { stepUpAt: ahead, stepUpFresh: true } });
  const aheadSess = await live();
  ok('a confirm stamped by a clock 1.5 s ahead passes once…', (await freshStepUpRequired(aheadSess)) === null);
  ok('…and only once', (await freshStepUpRequired(aheadSess)) !== null);
  await prisma.ownerSession.update({ where: { id: s.id }, data: { stepUpAt: new Date(Date.now() - 3 * 60_000), stepUpFresh: true } });
  ok('a confirm older than two minutes does not pass', (await freshStepUpRequired(await live())) !== null);
  await markStepUp(s.id);
  const twin = await live();
  const both = await Promise.all([freshStepUpRequired(twin), freshStepUpRequired(twin)]);
  ok('two deletes racing on one confirm: only one passes', both.filter(x => x === null).length === 1);
  await markStepUp(s.id);
  await prisma.ownerSession.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
  ok('a signed-out session does not pass', (await freshStepUpRequired(await live())) !== null);

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


  // ── What the routes do, against a fake store ─────────────────────────────
  const HOST = 'https://abc.private.blob.vercel-storage.com/';
  const store = new Map<string, { url: string; pathname: string; size: number; uploadedAt: Date }>();
  const put = (pathname: string, at = new Date()) => { const f = { url: HOST + pathname, pathname, size: 100, uploadedAt: at }; store.set(pathname, f); return f; };
  let delFails = false;
  const fake: DocStore = {
    async list(prefix) { return { blobs: [...store.values()].filter(b => b.pathname.startsWith(prefix)) }; },
    async head(url) { const f = [...store.values()].find(b => b.url === url); return f ? { ...f, contentType: 'application/pdf' } : null; },
    async del(urls) { if (delFails) throw new Error('down'); for (const u of urls) for (const [k, b] of store) if (b.url === u) store.delete(k); },
  };
  const actor = { adminId: owner.id, name: 'Codocs Owner' };
  const yes = async () => true, no = async () => false;

  const a1 = put('company/contracts/codocs-test-lease-AbCdEfGhIjKlMnOpQrStUv.pdf');
  ok('an upload outside the store’s host is refused', (await recordUpload(fake, actor, { url: 'https://evil.example/' + a1.pathname })).status === 400);
  const up = await recordUpload(fake, actor, { url: a1.url, label: mine.id, name: 'Office lease' });
  ok('an upload becomes a document in the chosen label, version 1', up.status === 200 && up.body.version === 1, up.body);
  const docId = String(up.body.id);
  ok('the same file cannot be saved twice', (await recordUpload(fake, actor, { url: a1.url, label: 'tax' })).status === 409);
  ok('an unknown label is refused', (await recordUpload(fake, actor, { url: put('company/other/codocs-test-x-AbCdEfGhIjKlMnOpQrStUv.pdf').url, label: 'made-up' })).status === 400);
  const a2 = put('company/contracts/codocs-test-lease2-AbCdEfGhIjKlMnOpQrStUv.pdf');
  const rep = await recordUpload(fake, actor, { url: a2.url, replaces: docId });
  ok('Replace makes version 2 and keeps version 1', rep.status === 200 && rep.body.version === 2 && (await prisma.companyDocumentVersion.count({ where: { documentId: docId } })) === 2);
  ok('Replace of a document that isn’t there is 404', (await recordUpload(fake, actor, { url: put('company/tax/codocs-test-y-AbCdEfGhIjKlMnOpQrStUv.pdf').url, documentId: 'nope' })).status === 404);
  const r3 = put('company/contracts/codocs-test-l3-AbCdEfGhIjKlMnOpQrStUv.pdf'), r4 = put('company/contracts/codocs-test-l4-AbCdEfGhIjKlMnOpQrStUv.pdf');
  const race = await Promise.all([recordUpload(fake, actor, { url: r3.url, documentId: docId }), recordUpload(fake, actor, { url: r4.url, documentId: docId })]);
  const vs = (await prisma.companyDocumentVersion.findMany({ where: { documentId: docId }, select: { version: true } })).map(v => v.version).sort();
  ok('two Replaces at once never share a version number', vs.length === new Set(vs).size && race.every(r => r.status === 200 || r.status === 409), { vs, race: race.map(r => r.status) });

  // Legacy file: listed as before, replace adopts it.
  const old = put('company/insurance/codocs-test-policy-AbCdEfGhIjKlMnOpQrStUv.pdf', new Date('2026-09-01T00:00:00Z'));
  const listed = await listDocuments(fake);
  const lg = listed.documents.find(d => d.pathname === old.pathname);
  ok('a file with no row is listed as a legacy document in its folder’s label', !!lg && lg.legacy && lg.label === 'insurance' && lg.id === legacyId(old.pathname));
  ok('label counts include legacy files', (listed.labels.find(l => l.key === 'insurance')?.count ?? 0) >= 1);
  const noop = await updateDocument(fake, actor, legacyId(old.pathname), { label: 'insurance' });
  ok('a change that changes nothing makes no row', noop.status === 200 && !(await prisma.companyDocumentVersion.findUnique({ where: { pathname: old.pathname } })));
  const relabel = await updateDocument(fake, actor, legacyId(old.pathname), { label: mine.id });
  const adopted = String((relabel.body.document as { id: string }).id);
  ok('relabelling a legacy file gives it a row in the new label', relabel.status === 200 && (await prisma.companyDocument.findUniqueOrThrow({ where: { id: adopted } })).label === mine.id);
  const det = await documentDetails(fake, adopted, documentHistory);
  ok('its history says where it moved, in plain words', det.status === 200 && (det.body.history as { what: string }[]).some(h => h.what === 'Moved to Codocs test Trademark'), det.body.history);
  const ren = await updateDocument(fake, actor, adopted, { name: 'Insurance policy 2026' });
  const det3 = await documentDetails(fake, adopted, documentHistory);
  ok('a rename is saved and in the history', ren.status === 200 && (det3.body.history as { what: string }[]).some(h => h.what === 'Renamed'));
  ok('the old legacy id now answers 409, never a second row', (await documentDetails(fake, legacyId(old.pathname), documentHistory)).status === 409);

  const repHist = await documentDetails(fake, docId, documentHistory);
  ok('a Replace reads "Replaced (version 1 kept)"', (repHist.body.history as { what: string }[]).some(h => h.what === 'Replaced (version 1 kept)'), repHist.body.history);
  // Opening is in the history.
  await auditOpen(actor, a2.pathname);
  const det2 = await documentDetails(fake, docId, documentHistory);
  ok('an open of any version is in the document’s history', (det2.body.history as { what: string; detail: string }[]).some(h => h.what === 'Opened' && h.detail === 'version 2'));

  // Labels: removing one that holds documents needs where to move them.
  const held = await removeLabel(actor, mine.id, '');
  ok('removing a label that holds documents asks where to move them', held.status === 409 && held.body.code === 'move_required' && !!(await prisma.companyDocLabel.findUnique({ where: { id: mine.id } })));
  ok('…not to itself, nor to a label that doesn’t exist', (await removeLabel(actor, mine.id, mine.id)).status === 400 && (await removeLabel(actor, mine.id, 'nope')).status === 400);
  ok('a built-in label cannot be removed', (await removeLabel(actor, 'tax', 'other')).status === 404);
  const moved = await removeLabel(actor, mine.id, 'contracts');
  ok('with somewhere to go, its documents move and the label goes', moved.status === 200 && (await prisma.companyDocument.count({ where: { label: mine.id } })) === 0 && (await prisma.companyDocument.findUniqueOrThrow({ where: { id: docId } })).label === 'contracts');

  // Delete.
  const sizeBefore = store.size;
  const refused = await deleteDocument(fake, actor, { id: docId }, 'filed twice', no);
  ok('without a fresh confirm nothing is deleted (403 step_up)', refused.status === 403 && refused.body.code === 'step_up' && store.size === sizeBefore && !!(await prisma.companyDocument.findUnique({ where: { id: docId } })));
  let asked = false;
  ok('a document that isn’t there is 404 before the confirm is spent', (await deleteDocument(fake, actor, { id: 'nope' }, 'x', async () => { asked = true; return true; })).status === 404 && !asked);
  delFails = true;
  ok('storage refusing the delete leaves the row', (await deleteDocument(fake, actor, { id: docId }, 'filed twice', yes)).status === 502 && !!(await prisma.companyDocument.findUnique({ where: { id: docId } })));
  delFails = false;
  const versionPaths = (await prisma.companyDocumentVersion.findMany({ where: { documentId: docId }, select: { pathname: true } })).map(v => v.pathname);
  const gone = await deleteDocument(fake, actor, { url: a1.url }, 'filed twice', yes);
  ok('?url= of an old version deletes the whole document and every version’s file', gone.status === 200 && versionPaths.length >= 3 && !(await prisma.companyDocument.findUnique({ where: { id: docId } })) && !versionPaths.some(p => store.has(p)), versionPaths);
  const delRow = await prisma.adminAuditLog.findFirst({ where: { action: 'company_document_delete', targetId: docId } });
  ok('the delete is audited with its reason', delRow?.reason === 'filed twice');
  const loose = put('company/banking/codocs-test-stmt-AbCdEfGhIjKlMnOpQrStUv.pdf');
  const lgDel = await deleteDocument(fake, actor, { id: legacyId(loose.pathname) }, 'old statement', yes);
  ok('a legacy file deletes with no row made', lgDel.status === 200 && !store.has(loose.pathname) && !(await prisma.companyDocumentVersion.findUnique({ where: { pathname: loose.pathname } })));
  ok('a crafted legacy id outside company/<label>/ is refused', (await deleteDocument(fake, actor, { id: 'legacy:../secret.pdf' }, 'x', yes)).status === 404);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('company-docs-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
