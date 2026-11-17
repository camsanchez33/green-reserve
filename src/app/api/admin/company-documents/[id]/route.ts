import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { describeCompanyPath } from '@/lib/company-documents';
import { companyDocsGate, labelExists, cleanName, defaultDocName, adoptLegacy, legacyPathOf, documentHistory, DOC_NAME_MAX, type StoredFile } from '@/lib/company-documents-data';
import { auditAdmin, changedFields } from '@/lib/admin-audit';

// Company docs data (Cam 2026-11-17): one document. Owner with 2FA only.
//   GET   its details, every version (newest first) and its history from the audit log
//   PATCH { label?, name? } — change its label or name (a legacy file gets its row here)

type Ctx = { params: Promise<{ id: string }> };

async function legacyFile(token: string, pathname: string): Promise<StoredFile | null> {
  const page = await list({ prefix: pathname, token, limit: 10 });
  const b = page.blobs.find(x => x.pathname === pathname);
  return b ? { url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt } : null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const { id } = await ctx.params;
  const legacyPath = legacyPathOf(id);
  if (legacyPath) {
    const known = await prisma.companyDocumentVersion.findUnique({ where: { pathname: legacyPath }, select: { documentId: true } });
    if (known) return NextResponse.json({ error: 'That document changed — refresh and try again.', id: known.documentId }, { status: 409 });
    const f = await legacyFile(g.token, legacyPath);
    if (!f) return NextResponse.json({ error: 'That document was not found.' }, { status: 404 });
    return NextResponse.json({
      document: { id, name: defaultDocName(f.pathname), label: describeCompanyPath(f.pathname).category, version: 1, legacy: true },
      versions: [{ version: 1, url: f.url, pathname: f.pathname, size: f.size, contentType: '', uploadedBy: '', uploadedAt: f.uploadedAt.toISOString() }],
      history: await documentHistory(id, [legacyPath]),
    });
  }
  const doc = await prisma.companyDocument.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' } } } });
  if (!doc) return NextResponse.json({ error: 'That document was not found.' }, { status: 404 });
  return NextResponse.json({
    document: { id: doc.id, name: doc.name, label: doc.label, version: doc.versions[0]?.version ?? 0, legacy: false, createdAt: doc.createdAt.toISOString() },
    versions: doc.versions.map(v => ({ version: v.version, url: v.url, pathname: v.pathname, size: v.size, contentType: v.contentType, uploadedBy: v.uploadedByName, uploadedAt: v.createdAt.toISOString() })),
    history: await documentHistory(doc.id, doc.versions.map(v => v.pathname)),
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null) as { label?: unknown; name?: unknown } | null;
  if (!body || (body.label === undefined && body.name === undefined)) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  if (body.label !== undefined && !(await labelExists(body.label))) return NextResponse.json({ error: 'That label doesn’t exist — refresh and pick again.' }, { status: 400 });
  const name = body.name === undefined ? undefined : cleanName(body.name, DOC_NAME_MAX);
  if (name === null) return NextResponse.json({ error: `Give the document a name (up to ${DOC_NAME_MAX} characters).` }, { status: 400 });

  const legacyPath = legacyPathOf(id);
  const old = legacyPath ? await legacyFile(g.token, legacyPath) : null;
  if (legacyPath && !old) return NextResponse.json({ error: 'That document was not found.' }, { status: 404 });
  const result = await prisma.$transaction(async tx => {
    const docId = old ? await adoptLegacy(tx, old, null) : id;
    const before = await tx.companyDocument.findUnique({ where: { id: docId }, select: { name: true, label: true } });
    if (!before) return null;
    const after = await tx.companyDocument.update({ where: { id: docId }, data: { ...(body.label !== undefined ? { label: body.label as string } : {}), ...(name !== undefined ? { name } : {}) }, select: { id: true, name: true, label: true } });
    return { before, after };
  });
  if (!result) return NextResponse.json({ error: 'That document was not found.' }, { status: 404 });
  const diff = changedFields(result.before, { name: result.after.name, label: result.after.label });
  if (Object.keys(diff.after).length) {
    await auditAdmin(g.session, { action: 'label' in diff.after ? 'company_document_relabel' : 'company_document_rename', targetType: 'company_document', targetId: result.after.id, ...diff });
  }
  return NextResponse.json({ document: result.after });
}
