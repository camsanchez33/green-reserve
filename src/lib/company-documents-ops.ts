// Server only. Company docs data (Cam 2026-11-17): what the Company docs routes
// do, with storage passed in (DocStore) so tests run it against a fake store and
// a real database. The routes only gate (companyDocsGate), parse and answer.
//
// Documents: a CompanyDocument row with its versions (Replace keeps the old
// file). A file already in storage with no row is a "legacy" document, shown as
// before (label from its folder) under `legacy:<pathname>`. It gets a row the
// first time it is relabelled, renamed or replaced; deleting one removes the
// file and makes no row. No backfill.

import { list, head, del } from '@vercel/blob';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { COMPANY_DOC_PREFIX, describeCompanyPath, isAllowedCompanyPath, companyDocPathOf } from '@/lib/company-documents';
import { allLabels, labelExists, cleanName, defaultDocName, adoptLegacy, legacyId, legacyPathOf, DOC_NAME_MAX, type StoredFile } from '@/lib/company-documents-data';
import { auditAdmin } from '@/lib/admin-audit';

export type DocStore = {
  list(prefix: string, cursor?: string): Promise<{ blobs: StoredFile[]; cursor?: string }>;
  head(url: string): Promise<(StoredFile & { contentType: string }) | null>;
  del(urls: string[]): Promise<void>;
};
export type Actor = { adminId: string; name: string };
export type OpResult = { status: number; body: Record<string, unknown> };
const answer = (status: number, body: Record<string, unknown>): OpResult => ({ status, body });
const isP = (e: unknown, code: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;

/** The private Blob store, through the store token. */
export function blobStore(token: string): DocStore {
  return {
    async list(prefix, cursor) {
      const page = await list({ prefix, token, limit: 1000, cursor });
      return { blobs: page.blobs.map(b => ({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt })), cursor: page.hasMore ? page.cursor : undefined };
    },
    async head(url) {
      const m = await head(url, { token }).catch(() => null);
      return m && { url: m.url, pathname: m.pathname, size: m.size, contentType: m.contentType, uploadedAt: m.uploadedAt };
    },
    async del(urls) { await del(urls, { token }); },
  };
}

async function storedFiles(store: DocStore): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list(COMPANY_DOC_PREFIX, cursor);
    out.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  return out;
}

/** One file by its exact path (list by prefix, then exact match), or null. */
async function legacyFile(store: DocStore, pathname: string): Promise<StoredFile | null> {
  const page = await store.list(pathname);
  return page.blobs.find(b => b.pathname === pathname) ?? null;
}

/** Every label (with how many documents each holds, legacy files included) and every document, newest first. */
export async function listDocuments(store: DocStore) {
  const [files, docs, labels] = await Promise.all([
    storedFiles(store),
    prisma.companyDocument.findMany({ include: { versions: { orderBy: { version: 'desc' } } } }),
    allLabels(),
  ]);
  const known = new Set(docs.flatMap(d => d.versions.map(v => v.pathname)));
  const labelKeys = new Set(labels.map(l => l.key));
  const documents = [
    ...docs.filter(d => d.versions.length).map(d => {
      const v = d.versions[0];
      // A label removed under it (never normally: removing asks where to move them) reads as Other.
      const label = labelKeys.has(d.label) ? d.label : 'other';
      return { id: d.id, name: d.name, label, category: label, version: v.version, url: v.url, pathname: v.pathname, size: v.size, contentType: v.contentType, uploadedAt: v.createdAt.toISOString(), legacy: false };
    }),
    ...files.filter(f => !known.has(f.pathname)).map(f => {
      const { category, name } = describeCompanyPath(f.pathname);
      return { id: legacyId(f.pathname), name: defaultDocName(f.pathname), fileName: name, label: category, category, version: 1, url: f.url, pathname: f.pathname, size: f.size, contentType: '', uploadedAt: f.uploadedAt.toISOString(), legacy: true };
    }),
  ].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const counts = new Map<string, number>();
  for (const d of documents) counts.set(d.label, (counts.get(d.label) ?? 0) + 1);
  return { labels: labels.map(l => ({ ...l, count: counts.get(l.key) ?? 0 })), documents };
}

