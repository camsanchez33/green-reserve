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

/**
 * Players added after the headcount was confirmed (a balance paid for it): eventMoney() bills
 * the confirmed number, so they are not in Owed — the strip names them instead of hiding them.
 */
export function pastHeadcount(money: { headcount: number; headcountConfirmed: boolean }, onList: number): number {
  return money.headcountConfirmed ? Math.max(0, onList - money.headcount) : 0;
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
  past: { label: 'past the confirmed headcount', def: '' },
  next: { label: 'next', def: '' },
  covered: { label: 'Covered', def: 'Paid for by the organizer’s bill' },
  notCovered: { label: 'Not covered yet', def: 'The organizer’s payments don’t reach this player yet' },
  coverage: { label: 'Organizer’s bill covers', def: 'Players paid for so far, a full price each, in list order' },
} as const;

/**
 * EVENTS-2 (Cam 2026-11-09: the event page "gives no guidance or structure"): the steps that get an event from
 * saved to played, in order, each done or not from the event's own state — never a guess. The first one not done
 * is what to do next. Which steps apply follows who pays: an organizer's one bill (deposit, headcount, their list)
 * or each player paying on the sign-up page.
 */
export type EventStepKey = 'hold' | 'price' | 'list' | 'deposit' | 'headcount' | 'signup' | 'paid' | 'pairings' | 'checklist';
export type EventTab = 'overview' | 'players' | 'signup' | 'money' | 'checklist' | 'edit';
export type EventStep = { key: EventStepKey; label: string; done: boolean; detail: string; tab: EventTab };
export type StepsInput = {
  payer: string; priceCents: number; heldCount: number; toMove: number; unheld: number;
  onList: number; ungrouped: number; unpaid: number; signupOpen: boolean;
  keptCents: number; guaranteeDue: string | null; guaranteedAt: string | null;
  tasksOpen: number; tasksOverdue: number;
};
const count = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
const dollars = (c: number) => '$' + (c / 100).toFixed(2);
export function eventNextSteps(i: StepsInput): EventStep[] {
  const org = i.payer === 'organizer', players = i.payer === 'players';
  const steps: EventStep[] = [
    { key: 'hold', label: 'Tee times held', tab: 'overview',
      // No times yet (the day is weeks out) is fine: they are made already held. Only a gap needs the course.
      done: i.toMove === 0 && i.unheld === 0,
      detail: i.toMove ? count(i.toMove, 'booked group') + ' in the way' : i.unheld ? count(i.unheld, 'open time') + ' not held' : i.heldCount ? count(i.heldCount, 'tee time') : 'Held as they’re made' },
    { key: 'price', label: 'Price per player', tab: 'edit', done: i.priceCents > 0, detail: i.priceCents > 0 ? dollars(i.priceCents) : 'Not set' },
  ];
  if (org) {
    steps.push({ key: 'deposit', label: 'Deposit taken', tab: 'money', done: i.keptCents > 0, detail: i.keptCents > 0 ? dollars(i.keptCents) + ' in' : 'Nothing in yet' });
    if (i.guaranteeDue) steps.push({ key: 'headcount', label: 'Headcount confirmed', tab: 'money', done: !!i.guaranteedAt, detail: i.guaranteedAt ? 'Confirmed' : 'Due ' + i.guaranteeDue });
    steps.push({ key: 'list', label: 'Player list in', tab: 'players', done: i.onList > 0, detail: i.onList ? count(i.onList, 'player') : 'From the organizer' });
  } else {
    steps.push({ key: 'signup', label: 'Sign-up page open', tab: 'signup', done: i.signupOpen, detail: i.signupOpen ? 'Open' : 'Closed' });
    if (players) steps.push({ key: 'paid', label: 'Everyone paid', tab: 'players', done: i.onList > 0 && i.unpaid === 0, detail: i.onList ? (i.unpaid ? i.unpaid + ' not paid' : 'All paid') : 'No players yet' });
  }
  steps.push(
    { key: 'pairings', label: 'Pairings made', tab: 'players', done: i.onList > 0 && i.ungrouped === 0, detail: i.onList ? (i.ungrouped ? i.ungrouped + ' not in a group' : 'Everyone grouped') : 'No players yet' },
    { key: 'checklist', label: 'Checklist done', tab: 'checklist', done: i.tasksOpen === 0, detail: i.tasksOverdue ? i.tasksOverdue + ' overdue' : i.tasksOpen ? i.tasksOpen + ' left' : 'All done' },
  );
  return steps;
}
