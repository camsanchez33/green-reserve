import { NextRequest, NextResponse } from 'next/server';
import { freshStepUpRequired } from '@/lib/admin-session';
import { companyDocsGate } from '@/lib/company-documents-data';
import { blobStore, listDocuments, recordUpload, deleteDocument } from '@/lib/company-documents-ops';
import { needReason, reasonOf, bodyWithReason } from '@/lib/admin-audit';

// CO-DOCS: the company's own paperwork in the private Blob store, owner with
// 2FA only (companyDocsGate: the 'company' area, owner with mfa). Company docs
// data (Cam 2026-11-17), the work itself in lib/company-documents-ops.ts:
//   GET    labels (with counts) and documents
//   POST   record an upload the browser just finished: { url, label?, name? } a
//          new document, or with documentId a Replace (the old file is kept)
//   DELETE ?id= (or ?url=, the page from before) a document and every version's
//          file. A reason, then a FRESH second-factor check, checked last.

export async function GET() {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  return NextResponse.json(await listDocuments(blobStore(g.token)));
}

export async function POST(req: NextRequest) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => null);
  const r = await recordUpload(blobStore(g.token), g.session, body && typeof body === 'object' ? body : null);
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE(req: NextRequest) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const body = await bodyWithReason(req);
  const nr = needReason('company_document_delete', body); if (nr) return nr;
  const session = g.session;
  const r = await deleteDocument(blobStore(g.token), session,
    { id: req.nextUrl.searchParams.get('id') || undefined, url: req.nextUrl.searchParams.get('url') || undefined },
    reasonOf(body),
    async () => (await freshStepUpRequired(session)) === null);
  return NextResponse.json(r.body, { status: r.status });
}
