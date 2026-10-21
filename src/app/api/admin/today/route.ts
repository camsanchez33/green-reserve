import { NextResponse } from 'next/server';
import { resolveAdminSession, requireRole, requireOwner, SUPPORT_PLUS, MANAGER_PLUS, VIEWER_PLUS } from '@/lib/admin-session';
import { buildActionQueue } from '@/lib/admin-action-queue';
import { todayHealth, todayMoney, todayOnboarding } from '@/lib/admin-today';

// AW-4 (Cam 2026-10-21): the admin Today page — four sections only.
//   needs      what a person has to do now, each with its fix (support+, as the
//              old Overview queue was: it names golfers and money)
//   health     red/green for the things that break silently (manager+, the
//              System page's gate — it reads the same cron log)
//   money      this month so far vs last month to the same point (support+;
//              net after Stripe and expenses is owner-only, as on Revenue)
//   onboarding inquiries by stage, stuck ones named (viewer+, as Inquiries)
// A section a role can't see comes back null and the page leaves it out.
//
// Months are the platform's (US Eastern), like the rest of the admin's days.

export async function GET() {
  const session = await resolveAdminSession();
  if (!session) return NextResponse.json({ error: 'Your session ended — sign in again.' }, { status: 401 });
  const now = new Date();
  const [needs, healthOut, moneyOut, onboardingOut] = await Promise.all([
    requireRole(session, SUPPORT_PLUS) ? buildActionQueue(now) : null,
    requireRole(session, MANAGER_PLUS) ? todayHealth(now) : null,
    requireRole(session, SUPPORT_PLUS) ? todayMoney(now, requireOwner(session)) : null,
    requireRole(session, VIEWER_PLUS) ? todayOnboarding(now) : null,
  ]);
  return NextResponse.json({ needs, health: healthOut, money: moneyOut, onboarding: onboardingOut, at: now.toISOString() });
}
