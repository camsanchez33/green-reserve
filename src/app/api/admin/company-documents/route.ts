import { NextRequest, NextResponse } from 'next/server';
import { list, head, del } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { resolveAdminSession, requireRole, OWNER_ONLY, ownerGateError } from '@/lib/admin-session';
import { privateBlobToken, PRIVATE_STORAGE_MISSING } from '@/lib/private-blob';
import { COMPANY_DOC_PREFIX, describeCompanyPath, isAllowedCompanyPath, companyDocPathOf } from '@/lib/company-documents';

// CO-DOCS: the company's own paperwork in the private Blob store. GET lists
// company/ (the folder IS the record), POST records an upload the browser just
// finished (audit log), DELETE removes one file. Owner with 2FA only.

async function gate() {
  const session = await resolveAdminSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!requireRole(session, OWNER_ONLY)) return { res: NextResponse.json({ error: ownerGateError(session) }, { status: 403 }) };
  const token = privateBlobToken();
  if (!token) return { res: NextResponse.json({ error: PRIVATE_STORAGE_MISSING }, { status: 503 }) };
  return { session, token };
}

async function audit(adminId: string, action: string, pathname: string) {
  await prisma.adminAuditLog.create({ data: { adminId, action, targetType: 'company_document', targetId: pathname.slice(0, 190) } })
    .catch(err => console.error('company document audit failed:', err));
}

export async function GET() {
  const g = await gate();
  if ('res' in g) return g.res;
  const blobs: { url: string; pathname: string; size: number; uploadedAt: Date }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: COMPANY_DOC_PREFIX, token: g.token, limit: 1000, cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  const documents = blobs
    .map(b => ({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt.toISOString(), ...describeCompanyPath(b.pathname) }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  return NextResponse.json({ documents });
}

/** Called after a browser upload finishes: verify it landed where it may, then log it. */
export async function POST(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const body = await req.json().catch(() => null) as { url?: unknown } | null;
  const url = typeof body?.url === 'string' ? body.url : '';
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  const meta = await head(url, { token: g.token }).catch(() => null);
  if (!meta) return NextResponse.json({ error: 'The uploaded file was not found in storage. Try the upload again.' }, { status: 400 });
  if (!isAllowedCompanyPath(meta.pathname)) return NextResponse.json({ error: 'That file is not a company document' }, { status: 403 });
  await audit(g.session.adminId, 'company_document_uploaded', meta.pathname);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const g = await gate();
  if ('res' in g) return g.res;
  const url = req.nextUrl.searchParams.get('url') || '';
  const pathname = companyDocPathOf(url);
  if (!pathname) return NextResponse.json({ error: 'That is not a company document' }, { status: 400 });
  try {
    await del(url, { token: g.token });
  } catch {
    return NextResponse.json({ error: 'Storage would not delete that file. Try again.' }, { status: 502 });
  }
  await audit(g.session.adminId, 'company_document_deleted', pathname);
  return NextResponse.json({ success: true });
}
