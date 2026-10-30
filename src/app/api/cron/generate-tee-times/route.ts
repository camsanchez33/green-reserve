import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cron-auth';
import { cronRoute } from '@/lib/cron-log';
import { generateForAllCourses } from '@/lib/tee-sheet-engine';
import { demandDue, refreshDemand } from '@/lib/demand-pricing';

export const GET = cronRoute('generate-tee-times', async (req: NextRequest) => {
  // cronRoute authorises before logging; the check stays here too so every
  // cron route is visibly guarded on its own.
  const denied = cronAuthFailure(req);
  if (denied) return denied;
  const errors = await generateForAllCourses(8);
  if (errors.length > 0) {
    console.error(`Tee time generation completed with ${errors.length} error(s):`, errors);
  }
  // PRICE-5: each demand-priced course's weekly suggestions (applied when the course chose automatic).
  const demand: Record<string, string> = {};
  for (const c of await demandDue()) {
    try { demand[c.id] = await refreshDemand(c.id); }
    catch (err) { demand[c.id] = 'failed'; errors.push({ courseId: c.id, date: '', error: `demand pricing: ${err instanceof Error ? err.message : String(err)}` }); }
  }
  return NextResponse.json({ ok: true, errorCount: errors.length, errors, demand });
});
