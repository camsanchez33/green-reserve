import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';

const MAX_BYTES = 8 * 1024 * 1024; // 8MB — the client downscales large images before upload
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ok = await rateLimit('inquiry-upload:' + ip, 20, 300);
  if (!ok) return NextResponse.json({ error: 'Too many uploads — try again later' }, { status: 429 });

  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const inquiry = await prisma.courseInquiry.findUnique({ where: { detailsToken: token } });
  if (!inquiry) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  if (['building', 'live', 'rejected'].includes(inquiry.status)) {
    return NextResponse.json({ error: 'Sheet already submitted' }, { status: 409 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'Photo uploads are not available yet. Email hello@greenreserve.app to send photos.' },
      { status: 503 },
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Only JPEG, PNG, or WebP images are allowed' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Photo must be under 8MB' }, { status: 400 });

  const blob = await put(`inquiries/${inquiry.id}/photo-${Date.now()}.${ext}`, file, { access: 'public' });
  return NextResponse.json({ url: blob.url });
}
