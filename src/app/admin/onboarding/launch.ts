// Onboarding's Launch column (Build #380; Cam 2026-11-12: "to start setting deadlines for courses"). Pure.
// Run: npx tsx scripts/admin-onboarding-test.ts

export const LAUNCH_SOON_DAYS = 7;

/**
 * The colour of an expected launch day (YYYY-MM-DD, a platform day) against today's platform day: past it while
 * still onboarding = overdue (red); within the next 7 days = soon (yellow); otherwise, or not set, no colour.
 */
export function launchTone(day: string | null, today: string): 'bad' | 'warn' | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (day < today) return 'bad';
  const soon = new Date(Date.parse(today + 'T12:00:00Z') + LAUNCH_SOON_DAYS * 86_400_000).toISOString().slice(0, 10);
  return day <= soon ? 'warn' : null;
}

/** A launch day as "Dec 4"; with the year when it isn't this year's. */
export const launchDay = (day: string, today: string) =>
  new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
