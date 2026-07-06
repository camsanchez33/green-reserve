import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

// Course branding image upload (logo / hero photo) via Vercel Blob.
// Requires BLOB_READ_WRITE_TOKEN in the environment (auto-set when a Blob
// store is connected to the project in the Vercel dashboard).

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
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
    return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 });
  }

  const blob = await put(`courses/${session.courseId}/${kind}-${Date.now()}.${ext}`, file, {
    access: 'public',
  });

  await prisma.course.update({
    where: { id: session.courseId },
    data: { [fieldFor(kind)]: blob.url },
  });

  return NextResponse.json({ url: blob.url });
}

// Remove a branding image (clears the URL; the blob itself is left behind,
// which is fine — storage is cheap and old URLs may be cached in emails).
export async function DELETE(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const kind = new URL(req.url).searchParams.get('kind') === 'logo' ? 'logo' : 'hero';
  await prisma.course.update({
    where: { id: session.courseId },
    data: { [fieldFor(kind)]: '' },
  });

  return NextResponse.json({ ok: true });
}
