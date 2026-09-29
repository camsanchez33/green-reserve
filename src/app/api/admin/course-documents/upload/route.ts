import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { privateBlobToken, PRIVATE_STORAGE_MISSING } from '@/lib/private-blob';

// A-05 5b / MP-5a / BLOB-3. Course contracts (PDF) upload from the admin's
// browser STRAIGHT to the private Blob store; this route only issues the
// one-time upload permit. Cam's first live test failed with a bare "Upload
// failed": the file went through our function, and Vercel rejects any request
// body over 4.5 MB before our code runs (a plain-text 413 the page could not
// read). With a permit there is no function in the file's path, so the 15 MB
// limit below is the real one.
//
// The permit is locked down: an admin session at manager+, PDF only, 15 MB,
// and only under course-documents/<the course in the payload>/. Recording the
// uploaded file on the course happens in ../record (which re-checks all of it).
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const token = privateBlobToken();
  if (!token) return NextResponse.json({ error: PRIVATE_STORAGE_MISSING }, { status: 503 });

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Bad upload request' }, { status: 400 });
  }
  // Only the permit request comes from the browser. No completion callback is
  // configured, so a "completed" event here is not ours to act on.
  if (body.type !== 'blob.generate-client-token') {
    return NextResponse.json({ error: 'Unexpected upload event' }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request: req,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let courseId = '';
        try { courseId = String((JSON.parse(clientPayload || '{}') as { courseId?: unknown }).courseId || ''); } catch { /* checked below */ }
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(courseId)) throw new Error('Missing course');
        if (!pathname.startsWith(`course-documents/${courseId}/`) || pathname.includes('..') || !pathname.toLowerCase().endsWith('.pdf')) {
          throw new Error('That file path is not allowed');
        }
        return { allowedContentTypes: ['application/pdf'], maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: `Could not start the upload: ${msg}` }, { status: 400 });
  }
}
