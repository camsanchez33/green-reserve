// Memberships item 2 (Cam 2026-11-16): a member's photo on their card. Like an item's photo (api/operator/shop-items/
// photo) — POST form { id, file }, DELETE ?id= — but a person's face is private: it goes in the PRIVATE blob store
// (lib/private-blob) and is only ever streamed back through GET ?id= to the course's own staff, never as a URL.
// Uploading or removing is members.edit; seeing it is members.view. The member is always the session's course's.
import { NextRequest, NextResponse } from 'next/server';
import { put, del, get } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { privateBlobToken, isBlobStoreUrl } from '@/lib/private-blob';
import { ADMIN_EMAIL } from '@/lib/contact';

// Under Vercel's request-body limit (a photo comes through the function).
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const NOT_SET_UP = `Private photo storage is not set up yet. Contact ${ADMIN_EMAIL}.`;

async function gate(key: 'members.view' | 'members.edit') {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, key);
  if (denied) return { res: denied };
  if (key === 'members.edit') { const block = await requireAgreementCurrent(session.courseId); if (block) return { res: block }; }
  return { session };
}

/** The member, only if they belong to this course. */
const memberOf = (courseId: string, id: unknown) => typeof id === 'string' && id
  ? prisma.courseMembership.findFirst({ where: { id, courseId }, select: { id: true, photoUrl: true } })
  : Promise.resolve(null);

const NOT_FOUND = () => NextResponse.json({ error: 'That member is no longer on your list — refresh.' }, { status: 404 });

export async function GET(req: NextRequest) {
  const g = await gate('members.view'); if (g.res) return g.res;
  const m = await memberOf(g.session.courseId, req.nextUrl.searchParams.get('id'));
  if (!m) return NOT_FOUND();
  if (!m.photoUrl) return NextResponse.json({ error: 'No photo.' }, { status: 404 });
  const token = privateBlobToken();
  if (!token) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });
  if (!isBlobStoreUrl(m.photoUrl)) return NextResponse.json({ error: 'No photo.' }, { status: 404 });
  const r = await get(m.photoUrl, { access: 'private', token }).catch(() => null);
  if (!r || r.statusCode !== 200 || !r.stream) return NextResponse.json({ error: 'No photo.' }, { status: 404 });
  return new NextResponse(r.stream, { headers: { 'Content-Type': r.blob.contentType || 'image/jpeg', 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const g = await gate('members.edit'); if (g.res) return g.res;
  const token = privateBlobToken();
  if (!token) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const m = await memberOf(g.session.courseId, form?.get('id'));
  if (!m) return NOT_FOUND();
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a photo first.' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Only JPEG, PNG or WebP photos.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The photo must be under 4MB.' }, { status: 400 });
  let blob;
  try { blob = await put(`members/${g.session.courseId}/${m.id}-${Date.now()}.${ext}`, file, { access: 'private', token, contentType: file.type, addRandomSuffix: true }); }
  catch (err) { console.error(JSON.stringify({ ev: 'member_photo.upload_failed', membershipId: m.id, error: err instanceof Error ? err.message : String(err) })); return NextResponse.json({ error: 'The photo couldn’t be saved — try again.' }, { status: 502 }); }
  await prisma.courseMembership.update({ where: { id: m.id }, data: { photoUrl: blob.url } });
  if (m.photoUrl && isBlobStoreUrl(m.photoUrl)) { try { await del(m.photoUrl, { token }); } catch { /* best effort — never blocks the upload */ } }
  return NextResponse.json({ hasPhoto: true });
}

export async function DELETE(req: NextRequest) {
  const g = await gate('members.edit'); if (g.res) return g.res;
  const m = await memberOf(g.session.courseId, req.nextUrl.searchParams.get('id'));
  if (!m) return NOT_FOUND();
  await prisma.courseMembership.update({ where: { id: m.id }, data: { photoUrl: '' } });
  const token = privateBlobToken();
  if (m.photoUrl && token && isBlobStoreUrl(m.photoUrl)) { try { await del(m.photoUrl, { token }); } catch { /* best effort */ } }
  return NextResponse.json({ hasPhoto: false });
}
