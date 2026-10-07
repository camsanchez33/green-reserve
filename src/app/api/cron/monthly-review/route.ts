import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cron-auth';
import { cronRoute } from '@/lib/cron-log';
import { prisma } from '@/lib/prisma';
import { runMonthlyReview, emailPendingReviews } from '@/lib/monthly-review';

// BI-1 (PLATFORM_ROADMAP_SPEC §1): the monthly AI review. Runs DAILY, not on
// the 1st only — "due and not yet written": each live course gets a review of
// its previous month the first run after that month ends in its own timezone,
// a failed one is retried the next day, and a missed run catches up. The
// unique (courseId, month) row is the dedup. A few courses per run keeps the
// function well inside its time limit; the rest follow on later runs.
export const maxDuration = 300;
const PER_RUN = 12;

export const GET = cronRoute('monthly-review', async (req: NextRequest) => {
  const denied = cronAuthFailure(req);
  if (denied) return denied;

  const now = new Date();
  const courses = await prisma.course.findMany({
    where: { liveStatus: 'live', archivedAt: null, firstWentLiveAt: { not: null } },
    select: { id: true },
    orderBy: { firstWentLiveAt: 'asc' },
  });

  const results = { written: 0, thin: 0, failed: 0, skipped: 0, emailed: 0, errors: [] as string[] };
  let attempted = 0;
  for (const c of courses) {
    if (attempted >= PER_RUN) break;
    try {
      const r = await runMonthlyReview(c.id, now);
      if (r.outcome === 'written' || r.outcome === 'thin' || r.outcome === 'failed') attempted++;
      if (r.outcome === 'written') results.written++;
      else if (r.outcome === 'thin') results.thin++;
      else if (r.outcome === 'failed') { results.failed++; results.errors.push(`${c.id} ${r.month}: ${r.error ?? 'failed'}`); }
      else results.skipped++;
      results.emailed += await emailPendingReviews(c.id);
    } catch (err) {
      results.failed++;
      results.errors.push(`${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return NextResponse.json({ ok: results.failed === 0, ...results });
});
