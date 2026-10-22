import { NextRequest, NextResponse } from 'next/server';
import { submitSignup } from '@/lib/event-signup';
import { rateLimit, clientIp } from '@/lib/rate-limit';

// W2-9d: a golfer signs up for an event on its public page (/events/[id]). No
// login; the page exists only while the course has sign-ups open. Capacity,
// the waiting list and the 30-minute hold are decided in lib/event-signup.ts.

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await rateLimit(`event-signup:${clientIp(req)}`, 10, 600)) || !(await rateLimit(`event-signup:event:${id}`, 300, 3600))) {
    return NextResponse.json({ error: 'Too many sign-ups at once — wait a few minutes and try again.' }, { status: 429 });
  }
  const body = await req.json().catch(() => ({})) as { players?: unknown };
  const r = await submitSignup(id, { players: body.players });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.value);
}
