// EVENTS-1 (Cam 2026-11-04, "events command center"): the top of one event — where it stands
// at a glance — and, for an event the organizer pays as one bill, how many players that bill
// covers so far ("Covered count", Cam's pick). Pure and client-safe; the money figures are
// lib/event-payments eventMoney()'s, so this page and the Money card never disagree.

export type StripInput = {
  /** CourseEvent.players: the spots the event offers (0 = no cap set). */
  capacity: number;
  /** Players on the list (status 'in'). */
  onList: number;
  /** Online sign-ups still holding a spot while they pay. */
  holding: number;
  money: { keptCents: number; owedCents: number; openCents: number };
  tasks: { doneAt: string | null; dueDate: string | null }[];
  today: string;
};

export type Strip = {
  registered: number; capacity: number | null; spotsLeft: number | null;
  collectedCents: number; owedCents: number; sentCents: number;
  tasksLeft: number; overdue: number; nextDue: string | null;
};

export function eventStrip(i: StripInput): Strip {
  const open = i.tasks.filter(t => !t.doneAt);
  const dues = open.map(t => t.dueDate).filter((d): d is string => !!d).sort();
  return {
    registered: i.onList,
    capacity: i.capacity > 0 ? i.capacity : null,
    spotsLeft: i.capacity > 0 ? Math.max(0, i.capacity - i.onList - i.holding) : null,
    collectedCents: i.money.keptCents, owedCents: i.money.owedCents, sentCents: i.money.openCents,
    tasksLeft: open.length, overdue: dues.filter(d => d < i.today).length, nextDue: dues.find(d => d >= i.today) ?? null,
  };
}

/**
 * How many players the organizer's money covers: what was kept (paid less refunded), a whole
 * player's price at a time, never more than the list. No price set = nothing to cover against.
 */
export function coveredCount(keptCents: number, priceCents: number, onList: number): number {
  if (priceCents <= 0 || keptCents <= 0) return 0;
  return Math.min(onList, Math.floor(keptCents / priceCents));
}

/** The words on the strip, each with its definition behind the label (DENSE). */
export const STRIP_TERMS = {
  registered: { label: 'Registered', def: 'Players on the list, of the spots the event offers' },
  spotsLeft: { label: 'Spots left', def: 'Spots not taken, counting online sign-ups still paying' },
  collected: { label: 'Collected', def: 'Paid to the course for this event, less refunds' },
  owed: { label: 'Owed', def: 'The event’s total at its headcount, less what was collected' },
  sent: { label: 'pay links out', def: '' },
  tasks: { label: 'Tasks left', def: 'Checklist items not done yet' },
  overdue: { label: 'overdue', def: '' },
  next: { label: 'next', def: '' },
  covered: { label: 'Covered', def: 'Paid for by the organizer’s bill' },
  notCovered: { label: 'Not covered yet', def: 'The organizer’s payments don’t reach this player yet' },
  coverage: { label: 'Organizer’s bill covers', def: 'Players paid for so far, a full price each, in list order' },
} as const;