/** After a browser upload: a new document, or with documentId a Replace (the next version; earlier files stay). */
export async function recordUpload(store: DocStore, actor: Actor, body: { url?: unknown; label?: unknown; name?: unknown; documentId?: unknown } | null): Promise<OpResult> {
  const url = typeof body?.url === 'string' ? body.url : '';
  if (!url || !companyDocPathOf(url)) return answer(400, { error: 'Missing or wrong file address' });
  const meta = await store.head(url);
  if (!meta) return answer(400, { error: 'The uploaded file was not found in storage. Try the upload again.' });
  if (!isAllowedCompanyPath(meta.pathname)) return answer(403, { error: 'That file is not a company document' });
  const version = { url: meta.url, pathname: meta.pathname, size: meta.size, contentType: meta.contentType ?? '', uploadedById: actor.adminId, uploadedByName: actor.name };
  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
  try {
    if (documentId) {
      const legacyPath = legacyPathOf(documentId);
      const old = legacyPath ? await legacyFile(store, legacyPath) : null;
      if (legacyPath && !old) return answer(404, { error: 'The document being replaced is no longer in storage.' });
      const done = await prisma.$transaction(async tx => {
        if (await tx.companyDocumentVersion.findUnique({ where: { pathname: meta.pathname }, select: { id: true } })) return answer(409, { error: 'That file is already saved.' });
        const id = old ? await adoptLegacy(tx, old, null) : documentId;
        const doc = await tx.companyDocument.findUnique({ where: { id }, select: { id: true, versions: { orderBy: { version: 'desc' }, take: 1, select: { version: true } } } });
        if (!doc) return answer(404, { error: 'That document was not found — refresh and try again.' });
        const next = (doc.versions[0]?.version ?? 0) + 1;
        await tx.companyDocumentVersion.create({ data: { documentId: doc.id, version: next, ...version } });
        await tx.companyDocument.update({ where: { id: doc.id }, data: { updatedAt: new Date() } });
        return answer(200, { success: true, id: doc.id, version: next });
      });
      if (done.status === 200) {
        await auditAdmin(actor, { action: 'company_document_replace', targetType: 'company_document', targetId: String(done.body.id), detail: `version ${done.body.version} (${meta.pathname})`, after: { version: done.body.version, pathname: meta.pathname } });
      }
      return done;
    }
    const label = body?.label === undefined ? describeCompanyPath(meta.pathname).category : typeof body.label === 'string' ? body.label : '';
    if (!(await labelExists(label))) return answer(400, { error: 'Pick a label for the document.' });
    const name = body?.name === undefined ? defaultDocName(meta.pathname) : cleanName(body.name, DOC_NAME_MAX);
    if (!name) return answer(400, { error: `Give the document a name (up to ${DOC_NAME_MAX} characters).` });
    const doc = await prisma.companyDocument.create({ data: { name, label, versions: { create: { version: 1, ...version } } }, select: { id: true } });
    await auditAdmin(actor, { action: 'company_document_add', targetType: 'company_document', targetId: doc.id, detail: meta.pathname, after: { name, label, pathname: meta.pathname } });
    return answer(200, { success: true, id: doc.id, version: 1 });
  } catch (e) {
    // The same file saved twice, or two Replaces racing for one version number.
    if (isP(e, 'P2002')) return answer(409, { error: 'That document changed at the same moment — refresh and try again.' });
    throw e;
  }
}

