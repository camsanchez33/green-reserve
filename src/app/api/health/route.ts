import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

// docs/RELEASES.md §7 (Build OK 2026-11-18): the short commit of the build that answers, so the
// post-deploy check can tell the release just merged from a rolled-back or stale build. Seven
// characters, no framework or version (SEC-1). null outside Vercel.
function liveCommit(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null;
}

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { ok: true, db: 'up', commit: liveCommit(), ts: new Date().toISOString() },
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
