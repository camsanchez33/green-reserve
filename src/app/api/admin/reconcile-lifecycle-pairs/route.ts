import { NextResponse } from 'next/server';
import { resolveAdminSession } from '@/lib/admin-session';
import { reconcileLifecyclePairs } from '@/lib/lifecycle';

// One-time backfill (RUN_QUEUE "LIFECYCLE PARITY LAW" item 6) — existing
// course/inquiry pairs that drifted out of parity before archivePair/
// restorePair existed (e.g. archived course + still-active inquiry) get
// reconciled here, with the full list of what changed returned so this
// never silently rewrites history.
export async function POST() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const report = await reconcileLifecyclePairs(session.name);
  return NextResponse.json({ fixed: report.length, changes: report });
}
