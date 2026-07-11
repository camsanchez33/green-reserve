import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

// Course branding image upload (logo / hero photo) via Vercel Blob.
// Requires BLOB_READ_WRITE_TOKEN in the environment (auto-set when a Blob
// store is connected to the project in the Vercel dashboard).

const MAX_BYTES = 8 * 1024 * 1024; // 8MB — the client downscales large images before upload
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function fieldFor(kind: string) {
  return kind === 'logo' ? 'logoUrl' : 'heroImageUrl';
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Image storage is not configured yet. Contact hello@greenreserve.app.' }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get('file');
  const kind = form.get('kind') === 'logo' ? 'logo' : 'hero';

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'Only JPEG, PNG, or WebP images are allowed' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 8MB' }, { status: 400 });
  }

  const field = fieldFor(kind);
  const previous = (await prisma.course.findUnique({ where: { id: session.courseId }, select: { [field]: true } })) as Record<string, string> | null;

  const blob = await put(`courses/${session.courseId}/${kind}-${Date.now()}.${ext}`, file, {
    access: 'public',
  });

  await prisma.course.update({
    where: { id: session.courseId },
    data: { [field]: blob.url },
  });

  if (previous?.[field]) {
    try { await del(previous[field]); } catch { /* best-effort cleanup, never blocks the upload */ }
  }

  return NextResponse.json({ url: blob.url });
}

// Remove a branding image: clears the URL and deletes the underlying blob.
export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const kind = new URL(req.url).searchParams.get('kind') === 'logo' ? 'logo' : 'hero';
  const field = fieldFor(kind);
  const previous = (await prisma.course.findUnique({ where: { id: session.courseId }, select: { [field]: true } })) as Record<string, string> | null;

  await prisma.course.update({
    where: { id: session.courseId },
    data: { [field]: '' },
  });

  if (previous?.[field]) {
    try { await del(previous[field]); } catch { /* best-effort cleanup */ }
  }

  return NextResponse.json({ ok: true });
}
