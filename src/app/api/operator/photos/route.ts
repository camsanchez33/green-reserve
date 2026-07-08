import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { resolveDashboardSession } from '@/lib/session';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function GET() {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const photos = await prisma.coursePhoto.findMany({
    where: { courseId: session.courseId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, url: true, sortOrder: true },
  });
  return NextResponse.json(photos);
}

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Image storage is not configured. Contact hello@greenreserve.app.' }, { status: 503 });
  }

  const existing = await prisma.coursePhoto.count({ where: { courseId: session.courseId } });
  if (existing >= 8) {
    return NextResponse.json({ error: 'Maximum of 8 gallery photos allowed. Remove one to upload another.' }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Only JPEG, PNG, or WebP images are allowed' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be under 5MB' }, { status: 400 });

  const blob = await put(`courses/${session.courseId}/gallery-${Date.now()}.${ext}`, file, { access: 'public' });

  const photo = await prisma.coursePhoto.create({
    data: { courseId: session.courseId, url: blob.url, sortOrder: existing },
    select: { id: true, url: true, sortOrder: true },
  });

  return NextResponse.json(photo);
}
