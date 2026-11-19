import { NextRequest, NextResponse } from 'next/server';
import { loadPublicTeeTimes } from '@/lib/public-tee-times';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const date = req.nextUrl.searchParams.get('date');
  if (!date) return NextResponse.json({ error: 'date param required' }, { status: 400 });
  // ?viewer=1 (the Book page): the logged-in golfer's own window at this course (lib/public-tee-times).
  const r = await loadPublicTeeTimes(slug, date, { viewer: req.nextUrl.searchParams.get('viewer') === '1' });
  if (!r.ok) return NextResponse.json(r.body, { status: r.status });
  return NextResponse.json(r.teeTimes);
}
