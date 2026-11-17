import { NextRequest, NextResponse } from 'next/server';
import { companyDocsGate, documentHistory } from '@/lib/company-documents-data';
import { blobStore, documentDetails } from '@/lib/company-documents-ops';

// Company docs data (Cam 2026-11-17): one document's history, newest first, in
// plain words (Uploaded / Replaced (version 1 kept) / Opened / Moved to X /
// Renamed / Deleted), from the audit log. GET ?id= (an id or legacy:<path>).
// Owner with 2FA only (companyDocsGate).
export async function GET(req: NextRequest) {
  const g = await companyDocsGate();
  if ('res' in g) return g.res;
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'Which document?' }, { status: 400 });
  const r = await documentDetails(blobStore(g.token), id, documentHistory);
  if (r.status !== 200) return NextResponse.json(r.body, { status: r.status });
  return NextResponse.json({ history: r.body.history });
}
