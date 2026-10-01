import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { resolveAdminSession, requireRole, OWNER_ONLY, ownerGateError } from '@/lib/admin-session';
import { privateBlobToken, PRIVATE_STORAGE_MISSING } from '@/lib/private-blob';
import { COMPANY_DOC_MAX_BYTES, COMPANY_DOC_TYPES, isAllowedCompanyPath } from '@/lib/company-documents';

// CO-DOCS: company paperwork uploads go from the owner's browser STRAIGHT to the
// private Blob store (the BLOB-3 pattern — no function in the file's path, so
// Vercel's 4.5 MB body limit does not apply). This route only issues the
// one-time permit: owner with 2FA, PDF/PNG/JPEG, 25 MB, only under
// company/<known category>/. Recording happens in ../route.ts POST.
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, OWNER_ONLY)) return NextResponse.json({ error: ownerGateError(session) }, { status: 403 });

  const token = privateBlobToken();
  if (!token) return NextResponse.json({ error: PRIVATE_STORAGE_MISSING }, { status: 503 });

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Bad upload request' }, { status: 400 });
  }
  if (body.type !== 'blob.generate-client-token') {
    return NextResponse.json({ error: 'Unexpected upload event' }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request: req,
      token,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAllowedCompanyPath(pathname)) throw new Error('That file path or type is not allowed (PDF, PNG or JPEG only)');
        return { allowedContentTypes: [...COMPANY_DOC_TYPES], maximumSizeInBytes: COMPANY_DOC_MAX_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: `Could not start the upload: ${msg}` }, { status: 400 });
  }
}
