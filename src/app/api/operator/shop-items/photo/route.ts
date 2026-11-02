// DASH-D register (Cam 2026-11-01, "photo tiles"): an item's photo for the register's
// tiles (a tile without one shows its name). Settings → Pro shop, shop.catalog — the
// same permission that edits the item. POST form { itemId, file }; DELETE ?itemId=.
// Vercel Blob, as the course logo (api/operator/upload).
import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { requireAgreementCurrent } from '@/lib/agreement-required';
import { ADMIN_EMAIL } from '@/lib/contact';

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function gate() {
  const session = await resolveDashboardSession();
  if (!session) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const denied = requirePermission(session, 'shop.catalog');
  if (denied) return { res: denied };
  const block = await requireAgreementCurrent(session.courseId); if (block) return { res: block };
  return { session };
}

/** The item, only if it belongs to this course. */
const itemOf = (courseId: string, id: unknown) => typeof id === 'string' && id
  ? prisma.shopItem.findFirst({ where: { id, courseId }, select: { id: true, photoUrl: true } })
  : Promise.resolve(null);

export async function POST(req: NextRequest) {
  const g = await gate(); if (g.res) return g.res;
  const { session } = g;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: `Image storage is not configured yet. Contact ${ADMIN_EMAIL}.` }, { status: 503 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const item = await itemOf(session.courseId, form?.get('itemId'));
  if (!item) return NextResponse.json({ error: 'That item no longer exists — refresh the catalog.' }, { status: 404 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a photo first.' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Only JPEG, PNG or WebP photos.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The photo must be under 8MB.' }, { status: 400 });
  const blob = await put(`courses/${session.courseId}/shop/${item.id}-${Date.now()}.${ext}`, file, { access: 'public' });
  await prisma.shopItem.update({ where: { id: item.id }, data: { photoUrl: blob.url } });
  if (item.photoUrl) { try { await del(item.photoUrl); } catch { /* best effort — never blocks the upload */ } }
  return NextResponse.json({ url: blob.url });
}

export async function DELETE(req: NextRequest) {
  const g = await gate(); if (g.res) return g.res;
  const item = await itemOf(g.session.courseId, new URL(req.url).searchParams.get('itemId'));
  if (!item) return NextResponse.json({ error: 'That item no longer exists — refresh the catalog.' }, { status: 404 });
  await prisma.shopItem.update({ where: { id: item.id }, data: { photoUrl: '' } });
  if (item.photoUrl) { try { await del(item.photoUrl); } catch { /* best effort */ } }
  return NextResponse.json({ url: '' });
}
