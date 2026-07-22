import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { logDocumentUploaded } from '@/lib/course-timeline';

// A-05 item 5b — PDF uploads per course, via the same Vercel Blob storage
// operator photo uploads already use. Listed via the course timeline
// (name + url + uploader + date), no new document model needed.
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'File storage is not configured yet.' }, { status: 503 });
  }

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

  const blob = await put(`course-documents/${courseId}/${Date.now()}-${file.name}`, file, {
    access: 'public',
    contentType: 'application/pdf',
  });

  const ok = await logDocumentUploaded(courseId, file.name, blob.url, session.name);
  if (!ok) return NextResponse.json({ error: 'No linked inquiry to log against for this course' }, { status: 400 });

  return NextResponse.json({ success: true, url: blob.url });
}
