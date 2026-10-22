// ADMIN-C Money: which tabs a viewer gets, and where a link to one they can't
// see lands. Payouts and Expenses are the owner's (a second-factor session);
// a link to either from anyone else opens Overview, never a blank page.
export const MONEY_TABS = ['overview', 'uncollected', 'disputes', 'payouts', 'expenses'] as const;
export type MoneyTab = typeof MONEY_TABS[number];
const OWNER_TABS: readonly MoneyTab[] = ['payouts', 'expenses'];

export function isMoneyTab(v: unknown): v is MoneyTab {
  return typeof v === 'string' && (MONEY_TABS as readonly string[]).includes(v);
}

export function visibleMoneyTab(wanted: MoneyTab, isOwner: boolean): MoneyTab {
  return !isOwner && OWNER_TABS.includes(wanted) ? 'overview' : wanted;
}
