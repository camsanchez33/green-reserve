// W2-9: which event holds a tee time. Pure — read by lib/course-events (when an
// event is saved) and lib/tee-sheet-engine (when a day's tee times are made, so
// a time generated after the event was set up is created already held).
//
// Cam 2026-10-22: an event either closes the whole course in its window, or
// shares it — then only the nines it uses are held (holdNineIds; empty = every
// nine) and the times the course chose to keep open (keepOpen) stay bookable.

export type HoldEvent = {
  id: string; format: string; holdFrom: string; holdTo: string; productId: string | null; status: string;
  shareCourse?: boolean; holdNineIds?: string[]; keepOpen?: string[];
};

/**
 * The planned event (if any) holding a tee time at `time` for round `productId`.
 * `slotNines` = the nines that round is played on; null when unknown (a simple
 * course, or a round with no nines) — it then counts as using every nine.
 */
export function heldBy<E extends HoldEvent>(events: E[], productId: string | null, time: string, slotNines: string[] | null = null): E | null {
  return events.find(e => {
    if (e.status !== 'planned' || time < e.holdFrom || time > e.holdTo) return false;
    if (e.format !== 'shotgun' && e.productId && e.productId !== productId) return false;
    if (!e.shareCourse) return true;
    if ((e.keepOpen ?? []).includes(time)) return false;
    const nines = e.holdNineIds ?? [];
    if (nines.length && slotNines && slotNines.length && !slotNines.some(n => nines.includes(n))) return false;
    return true;
  }) ?? null;
}

/** productId → the nines that round is played on (null-safe lookup for heldBy). */
export function ninesByProduct(products: { id: string; nineIds: string[] }[]): (productId: string | null) => string[] | null {
  const m = new Map(products.map(p => [p.id, p.nineIds]));
  return id => (id ? m.get(id) ?? null : null);
}
