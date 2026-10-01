import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { resolveAdminSession, requireRole, SUPPORT_PLUS } from '@/lib/admin-session';
import { privateBlobToken, PRIVATE_STORAGE_MISSING, isBlobStoreUrl } from '@/lib/private-blob';

// MP-5a. Signed contracts used to be uploaded as `access: 'public'` Vercel
// Blobs — readable by anyone who ever saw the URL, forever, with no session
// and no expiry. They are private blobs now, which means they can only be
// served through here: an admin session, then a stream.
//
// The pathname is checked against the courseId in the query rather than
// trusted, so a valid session cannot be pointed at some other course's
// paperwork (or anything else in the store) by editing the URL.
export async function GET(req: NextRequest) {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Same gate as the Documents tab that lists these — no wider.
  if (!requireRole(session, SUPPORT_PLUS)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const courseId = req.nextUrl.searchParams.get('courseId');
  const url = req.nextUrl.searchParams.get('url');
  if (!courseId || !url) return NextResponse.json({ error: 'Missing courseId or url' }, { status: 400 });

  // SEC-blob-host: the host as well as the path, or the token goes wherever
  // the query string points.
  if (!isBlobStoreUrl(url)) return NextResponse.json({ error: 'Not a valid document URL' }, { status: 400 });
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return NextResponse.json({ error: 'Not a valid document URL' }, { status: 400 });
  }
  // AG-2: signed agreements are private blobs too, under their own prefix.
  const prefixes = [`/course-documents/${courseId}/`, `/agreements/${courseId}/`];
  const expectedPrefix = prefixes.find(pf => pathname.startsWith(pf));
  if (!expectedPrefix) {
    return NextResponse.json({ error: 'That document does not belong to this course' }, { status: 403 });
  }

  const token = privateBlobToken();
  if (!token) return NextResponse.json({ error: PRIVATE_STORAGE_MISSING }, { status: 503 });
  const result = await get(url, { access: 'private', token }).catch(() => null);
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: 'Document not found in storage' }, { status: 404 });
  }

  let filename = pathname.slice(expectedPrefix.length);
  try { filename = decodeURIComponent(filename); } catch { /* keep it encoded */ }
  filename ||= 'document.pdf';
  return new NextResponse(result.stream, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      // Never let a shared cache hold a contract.
      'Cache-Control': 'private, no-store',
    },
  });
}
