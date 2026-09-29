import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { logDocumentUploaded } from '@/lib/course-timeline';
import { privateBlobToken, PRIVATE_STORAGE_MISSING } from '@/lib/private-blob';

// A-05 item 5b — PDF uploads per course, via the same Vercel Blob storage
// operator photo uploads already use. Listed via the course timeline
// (name + url + uploader + date), no new document model needed.
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const token = privateBlobToken();
  if (!token) return NextResponse.json({ error: PRIVATE_STORAGE_MISSING }, { status: 503 });

  const form = await req.formData();
  const file = form.get('file');
  const courseId = form.get('courseId');
  if (!(file instanceof File) || typeof courseId !== 'string' || !courseId) {
    return NextResponse.json({ error: 'Missing file or courseId' }, { status: 400 });
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (15MB max)' }, { status: 400 });
  }

  // MP-5a: these are signed contracts. As public blobs they were readable by
  // anyone who ever saw the URL — no session, no expiry, and nothing to revoke.
  // Private blobs are served only through the authenticated download route.
  let blob: Awaited<ReturnType<typeof put>>;
  try {
    blob = await put(`course-documents/${courseId}/${Date.now()}-${file.name}`, file, {
      access: 'private',
      contentType: 'application/pdf',
      token,
    });
  } catch (e) {
    // No-silent-failures: say what storage refused (e.g. a PUBLIC store behind
    // the private token) instead of a bare 500.
    const msg = e instanceof Error ? e.message : 'unknown error';
    return NextResponse.json({ error: `File storage refused the upload: ${msg}. Check that the contracts store in Vercel is set to Private.` }, { status: 502 });
  }

  const ok = await logDocumentUploaded(courseId, file.name, blob.url, session.name);
  if (!ok) return NextResponse.json({ error: 'No linked inquiry to log against for this course' }, { status: 400 });

  return NextResponse.json({ success: true, url: blob.url });
}
