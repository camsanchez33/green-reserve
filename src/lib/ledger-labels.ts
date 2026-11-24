// What a money-ledger row's kind and method read as (LEDGER-2). Pure and client-safe: the
// dashboard's ledger tab imports these, so this file must never import prisma, Stripe or a
// secret (scripts/client-bundle-test.ts checks). lib/ledger-view re-exports them.

const LABEL: Record<string, string> = {
  round: 'Round', hold: 'Cancellation hold', late_fee: 'Late-cancel fee', no_show_fee: 'No-show fee',
  booking_fee: 'GreenReserve booking fee', shop: 'Pro shop', dues: 'Membership dues', event: 'Event', account: 'Member account',
};
const METHOD: Record<string, string> = { card: 'Card', card_present: 'Card reader', cash: 'Cash', other: 'Check or other' };
export const moveLabel = (what: string) => LABEL[what] ?? what;
export const methodLabel = (m: string) => METHOD[m] ?? m;
