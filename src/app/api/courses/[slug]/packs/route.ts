import { NextResponse } from 'next/server';
import { PACKS_OFF } from '@/lib/round-packs-switch';

// PRICE-3 round packs online. Two things keep this closed: packs are turned off (POS-6, lib/round-packs-switch),
// and the rounds were held by the signed-in golfer's account email, which no longer exists (Cam 2026-11-18: no
// GreenReserve golfer accounts; sign-in is per course). Packs held already are handled by staff at the counter.
export async function GET() {
  return NextResponse.json({ packs: [], mine: [], signedIn: false }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  return NextResponse.json({ error: PACKS_OFF }, { status: 410 });
}
