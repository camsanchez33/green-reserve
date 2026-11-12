// Expenses (ADMIN-REDO, Cam approved the mockup 2026-11-12): the definitions behind the labels (DENSE: they live
// behind the label, not on the page) and the page's fixed wording.

export const TERMS = {
  monthly: 'What keeps GreenReserve running a month today: monthly costs plus yearly ones divided by 12 (one-time costs are not monthly). Compared with the same day last month',
  budget: 'What this month has cost so far (one-time costs included, running costs counted by the day) against the monthly budget you set',
  year: 'What January 1 to today has cost, one-time costs included, against January 1 to the same day last year',
  howMuch: 'What is paid each time',
} as const;

export const CADENCE_WORDS: Record<string, string> = { monthly: 'Every month', annual: 'Every year', 'one-time': 'Once' };

export const SESSION_ENDED = 'Your session ended — sign in again.';
export const loadFailed = (status?: number) =>
  status ? `Expenses didn't load (error ${status}). Try again.` : "Expenses didn't load. Check your connection and try again.";

/** Errors and confirmations (kept here so the page stays label · value). */
export const MSG = {
  offline: '— check your connection and try again.',
  noName: 'Say what it is.',
  badAmount: 'How much must be an amount above zero, like 20 or 20.00.',
  noDate: 'Pick the date it started.',
  saveFail: "Couldn't save the change", addFail: "Couldn't add it", endFail: "Couldn't end it",
  restartFail: "Couldn't restart it", deleteFail: "Couldn't delete it",
  confirmEnd: (name: string) => `End "${name}" today? It stops counting from today and stays in the months it was paid. It can't be reopened; Restart adds it again from that day.`,
  confirmDelete: (name: string) => `Delete "${name}"? It disappears from past months too. To stop counting it from today and keep its months, use End it.`,
  none: 'No expenses yet. Add what GreenReserve pays for.',
  noneHere: 'Nothing here for this filter.',
  badBudget: 'The budget must be an amount above zero, like 300 or 300.00.',
  budgetFail: "Couldn't save the budget",
  historyFail: (status?: number) => status ? `History didn't load (error ${status}).` : "History didn't load.",
} as const;
