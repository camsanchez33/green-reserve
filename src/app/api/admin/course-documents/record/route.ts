import { NextRequest, NextResponse } from 'next/server';
import { head } from '@vercel/blob';
import { resolveAdminSession, requireRole, MANAGER_PLUS } from '@/lib/admin-session';
import { logDocumentUploaded } from '@/lib/course-timeline';
import { privateBlobToken, PRIVATE_STORAGE_MISSING, isBlobStoreUrl } from '@/lib/private-blob';

// BLOB-3: step two of a contract upload. The browser has put the PDF into the
// private store (via ../upload's permit); this records it on the course. The
// URL is not trusted: it must resolve, in OUR private store, to a PDF under
// this course's folder — so nobody can attach some other course's file, or an
// arbitrary link, to a course's paperwork.
export async function POST(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(session, MANAGER_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const token = privateBlobToken();
  if (!token) return NextResponse.json({ error: PRIVATE_STORAGE_MISSING }, { status: 503 });

  const body = await req.json().catch(() => null) as { courseId?: unknown; url?: unknown; name?: unknown } | null;
  const courseId = typeof body?.courseId === 'string' ? body.courseId : '';
  const url = typeof body?.url === 'string' ? body.url : '';
  const name = typeof body?.name === 'string' ? body.name.slice(0, 200) : 'document.pdf';
  if (!courseId || !url) return NextResponse.json({ error: 'Missing courseId or url' }, { status: 400 });

  if (!isBlobStoreUrl(url)) return NextResponse.json({ error: 'That is not a file in GreenReserve storage — try the upload again.' }, { status: 400 });
  const meta = await head(url, { token }).catch(() => null);
  if (!meta) return NextResponse.json({ error: 'The uploaded file was not found in storage — try the upload again.' }, { status: 400 });
  if (!meta.pathname.startsWith(`course-documents/${courseId}/`) || meta.contentType !== 'application/pdf') {
    return NextResponse.json({ error: 'That file does not belong to this course' }, { status: 403 });
  }

  const ok = await logDocumentUploaded(courseId, name, meta.url, session.name);
  if (!ok) return NextResponse.json({ error: 'The file was stored, but this course has no linked inquiry to list documents on.' }, { status: 400 });
  return NextResponse.json({ success: true, url: meta.url });
}
