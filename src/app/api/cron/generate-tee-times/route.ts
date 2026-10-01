import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cron-auth';
import { cronRoute } from '@/lib/cron-log';
import { generateForAllCourses } from '@/lib/tee-sheet-engine';

export const GET = cronRoute('generate-tee-times', async (req: NextRequest) => {
  // cronRoute authorises before logging; the check stays here too so every
  // cron route is visibly guarded on its own.
  const denied = cronAuthFailure(req);
  if (denied) return denied;
  const errors = await generateForAllCourses(8);
  if (errors.length > 0) {
    console.error(`Tee time generation completed with ${errors.length} error(s):`, errors);
  }
  return NextResponse.json({ ok: true, errorCount: errors.length, errors });
});