/** One document: details, versions (newest first) and its history. */
export async function documentDetails(store: DocStore, id: string, history: (docId: string, paths: string[]) => Promise<unknown[]>): Promise<OpResult> {
  const legacyPath = legacyPathOf(id);
  if (legacyPath) {
    const known = await prisma.companyDocumentVersion.findUnique({ where: { pathname: legacyPath }, select: { documentId: true } });
    if (known) return answer(409, { error: 'That document changed — refresh and try again.', id: known.documentId });
    const f = await legacyFile(store, legacyPath);
    if (!f) return answer(404, { error: 'That document was not found.' });
    return answer(200, {
      document: { id, name: defaultDocName(f.pathname), label: describeCompanyPath(f.pathname).category, version: 1, legacy: true },
      versions: [{ version: 1, url: f.url, pathname: f.pathname, size: f.size, contentType: '', uploadedBy: '', uploadedAt: f.uploadedAt.toISOString() }],
      history: await history(id, [legacyPath]),
    });
  }
  const doc = await prisma.companyDocument.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' } } } });
  if (!doc) return answer(404, { error: 'That document was not found.' });
  return answer(200, {
    document: { id: doc.id, name: doc.name, label: doc.label, version: doc.versions[0]?.version ?? 0, legacy: false, createdAt: doc.createdAt.toISOString() },
    versions: doc.versions.map(v => ({ version: v.version, url: v.url, pathname: v.pathname, size: v.size, contentType: v.contentType, uploadedBy: v.uploadedByName, uploadedAt: v.createdAt.toISOString() })),
    history: await history(doc.id, doc.versions.map(v => v.pathname)),
  });
}

/** Change a document's label and/or name. A legacy file gets its row here, only when something actually changes. */
export async function updateDocument(store: DocStore, actor: Actor, id: string, body: { label?: unknown; name?: unknown } | null): Promise<OpResult> {
  if (!body || (body.label === undefined && body.name === undefined)) return answer(400, { error: 'Nothing to change.' });
  if (body.label !== undefined && !(await labelExists(body.label))) return answer(400, { error: 'That label doesn’t exist — refresh and pick again.' });
  const name = body.name === undefined ? undefined : cleanName(body.name, DOC_NAME_MAX);
  if (name === null) return answer(400, { error: `Give the document a name (up to ${DOC_NAME_MAX} characters).` });
  const label = body.label as string | undefined;

  const legacyPath = legacyPathOf(id);
  const old = legacyPath ? await legacyFile(store, legacyPath) : null;
  if (legacyPath && !old) return answer(404, { error: 'That document was not found.' });
  if (old && (label ?? describeCompanyPath(old.pathname).category) === describeCompanyPath(old.pathname).category && (name ?? defaultDocName(old.pathname)) === defaultDocName(old.pathname)) {
    return answer(200, { document: { id, name: defaultDocName(old.pathname), label: describeCompanyPath(old.pathname).category } });
  }
  let result;
  try {
    result = await prisma.$transaction(async tx => {
      const docId = old ? await adoptLegacy(tx, old, null) : id;
      const before = await tx.companyDocument.findUnique({ where: { id: docId }, select: { name: true, label: true } });
      if (!before) return null;
      const after = await tx.companyDocument.update({ where: { id: docId }, data: { ...(label !== undefined ? { label } : {}), ...(name !== undefined ? { name } : {}) }, select: { id: true, name: true, label: true } });
      return { before, after };
    });
  } catch (e) {
    if (isP(e, 'P2002')) return answer(409, { error: 'That document changed at the same moment — refresh and try again.' });
    throw e;
  }
  if (!result) return answer(404, { error: 'That document was not found.' });
  const labelChanged = result.before.label !== result.after.label, nameChanged = result.before.name !== result.after.name;
  if (labelChanged) await auditAdmin(actor, { action: 'company_document_relabel', targetType: 'company_document', targetId: result.after.id, before: { label: result.before.label }, after: { label: result.after.label } });
  if (nameChanged) await auditAdmin(actor, { action: 'company_document_rename', targetType: 'company_document', targetId: result.after.id, before: { name: result.before.name }, after: { name: result.after.name } });
  return answer(200, { document: result.after });
}

/**
 * Delete a document and every version's file (or a legacy file). The caller has
 * already required a reason. `confirm` is the FRESH second-factor check
 * (freshStepUpRequired); it runs last, right before the files go, so a refused
 * request never spends the confirm.
 */
