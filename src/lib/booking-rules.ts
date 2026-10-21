// W2-6 slice 3 (Cam 2026-10-20: "Booking rules stay course-wide, with per-round
// exceptions (walking/cart, group size, how far ahead) set on that round's
// Schedule tab"). The ONE place a tee time's booking rules are worked out: the
// course's rule, unless the round (CourseProduct) sets its own. Pure — the
// booking route, the public tee-time list and the party-size change all use it.
//
// Walking: Course.walkingAllowed is 'always' | 'weekdays' | 'after12' | 'never',
// and Course.cartRequired forces a cart everywhere. A round's walkingPolicy
// (same words) replaces both for that round. A schedule's own "Golfers can
// walk" box (TeeTime.walkingAllowed) can only take walking away.

export const WALKING_POLICIES = ['always', 'weekdays', 'after12', 'never'] as const;
export type WalkingPolicy = typeof WALKING_POLICIES[number];
export const isWalkingPolicy = (v: unknown): v is WalkingPolicy => typeof v === 'string' && (WALKING_POLICIES as readonly string[]).includes(v);

export type RuleCourse = { walkingAllowed?: string | null; cartRequired?: boolean | null; minPlayers?: number | null; maxPlayers?: number | null; publicAdvanceDays?: number | null };
export type RuleRound = { walkingPolicy?: string | null; minPlayers?: number | null; maxPlayers?: number | null; publicAdvanceDays?: number | null } | null | undefined;

export type Rules = {
  walking: WalkingPolicy;   // the policy that applies
  cartAlways: boolean;      // the course forces a cart and the round doesn't say otherwise
  minPlayers: number;
  maxPlayers: number;
  publicAdvanceDays: number;
};

const DEFAULT_PUBLIC_DAYS = 7;

export function rulesFor(course: RuleCourse, round?: RuleRound): Rules {
  const own = round && isWalkingPolicy(round.walkingPolicy) ? round.walkingPolicy : null;
  const walking: WalkingPolicy = own ?? (isWalkingPolicy(course.walkingAllowed) ? course.walkingAllowed : 'always');
  const minPlayers = clampPlayers(round?.minPlayers ?? course.minPlayers ?? 1);
  const maxPlayers = Math.max(minPlayers, clampPlayers(round?.maxPlayers ?? course.maxPlayers ?? 4));
  return {
    walking,
    cartAlways: !own && !!course.cartRequired,
    minPlayers, maxPlayers,
    // A round only shortens the course's window — even if the course's is lowered later.
    publicAdvanceDays: Math.min(round?.publicAdvanceDays ?? Infinity, course.publicAdvanceDays ?? DEFAULT_PUBLIC_DAYS),
  };
}
const clampPlayers = (n: number) => Math.min(8, Math.max(1, Math.round(Number(n) || 1)));

/** Whether golfers may walk this tee time (date YYYY-MM-DD, time HH:MM, course-local). */
export function walkingAllowedAt(r: Rules, slot: { date: string; time: string; walkingAllowed?: boolean | null }): boolean {
  if (slot.walkingAllowed === false || r.cartAlways) return false;
  switch (r.walking) {
    case 'never': return false;
    case 'after12': return slot.time >= '12:00';
    case 'weekdays': { const d = new Date(`${slot.date}T12:00:00Z`).getUTCDay(); return d >= 1 && d <= 5; }
    default: return true;
  }
}

/** The sentence to refuse a group size with, or null when it's allowed. */
export function groupSizeError(r: Rules, players: number): string | null {
  if (players < r.minPlayers) return `These tee times are for groups of ${r.minPlayers} or more.`;
  if (players > r.maxPlayers) return `These tee times take up to ${r.maxPlayers} player${r.maxPlayers === 1 ? '' : 's'} per booking.`;
  return null;
}

/** Validate a round's rules from the owner's form. Blank / null = the course's rule. */
export function readRoundRules(body: Record<string, unknown>, course: RuleCourse):
  { ok: true; data: { walkingPolicy: string | null; minPlayers: number | null; maxPlayers: number | null; publicAdvanceDays: number | null } } | { ok: false; error: string } {
  const opt = (v: unknown, lo: number, hi: number, what: string): number | null | string => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : `${what} must be a whole number from ${lo} to ${hi}, or blank for the course's rule.`;
  };
  const w = body.walkingPolicy;
  if (!(w === null || w === undefined || w === '' || isWalkingPolicy(w))) return { ok: false, error: 'Pick when golfers can walk, or leave it as the course rule.' };
  const min = opt(body.minPlayers, 1, 8, 'Fewest players');
  const max = opt(body.maxPlayers, 1, 8, 'Most players');
  const days = opt(body.publicAdvanceDays, 1, 365, 'Days ahead');
  for (const x of [min, max, days]) if (typeof x === 'string') return { ok: false, error: x };
  // A round can shorten the public window, never reach past it: the course's
  // window drives the date picker and how far ahead tee times are made.
  const courseDays = course.publicAdvanceDays ?? DEFAULT_PUBLIC_DAYS;
  if (typeof days === 'number' && days > courseDays) return { ok: false, error: `A round can open up to ${courseDays} days ahead — the course's own window. To open further ahead, change it in Settings → Booking rules first.` };
  const data = { walkingPolicy: isWalkingPolicy(w) ? w : null, minPlayers: min as number | null, maxPlayers: max as number | null, publicAdvanceDays: days as number | null };
  if ((data.minPlayers ?? course.minPlayers ?? 1) > (data.maxPlayers ?? course.maxPlayers ?? 4)) return { ok: false, error: `The fewest players (${data.minPlayers ?? course.minPlayers}) can't be more than the most (${data.maxPlayers ?? course.maxPlayers}).` };
  return { ok: true, data };
}
