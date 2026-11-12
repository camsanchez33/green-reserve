// ADMIN-REDO Business analytics (Cam 2026-11-12, ADMIN_REDO_SPEC "Business analytics: APPROVED"; decisions
// relayed by Build 2026-11-12). The pure half of /api/admin/business: the courses-joining funnel and the
// average tee sheet filled. Every figure is counted, never estimated.
//
// Courses joining — the steps, in the order they really happen (Build: "Built → Signed"):
//   reached    our first 'out' OutreachTouch                       (outbound courses only)
//   responded  their first 'in' touch, or the move off 'lead'      (an inbound inquiry starts here, at createdAt)
//   calls      first discovery call that was held (outcome 'talked')
//   built      the course was made (builtCourseId → Course.createdAt)
//   signed     the Operator Agreement was accepted (AgreementAcceptance, document 'operator_agreement')
//   live       the inquiry went live (wentLiveAt)
// Who counts (the cohort): inquiries whose FIRST CONTACT fell in the period — our first 'out' touch (or, with none
// logged, the lead's move to Talking), or for an inbound inquiry the day it came in. Every later step is counted as of now. A step counts a course that got at
// least that far (a course can go live without a logged call), so the funnel never grows going down — except
// Responded, which also holds the inbound courses; its % is of the outbound courses that replied.
// Average days at a step: from reaching it to reaching the next step the course reached, over the courses that
// did both.
//
// Tee sheet filled: per live course, players booked ÷ spots on its times that have gone off in the window
// (lib/day-fill's rule, computed in SQL by the route), then the plain average across courses with any spots.

export const JOIN_STEPS = ['reached', 'responded', 'calls', 'built', 'signed', 'live'] as const;
export type JoinStep = typeof JOIN_STEPS[number];

export type InquiryForFunnel = {
  createdAt: Date;
  status: string;
  wentLiveAt: Date | null;
  touches: { at: Date; direction: string }[];
  /** Status events; only a real move off 'lead' is read (not lead→lead notes or a rejected lead). */
  events: { fromStatus: string; toStatus: string; createdAt: Date }[];
  /** Discovery calls. */
  calls: { outcome: string; scheduledAt: Date; completedAt: Date | null }[];
  /** The built course's createdAt, if one was built. */
  builtAt: Date | null;
  /** When the built course first accepted the Operator Agreement. */
  signedAt: Date | null;
};

export type Milestones = { entry: Date | null; inbound: boolean } & Record<JoinStep, Date | null>;

const min = (ds: (Date | null | undefined)[]): Date | null => {
  let best: Date | null = null;
  for (const d of ds) if (d && !Number.isNaN(d.getTime()) && (!best || d < best)) best = d;
  return best;
};

/** When a course reached each step (null = not yet). */
export function milestones(i: InquiryForFunnel): Milestones {
  // A lead is a course WE added (createLead writes a lead→lead "Lead added" event; notes, snooze and source on a
  // lead write lead→lead too). Anything else came in to us — and stays inbound even after we log our own follow-up.
  const wasLead = i.status === 'lead' || i.events.some(e => e.fromStatus === 'lead');
  const inbound = !wasLead;
  const firstOut = min(i.touches.filter(t => t.direction === 'out').map(t => t.at));
  const firstIn = min(i.touches.filter(t => t.direction === 'in').map(t => t.at));
  // The real move off lead: to Talking or further, never lead→lead or a lead we closed.
  const offLead = min(i.events.filter(e => e.fromStatus === 'lead' && !['lead', 'rejected', 'archived'].includes(e.toStatus)).map(e => e.createdAt));
  // A lead moved to Talking with no touch logged was still reached by us: it enters at that move.
  const reached = inbound ? null : (firstOut ?? offLead);
  const responded = inbound ? i.createdAt : min([firstIn, offLead]);
  const calls = min(i.calls.filter(c => c.outcome === 'talked').map(c => c.completedAt ?? c.scheduledAt));
  return {
    inbound,
    entry: inbound ? i.createdAt : reached,
    reached, responded, calls,
    built: i.builtAt, signed: i.signedAt, live: i.wentLiveAt,
  };
}

export type JoiningSteps = {
  steps: { key: JoinStep; count: number; fromPrevPct: number | null; avgDaysAtStep: number | null }[];
  /** The cohort: courses whose first contact fell in the period. */
  entered: number;
  reachedToLive: { pct: number | null; avgDays: number | null };
};

const DAY = 86_400_000;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** The funnel over the courses whose first contact fell in [start, end). */
export function joiningFunnel(all: Milestones[], start: Date, end: Date): JoiningSteps {
  const cohort = all.filter(m => m.entry && m.entry >= start && m.entry < end);
  // "Got at least this far": the step itself or any later one.
  const atLeast = (m: Milestones, k: JoinStep) => JOIN_STEPS.slice(JOIN_STEPS.indexOf(k)).some(s => m[s] != null);
  const counts = JOIN_STEPS.map(k => k === 'reached' ? cohort.filter(m => !m.inbound).length : cohort.filter(m => atLeast(m, k)).length);
  const steps = JOIN_STEPS.map((key, i) => {
    let fromPrevPct: number | null = null;
    if (key === 'responded') fromPrevPct = pct(cohort.filter(m => !m.inbound && atLeast(m, 'responded')).length, counts[0]);
    else if (i > 0) fromPrevPct = pct(counts[i], counts[i - 1]);
    // Days at this step: to the next step this course reached.
    const days: number[] = [];
    for (const m of cohort) {
      const at = m[key];
      if (!at) continue;
      const next = JOIN_STEPS.slice(i + 1).map(s => m[s]).find(d => d != null);
      if (next && next >= at) days.push((next.getTime() - at.getTime()) / DAY);
    }
    return { key, count: counts[i], fromPrevPct, avgDaysAtStep: key === 'live' ? null : avg(days) };
  });
  const live = cohort.filter(m => m.live);
  return {
    steps,
    entered: cohort.length,
    reachedToLive: {
      pct: pct(live.length, cohort.length),
      avgDays: avg(live.filter(m => m.entry && m.live! >= m.entry).map(m => (m.live!.getTime() - m.entry!.getTime()) / DAY)),
    },
  };
}

/** The average of each course's fill (players ÷ spots, whole %), over courses with any spots. */
export function averageFill(perCourse: { players: number; spots: number }[]): number | null {
  const pcts = perCourse.filter(c => c.spots > 0).map(c => (c.players / c.spots) * 100);
  return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
}

/** One course's fill as a whole %, or null with no spots. */
export function fillPct(c: { players: number; spots: number } | undefined): number | null {
  return c && c.spots > 0 ? Math.round((c.players / c.spots) * 100) : null;
}
