import { NextRequest, NextResponse } from 'next/server';
import { generateForAllCourses } from '@/lib/tee-sheet-engine';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await generateForAllCourses(8);
  return NextResponse.json({ ok: true });
}
