import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, db: 'up', ts: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    console.error('[health] DB unreachable:', err);
    return NextResponse.json(
      { ok: false, db: 'down', ts: new Date().toISOString() },
      { status: 503 }
    );
  }
}
