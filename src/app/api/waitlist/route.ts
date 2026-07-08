import { NextResponse } from 'next/server';

// Replaced by /api/alerts
export async function POST() {
  return NextResponse.json({ error: 'Use /api/alerts' }, { status: 410 });
}
