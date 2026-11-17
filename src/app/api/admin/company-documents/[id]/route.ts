import { NextRequest, NextResponse } from 'next/server';
import { companyDocsGate, documentHistory } from '@/lib/company-documents-data';
import { blobStore, documentDetails, updateDocument } from '@/lib/company-documents-ops';

// Company docs data (Cam 2026-11-17): one document (an id, or legacy:<path>
// URL-encoded; the router decodes it once). Owner with 2FA only (companyDocsGate).
//   GET   its details, every version (newest first) and its history from the audit log
//   PATCH { label?, name? } — change its label or name

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const { id } = await ctx.params;
  const r = await documentDetails(blobStore(g.token), id, documentHistory);
  return NextResponse.json(r.body, { status: r.status });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const r = await updateDocument(blobStore(g.token), g.session, id, body && typeof body === 'object' ? body : null);
  return NextResponse.json(r.body, { status: r.status });
}
