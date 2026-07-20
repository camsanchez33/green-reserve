import { NextRequest, NextResponse } from 'next/server';
import { verifyPreviewToken } from '@/lib/preview-token';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { cleanChangeItems, submitChangeRequest } from '@/lib/submit-change-request';

// Feeds into the EXISTING admin<->course messages thread (creates one if
// none) rather than a separate inbox — same thread the dashboard uses.
// V13b: request body is { items: {category, detail}[] } — structured
// categories, not one free-text field. Core logic shared with the
// logged-in operator dashboard's request-changes route so both entry
// points can never drift (src/lib/submit-change-request.ts).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const { items } = await req.json().catch(() => ({ items: [] }));

  const tokenCourseId = await verifyPreviewToken(token);
  if (!tokenCourseId || tokenCourseId !== courseId) {
    return NextResponse.json({ error: 'Invalid preview token' }, { status: 403 });
  }

  const cleanItems = cleanChangeItems(items);
  if (cleanItems.length === 0) return NextResponse.json({ error: 'At least one category is required' }, { status: 400 });

  const courseAllowed = await rateLimit(`preview-changes:${courseId}`, 10, 3600);
  const ipAllowed = await rateLimit(`preview-changes-ip:${clientIp(req)}`, 30, 3600);
  if (!courseAllowed || !ipAllowed) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 });
  }

  const result = await submitChangeRequest(courseId, cleanItems);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
