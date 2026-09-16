// COURSE_LAYOUT_SPEC L2 — conflict detection for product-scoped schedules.
//
// Products know their nines. If two ACTIVE schedules overlap in time on the
// same days AND their products share a nine, the save is blocked with a
// plain-English reason ("South is in use by North + South until 12:00").
// This is what makes operator-configured rotation safe. Pure, so it is tested
// without a database.

export type ConflictSchedule = {
  id?: string | null;
  productId?: string | null;
  daysOfWeek: number[];
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  active?: boolean;
};
export type ConflictProduct = { id: string; label: string; nineIds: string[] };
export type ConflictNine = { id: string; name: string };

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function clock(t: string): string {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Empty daysOfWeek means "every day" (the engine treats it that way). */
function daysOf(s: ConflictSchedule): number[] {
  return s.daysOfWeek.length ? s.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
}

/**
 * Returns null when the candidate can be saved, else the sentence to show.
 * `others` are the course's other schedules (the candidate's own id is skipped).
 */
export function findScheduleConflict(
  candidate: ConflictSchedule,
  others: ConflictSchedule[],
  products: ConflictProduct[],
  nines: ConflictNine[],
): string | null {
  if (candidate.active === false) return null;
  const mine = candidate.productId ? products.find(p => p.id === candidate.productId) : null;
  const nineName = (id: string) => nines.find(n => n.id === id)?.name || 'a nine';
  const cDays = daysOf(candidate);

  for (const o of others) {
    if (candidate.id && o.id === candidate.id) continue;
    if (o.active === false) continue;
    const sharedDays = daysOf(o).filter(d => cDays.includes(d));
    if (!sharedDays.length) continue;
    const overlaps = candidate.startTime < o.endTime && o.startTime < candidate.endTime;
    if (!overlaps) continue;

    const theirs = o.productId ? products.find(p => p.id === o.productId) : null;
    // Two schedules with no product (the simple course) or the same product
    // cover the same time — the pre-L2 rule, kept.
    const sameScope = (!mine && !theirs) || (mine && theirs && mine.id === theirs.id);
    if (sameScope) {
      const label = mine ? `"${mine.label}"` : 'the course';
      return `This overlaps another schedule for ${label} on ${sharedDays.map(d => DAY[d]).join(', ')} (${clock(o.startTime)} – ${clock(o.endTime)}). Two schedules can't cover the same time on the same day.`;
    }
    if (!mine || !theirs) continue; // a product schedule and an unscoped one do not share nines we can check
    const shared = mine.nineIds.filter(id => theirs.nineIds.includes(id));
    if (!shared.length) continue;
    const until = clock(o.endTime);
    const dayText = sharedDays.length === 7 ? 'every day' : sharedDays.map(d => DAY[d]).join(', ');
    return `${nineName(shared[0])} is in use by "${theirs.label}" until ${until} on ${dayText}. Move this schedule to start at ${until} or later, or give "${mine.label}" a different nine.`;
  }
  return null;
}
