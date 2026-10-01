import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { resolveAdminSession, requireRole, OWNER_ONLY, ownerGateError } from '@/lib/admin-session';
import { privateBlobToken, PRIVATE_STORAGE_MISSING } from '@/lib/private-blob';
import { describeCompanyPath, companyDocPathOf } from '@/lib/company-documents';

// CO-DOCS: company documents are private blobs, so they are only ever served
// through here — owner session with 2FA, then a stream. The path is checked,
// not trusted, so this cannot be pointed at a course's contract or anything
// else in the store.
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });

  const url = req.nextUrl.searchParams.get('url') || '';
  const pathname = companyDocPathOf(url);
  if (!pathname) return NextResponse.json({ error: 'That is not a company document' }, { status: 403 });

  const token = privateBlobToken();
  if (!token) return NextResponse.json({ error: PRIVATE_STORAGE_MISSING }, { status: 503 });
  const result = await get(url, { access: 'private', token }).catch(() => null);
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: 'Document not found in storage' }, { status: 404 });
  }
  const { name } = describeCompanyPath(pathname);
  return new NextResponse(result.stream, {
    headers: {
      'Content-Type': result.blob.contentType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${name.replace(/["\\]/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
