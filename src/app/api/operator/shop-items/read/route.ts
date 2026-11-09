import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { resolveDashboardSession, requirePermission } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { readShopList, MAX_READ_CHARS, READ_FILE_TYPES, MAX_READ_FILE_BYTES, type ReadFileType } from '@/lib/shop-ai-import';

// W2-7: the AI reads a pasted list or invoice into catalog rows for the
// preview. It writes nothing — staff add the rows with the normal POST.
// Same permission as editing the catalog; limited per course per hour.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await resolveDashboardSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const denied = requirePermission(session, 'shop.catalog'); if (denied) return denied; }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Reading lists with AI isn’t switched on yet. Upload a CSV instead.' }, { status: 503 });
  const body = await req.json().catch(() => null) as { text?: unknown; file?: { type?: unknown; data?: unknown } } | null;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  // POS-8: a photo of a price sheet or a PDF invoice, base64 (the browser shrinks a photo first).
  let file: { mediaType: ReadFileType; data: string } | null = null;
  if (body?.file) {
    const type = String(body.file.type ?? '');
    const data = typeof body.file.data === 'string' ? body.file.data.replace(/\s/g, '') : '';
    if (!(READ_FILE_TYPES as readonly string[]).includes(type)) return NextResponse.json({ error: 'Upload a photo (JPG, PNG), a PDF, or a CSV.' }, { status: 400 });
    if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return NextResponse.json({ error: 'That file didn’t come through — try again.' }, { status: 400 });
    if (Math.floor(data.length * 3 / 4) > MAX_READ_FILE_BYTES) return NextResponse.json({ error: 'That file is over 3 MB — send fewer pages, or a smaller photo.' }, { status: 400 });
    file = { mediaType: type as ReadFileType, data };
  }
  if (!file && !text) return NextResponse.json({ error: 'Upload a file or paste the list first.' }, { status: 400 });
  if (text.length > MAX_READ_CHARS) return NextResponse.json({ error: `That’s over ${MAX_READ_CHARS.toLocaleString()} characters — split it into smaller pastes.` }, { status: 400 });
  // A `birdie:` key fails CLOSED (lib/rate-limit): a broken counter must not uncap paid model spend.
  if (!(await rateLimit(`birdie:shop-read:${session.courseId}`, 20, 3600))) return NextResponse.json({ error: 'That’s a lot of lists this hour — try again shortly.' }, { status: 429 });
  try {
    const r = await readShopList(file ? { file, text } : text);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
    return NextResponse.json({ rows: r.rows });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'The assistant is busy — try again in a minute.' }, { status: 503 });
    if (err instanceof Anthropic.APIError) return NextResponse.json({ error: 'The assistant couldn’t be reached — try again, or upload a CSV.' }, { status: 502 });
    throw err;
  }
}
