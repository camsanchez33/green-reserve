// W2-6 slice 3 (Cam 2026-10-20: "Booking rules stay course-wide, with per-round
// exceptions (walking/cart, group size, how far ahead) set on that round's
// Schedule tab"). The ONE place a tee time's booking rules are worked out: the
// course's rule, unless the round (CourseProduct) sets its own. Pure — the
// booking route, the public tee-time list and the party-size change all use it.
//
// Walking (CART-1, Cam 2026-10-24: walking moves into the price table): each
// tee time says itself whether golfers may walk (TeeTime.walkingAllowed, from
// its price-table cell, weekday or weekend). The old course-wide word
// (Course.walkingAllowed / cartRequired) and a round's walkingPolicy are no
// longer read for booking.

export type RuleCourse = { minPlayers?: number | null; maxPlayers?: number | null; publicAdvanceDays?: number | null };
export type RuleRound = { minPlayers?: number | null; maxPlayers?: number | null; publicAdvanceDays?: number | null } | null | undefined;

export type Rules = {
  minPlayers: number;
  maxPlayers: number;
  publicAdvanceDays: number;
};

const DEFAULT_PUBLIC_DAYS = 7;

export function rulesFor(course: RuleCourse, round?: RuleRound): Rules {
  const minPlayers = clampPlayers(round?.minPlayers ?? course.minPlayers ?? 1);
  const maxPlayers = Math.max(minPlayers, clampPlayers(round?.maxPlayers ?? course.maxPlayers ?? 4));
  return {
    minPlayers, maxPlayers,
    // A round only shortens the course's window — even if the course's is lowered later.
    publicAdvanceDays: Math.min(round?.publicAdvanceDays ?? Infinity, course.publicAdvanceDays ?? DEFAULT_PUBLIC_DAYS),
  };
}
const clampPlayers = (n: number) => Math.min(8, Math.max(1, Math.round(Number(n) || 1)));

/** Whether golfers may walk this tee time: its own price-table cell says (CART-1). */
export function walkingAllowedAt(slot: { walkingAllowed?: boolean | null }): boolean {
  return slot.walkingAllowed !== false;
}

/** The sentence to refuse a group size with, or null when it's allowed. */
export function groupSizeError(r: Rules, players: number): string | null {
  if (players < r.minPlayers) return `These tee times are for groups of ${r.minPlayers} or more.`;
  if (players > r.maxPlayers) return `These tee times take up to ${r.maxPlayers} player${r.maxPlayers === 1 ? '' : 's'} per booking.`;
  return null;
}

/** Validate a round's rules from the owner's form. Blank / null = the course's rule. */
export function readRoundRules(body: Record<string, unknown>, course: RuleCourse):
  { ok: true; data: { minPlayers: number | null; maxPlayers: number | null; publicAdvanceDays: number | null } } | { ok: false; error: string } {
  const opt = (v: unknown, lo: number, hi: number, what: string): number | null | string => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : `${what} must be a whole number from ${lo} to ${hi}, or blank for the course's rule.`;
  };
  const min = opt(body.minPlayers, 1, 8, 'Fewest players');
  const max = opt(body.maxPlayers, 1, 8, 'Most players');
  const days = opt(body.publicAdvanceDays, 1, 365, 'Days ahead');
  for (const x of [min, max, days]) if (typeof x === 'string') return { ok: false, error: x };
  // A round can shorten the public window, never reach past it: the course's
  // window drives the date picker and how far ahead tee times are made.
  const courseDays = course.publicAdvanceDays ?? DEFAULT_PUBLIC_DAYS;
  if (typeof days === 'number' && days > courseDays) return { ok: false, error: `A round can open up to ${courseDays} days ahead — the course's own window. To open further ahead, change it in Settings → Booking rules first.` };
  const data = { minPlayers: min as number | null, maxPlayers: max as number | null, publicAdvanceDays: days as number | null };
  if ((data.minPlayers ?? course.minPlayers ?? 1) > (data.maxPlayers ?? course.maxPlayers ?? 4)) return { ok: false, error: `The fewest players (${data.minPlayers ?? course.minPlayers}) can't be more than the most (${data.maxPlayers ?? course.maxPlayers}).` };
  return { ok: true, data };
}
