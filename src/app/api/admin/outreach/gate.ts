// Inquiries data (Cam 2026-11-17): helpers for the /api/admin/outreach routes. Each route checks, in order and
// in its own file: signed in, areaGate(session, 'pipeline') (AW-11), then outreachRole — reads viewer+ like
// GET /api/admin/inquiries, every write manager+ like that route's PATCH/POST. Contact emails and phones go to
// support+ only (Onboarding's rule).
import { NextResponse } from 'next/server';
import { requireRole, MANAGER_PLUS, SUPPORT_PLUS, VIEWER_PLUS, type AdminSession } from '@/lib/admin-session';
import type { Viewer } from '@/lib/outreach-server';

export const signedOut = () => NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });

/** The role check after areaGate: null to go ahead, or the 403. */
export function outreachRole(session: AdminSession, write: boolean): NextResponse | null {
  if (requireRole(session, write ? MANAGER_PLUS : VIEWER_PLUS)) return null;
  return NextResponse.json({ error: write ? 'Only a manager or the owner can change outreach.' : "Your login can't open Inquiries." }, { status: 403 });
}

export const viewerOf = (session: AdminSession): Viewer => ({ canSeeContactDetails: requireRole(session, SUPPORT_PLUS) });

/** A lib Fail → its JSON answer. */
export function failRes(f: { status: number; error: string; [k: string]: unknown }) {
  const { ok: _ok, status, ...body } = f;
  return NextResponse.json(body, { status });
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try { const b = await req.json(); return b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : null; } catch { return null; }
}