export async function deleteDocument(store: DocStore, actor: Actor, ref: { id?: string; url?: string }, reason: string, confirm: () => Promise<boolean>): Promise<OpResult> {
  let id = ref.id || '';
  if (!id && ref.url) {
    const p = companyDocPathOf(ref.url);
    if (!p) return answer(400, { error: 'That is not a company document' });
    const v = await prisma.companyDocumentVersion.findUnique({ where: { pathname: p }, select: { documentId: true } });
    id = v ? v.documentId : legacyId(p);
  }
  const legacyPath = legacyPathOf(id);
  let files: { url: string; pathname: string }[];
  let doc: { id: string; name: string; label: string } | null = null;
  if (legacyPath) {
    if (await prisma.companyDocumentVersion.findUnique({ where: { pathname: legacyPath }, select: { id: true } })) {
      return answer(409, { error: 'That document changed — refresh and try again.' });
    }
    const f = await legacyFile(store, legacyPath);
    if (!f) return answer(404, { error: 'That document was not found — refresh and try again.' });
    files = [f];
  } else {
    const d = id ? await prisma.companyDocument.findUnique({ where: { id }, select: { id: true, name: true, label: true, versions: { select: { url: true, pathname: true } } } }) : null;
    if (!d) return answer(404, { error: 'That document was not found — refresh and try again.' });
    doc = { id: d.id, name: d.name, label: d.label };
    files = d.versions;
  }

  if (!(await confirm())) return answer(403, { error: 'Confirm it’s you to do this.', code: 'step_up' });

  try {
    if (files.length) await store.del(files.map(f => f.url));
  } catch {
    return answer(502, { error: 'Storage would not delete that file. Try again.' });
  }
  if (doc) {
    try { await prisma.companyDocument.delete({ where: { id: doc.id } }); }
    catch (e) { if (!isP(e, 'P2025')) throw e; } // already gone: the same delete twice
  }
  await auditAdmin(actor, {
    action: 'company_document_delete', targetType: 'company_document', targetId: doc ? doc.id : legacyPath!,
    reason, detail: files.map(f => f.pathname).join(', ').slice(0, 1000),
    before: doc ? { name: doc.name, label: doc.label, versions: files.length } : { pathname: legacyPath },
  });
  return answer(200, { success: true });
}

/** Remove one of Cam's labels; one holding documents needs moveTo and moves them there first. */
export async function removeLabel(actor: Actor, id: string, moveTo: string): Promise<OpResult> {
  const label = id ? await prisma.companyDocLabel.findUnique({ where: { id }, select: { name: true } }) : null;
  if (!label) return answer(404, { error: 'Only your own labels can be removed.' });
  if (moveTo && (moveTo === id || !(await labelExists(moveTo)))) return answer(400, { error: 'Pick another label to move its documents to.' });
  const r = await prisma.$transaction(async tx => {
    const held = await tx.companyDocument.count({ where: { label: id } });
    if (held && !moveTo) return { held, moved: -1 };
    const moved = held ? (await tx.companyDocument.updateMany({ where: { label: id }, data: { label: moveTo } })).count : 0;
    await tx.companyDocLabel.delete({ where: { id } });
    return { held, moved };
  });
  if (r.moved < 0) return answer(409, { error: `This label holds ${r.held} document${r.held === 1 ? '' : 's'}. Pick where to move ${r.held === 1 ? 'it' : 'them'} first.`, code: 'move_required', count: r.held });
  await auditAdmin(actor, { action: 'company_doc_label_remove', targetType: 'company_doc_label', targetId: id, before: { name: label.name }, after: r.moved ? { movedTo: moveTo, documents: r.moved } : undefined });
  return answer(200, { success: true, moved: r.moved });
}

/** Every open goes in the document's history. */
export async function auditOpen(actor: Actor, pathname: string) {
  const v = await prisma.companyDocumentVersion.findUnique({ where: { pathname }, select: { documentId: true, version: true } });
  await auditAdmin(actor, { action: 'company_document_open', targetType: 'company_document', targetId: v ? v.documentId : pathname, detail: v ? `version ${v.version}` : pathname });
}
