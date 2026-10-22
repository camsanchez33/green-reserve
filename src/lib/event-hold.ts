// W2-9: which event holds a tee time. Pure — read by lib/course-events (when an
// event is saved) and lib/tee-sheet-engine (when a day's tee times are made, so
// a time generated after the event was set up is created already held).

export type HoldEvent = { id: string; format: string; holdFrom: string; holdTo: string; productId: string | null; status: string };

/** The planned event (if any) holding a tee time at `time` for round `productId`. A shotgun holds every round. */
export function heldBy<E extends HoldEvent>(events: E[], productId: string | null, time: string): E | null {
  return events.find(e => e.status === 'planned' && time >= e.holdFrom && time <= e.holdTo
    && (e.format === 'shotgun' || !e.productId || e.productId === productId)) ?? null;
}
