import { NextRequest, NextResponse } from 'next/server';
import { list, head, del } from '@vercel/blob';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { freshStepUpRequired } from '@/lib/admin-session';
import { COMPANY_DOC_PREFIX, describeCompanyPath, isAllowedCompanyPath, companyDocPathOf } from '@/lib/company-documents';
import { companyDocsGate, allLabels, labelExists, cleanName, defaultDocName, adoptLegacy, legacyId, legacyPathOf, DOC_NAME_MAX, type StoredFile } from '@/lib/company-documents-data';
import { needReason, reasonOf, auditAdmin, bodyWithReason } from '@/lib/admin-audit';

// CO-DOCS: the company's own paperwork in the private Blob store, owner with
// 2FA only. Company docs data (Cam 2026-11-17): each document is a row with
// its versions and a label (built-in or Cam's own); files from before this
// have no row and show as before ("legacy:<path>") until first changed.
//   GET    labels and documents
//   POST   record an upload the browser just finished: a new document, or with
//          documentId a Replace (a new version; the old file is kept)
//   DELETE ?id= a document and every version's file. A reason and a FRESH
//          second-factor check (freshStepUpRequired), checked last.

async function storedFiles(token: string): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: COMPANY_DOC_PREFIX, token, limit: 1000, cursor });
    out.push(...page.blobs.map(b => ({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** One legacy file, read from storage by its exact path (null when it isn't there). */
async function legacyFile(token: string, pathname: string): Promise<StoredFile | null> {
  const page = await list({ prefix: pathname, token, limit: 10 });
  const b = page.blobs.find(x => x.pathname === pathname);
  return b ? { url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt } : null;
}

export async function GET() {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const [files, docs, labels] = await Promise.all([
    storedFiles(g.token),
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
  return NextResponse.json({ labels: labels.map(l => ({ ...l, count: counts.get(l.key) ?? 0 })), documents });
}

/** Called after a browser upload finishes: { url, label?, name?, documentId? }. */
export async function POST(req: NextRequest) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => null) as { url?: unknown; label?: unknown; name?: unknown; documentId?: unknown } | null;
  const url = typeof body?.url === 'string' ? body.url : '';
  if (!url || !companyDocPathOf(url)) return NextResponse.json({ error: 'Missing or wrong file address' }, { status: 400 });
  const meta = await head(url, { token: g.token }).catch(() => null);
  if (!meta) return NextResponse.json({ error: 'The uploaded file was not found in storage. Try the upload again.' }, { status: 400 });
  if (!isAllowedCompanyPath(meta.pathname)) return NextResponse.json({ error: 'That file is not a company document' }, { status: 403 });
  const file: StoredFile = { url: meta.url, pathname: meta.pathname, size: meta.size, contentType: meta.contentType, uploadedAt: meta.uploadedAt };
  const by = { adminId: g.session.adminId, name: g.session.name };
  const version = { url: file.url, pathname: file.pathname, size: file.size, contentType: file.contentType ?? '', uploadedById: by.adminId, uploadedByName: by.name };

  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
  try {
    if (documentId) {
      // Replace: the new file becomes the next version; earlier files stay.
      const legacyPath = legacyPathOf(documentId);
      const old = legacyPath ? await legacyFile(g.token, legacyPath) : null;
      if (legacyPath && !old) return NextResponse.json({ error: 'The document being replaced is no longer in storage.' }, { status: 409 });
      const done = await prisma.$transaction(async tx => {
        if (await tx.companyDocumentVersion.findUnique({ where: { pathname: file.pathname }, select: { id: true } })) return { error: 'That file is already saved.' as const };
        const id = old ? await adoptLegacy(tx, old, null) : documentId;
        const doc = await tx.companyDocument.findUnique({ where: { id }, select: { id: true, versions: { orderBy: { version: 'desc' }, take: 1, select: { version: true } } } });
        if (!doc) return { error: 'That document was not found — refresh and try again.' as const };
        const next = (doc.versions[0]?.version ?? 0) + 1;
        await tx.companyDocumentVersion.create({ data: { documentId: doc.id, version: next, ...version } });
        await tx.companyDocument.update({ where: { id: doc.id }, data: { updatedAt: new Date() } });
        return { id: doc.id, version: next };
      });
      if ('error' in done) return NextResponse.json({ error: done.error }, { status: 409 });
      await auditAdmin(g.session, { action: 'company_document_replace', targetType: 'company_document', targetId: done.id, detail: `version ${done.version} (${file.pathname})`, after: { version: done.version, pathname: file.pathname } });
      return NextResponse.json({ success: true, id: done.id, version: done.version });
    }

    const label = body?.label === undefined ? describeCompanyPath(file.pathname).category : typeof body.label === 'string' ? body.label : '';
    if (!(await labelExists(label))) return NextResponse.json({ error: 'Pick a label for the document.' }, { status: 400 });
    const name = body?.name === undefined ? defaultDocName(file.pathname) : cleanName(body.name, DOC_NAME_MAX);
    if (!name) return NextResponse.json({ error: `Give the document a name (up to ${DOC_NAME_MAX} characters).` }, { status: 400 });
    if (await prisma.companyDocumentVersion.findUnique({ where: { pathname: file.pathname }, select: { id: true } })) {
      return NextResponse.json({ error: 'That file is already saved.' }, { status: 409 });
    }
    const doc = await prisma.companyDocument.create({ data: { name, label, versions: { create: { version: 1, ...version } } }, select: { id: true } });
    await auditAdmin(g.session, { action: 'company_document_add', targetType: 'company_document', targetId: doc.id, detail: file.pathname, after: { name, label, pathname: file.pathname } });
    return NextResponse.json({ success: true, id: doc.id, version: 1 });
  } catch (e) {
    // Two saves of the same file, or two Replaces racing for one version number.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return NextResponse.json({ error: 'That document changed at the same moment — refresh and try again.' }, { status: 409 });
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const body = await bodyWithReason(req);
  const nr = needReason('company_document_delete', body); if (nr) return nr;

  // ?id= (a document or legacy:<path>); ?url= is the page from before, which named a file.
  let id = req.nextUrl.searchParams.get('id') || '';
  const byUrl = req.nextUrl.searchParams.get('url') || '';
  if (!id && byUrl) {
    const p = companyDocPathOf(byUrl);
    if (!p) return NextResponse.json({ error: 'That is not a company document' }, { status: 400 });
    const v = await prisma.companyDocumentVersion.findUnique({ where: { pathname: p }, select: { documentId: true } });
    id = v ? v.documentId : legacyId(p);
  }
  const legacyPath = legacyPathOf(id);
  let files: { url: string; pathname: string }[];
  let doc: { id: string; name: string; label: string } | null = null;
  if (legacyPath) {
    if (await prisma.companyDocumentVersion.findUnique({ where: { pathname: legacyPath }, select: { id: true } })) {
      return NextResponse.json({ error: 'That document changed — refresh and try again.' }, { status: 409 });
    }
    const f = await legacyFile(g.token, legacyPath);
    if (!f) return NextResponse.json({ error: 'That document was not found — refresh and try again.' }, { status: 404 });
    files = [f];
  } else {
    const d = id ? await prisma.companyDocument.findUnique({ where: { id }, select: { id: true, name: true, label: true, versions: { select: { url: true, pathname: true } } } }) : null;
    if (!d) return NextResponse.json({ error: 'That document was not found — refresh and try again.' }, { status: 404 });
    doc = { id: d.id, name: d.name, label: d.label };
    files = d.versions;
  }

  // Last, right before the delete: a refused request must not spend the confirm.
  const fresh = await freshStepUpRequired(g.session); if (fresh) return fresh;

  try {
    if (files.length) await del(files.map(f => f.url), { token: g.token });
  } catch {
    return NextResponse.json({ error: 'Storage would not delete that file. Try again.' }, { status: 502 });
  }
  if (doc) await prisma.companyDocument.delete({ where: { id: doc.id } }).catch(() => null); // gone already: the files are what mattered
  await auditAdmin(g.session, {
    action: 'company_document_delete', targetType: 'company_document', targetId: doc ? doc.id : legacyPath!,
    reason: reasonOf(body), detail: files.map(f => f.pathname).join(', ').slice(0, 1000),
    before: doc ? { name: doc.name, label: doc.label, versions: files.length } : { pathname: legacyPath },
  });
  return NextResponse.json({ success: true });
}
