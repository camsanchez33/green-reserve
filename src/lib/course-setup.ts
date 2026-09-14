// COURSES_SHEET_SPEC CS-1 §1 — the five setup steps a built course goes
// through before it is live. Nothing new is tracked: every step reads a field
// the product already keeps. Steps are independent, not sequential —
// `verified` can be done while `approved` is not; `done` counts whatever is
// true. Used by the courses sheet (CS-2) and the course page's Setup card (CS-3).

export type SetupCourseLike = {
  active: boolean;
  liveStatus: string;
  stripeAccountActive: boolean;
  /** 'none' | 'approved' | 'changes_requested' — from latestPageDecision */
  approvalStatus?: string | null;
  operator?: { emailVerified?: boolean | null } | null;
};

export type SetupStepKey = 'draft' | 'approved' | 'verified' | 'stripe' | 'live';

export type SetupStep = {
  key: SetupStepKey;
  label: string;
  short: string;
  done: (c: SetupCourseLike) => boolean;
};

export const SETUP_STEPS: SetupStep[] = [
  { key: 'draft', label: 'Draft page built', short: 'Draft', done: () => true },
  { key: 'approved', label: 'Course approved their page', short: 'Approved', done: c => c.approvalStatus === 'approved' },
  { key: 'verified', label: 'Operator verified their email', short: 'Verified', done: c => !!c.operator?.emailVerified },
  { key: 'stripe', label: 'Stripe connected', short: 'Stripe', done: c => !!c.stripeAccountActive },
  { key: 'live', label: 'Live on the public site', short: 'Live', done: c => !!c.active && c.liveStatus === 'live' },
];

export type SetupProgress = {
  done: number;
  total: 5;
  /** The first step not done, skipping `draft`. Null when everything is done. */
  next: { key: SetupStepKey; label: string; short: string } | null;
  /** Every step with its state — for the Setup card. */
  steps: { key: SetupStepKey; label: string; short: string; done: boolean }[];
};

export function setupProgress(c: SetupCourseLike): SetupProgress {
  const steps = SETUP_STEPS.map(s => ({ key: s.key, label: s.label, short: s.short, done: s.done(c) }));
  const next = steps.find(s => s.key !== 'draft' && !s.done) ?? null;
  return {
    done: steps.filter(s => s.done).length,
    total: 5,
    next: next ? { key: next.key, label: next.label, short: next.short } : null,
    steps,
  };
}
