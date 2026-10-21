import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { deviceForApproval, approveDevice } from '@/lib/owner-session';

// AW-1: the emailed "approve a new device" link. GET says which device the link
// is for (nothing changes); only the POST from the confirm page approves it,
// so a mail scanner that follows the link can't. The link works once, for 15
// minutes, and never signs anyone in — the owner signs in again afterwards.

export async function GET(req: NextRequest) {
  if (!(await rateLimit(`cam:device:get:${clientIp(req)}`, 30, 600))) return NextResponse.json({ error: 'Too many tries — wait a few minutes.' }, { status: 429 });
  const d = await deviceForApproval(req.nextUrl.searchParams.get('token') ?? '');
  if (!d) return NextResponse.json({ error: 'This link has expired or was already used. Sign in again to get a new one.' }, { status: 404 });
  return NextResponse.json({ device: d.label, requestedAt: d.approvalExpiresAt ? new Date(d.approvalExpiresAt.getTime() - 15 * 60_000).toISOString() : null });
}

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`cam:device:post:${clientIp(req)}`, 10, 600))) return NextResponse.json({ error: 'Too many tries — wait a few minutes.' }, { status: 429 });
  const body = await req.json().catch(() => ({})) as { token?: unknown };
  const ok = await approveDevice(typeof body.token === 'string' ? body.token : '');
  if (!ok) return NextResponse.json({ error: 'This link has expired or was already used. Sign in again to get a new one.' }, { status: 404 });
  return NextResponse.json({ approved: true });
}
