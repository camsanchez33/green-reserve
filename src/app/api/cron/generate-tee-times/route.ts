import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cron-auth';
import { generateForAllCourses } from '@/lib/tee-sheet-engine';

export async function GET(req: NextRequest) {
  const denied = cronAuthFailure(req);
  if (denied) return denied;
  const errors = await generateForAllCourses(8);
  if (errors.length > 0) {
    console.error(`Tee time generation completed with ${errors.length} error(s):`, errors);
  }
  return NextResponse.json({ ok: true, errorCount: errors.length, errors });
}
