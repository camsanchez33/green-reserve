// CART-4 (Cam 2026-11-09): how a course runs its carts at the starter — pure, browser-safe.
//  • Cart numbers (Course.cartNumbers): off · checkin (asked at check-in, optional) · required (check-in asks until
//    they're typed) · starter (left blank on the starter's sheet; the starter writes them in).
//  • The cart ticket (Course.cartTicket): off · printed (a slip from the group card) · receipt (on the texted/emailed
//    receipt) · both.
//  • The starter's day sheet: the columns the course picked (Course.starterColumns), in this catalog's order.
//    Phone is a golfer's contact, so it prints only for a login with sheet.golfer_contact.
export const CART_NUMBER_MODES = ['off', 'checkin', 'required', 'starter'] as const;
export type CartNumberMode = typeof CART_NUMBER_MODES[number];
export const CART_NUMBER_LABEL: Record<CartNumberMode, string> = {
  off: 'Off',
  checkin: 'Ask at check-in',
  required: 'Required at check-in',
  starter: 'Starter writes them in',
};
export const cartNumberMode = (v: unknown): CartNumberMode => (CART_NUMBER_MODES as readonly string[]).includes(String(v)) ? v as CartNumberMode : 'off';

export const CART_TICKET_MODES = ['off', 'printed', 'receipt', 'both'] as const;
export type CartTicketMode = typeof CART_TICKET_MODES[number];
export const CART_TICKET_LABEL: Record<CartTicketMode, string> = {
  off: 'Off',
  printed: 'Printed slip',
  receipt: 'On the receipt',
  both: 'Printed slip and on the receipt',
};
export const cartTicketMode = (v: unknown): CartTicketMode => (CART_TICKET_MODES as readonly string[]).includes(String(v)) ? v as CartTicketMode : 'off';
export const ticketPrinted = (m: unknown) => ['printed', 'both'].includes(cartTicketMode(m));
export const ticketOnReceipt = (m: unknown) => ['receipt', 'both'].includes(cartTicketMode(m));

export const STARTER_COLUMNS = [
  { key: 'time', label: 'Time' },
  { key: 'tee', label: 'Tee' },
  { key: 'name', label: 'Group' },
  { key: 'players', label: 'Players' },
  { key: 'riding', label: 'Riding' },
  { key: 'carts', label: 'Cart numbers' },
  { key: 'balls', label: 'Range balls' },
  { key: 'paid', label: 'Paid' },
  { key: 'in', label: 'Checked in' },
  { key: 'phone', label: 'Phone' },
  { key: 'notes', label: 'Notes' },
] as const;
export type StarterColumn = typeof STARTER_COLUMNS[number]['key'];
export const DEFAULT_STARTER_COLUMNS: StarterColumn[] = ['time', 'tee', 'name', 'players', 'riding', 'carts', 'paid'];
const KEYS = new Set<string>(STARTER_COLUMNS.map(c => c.key));

/** The course's columns in catalog order; none picked = the default set. Unknown keys are dropped. */
export function starterColumns(picked: readonly string[] | null | undefined): StarterColumn[] {
  const set = new Set((picked ?? []).filter(k => KEYS.has(k)));
  if (set.size === 0) return [...DEFAULT_STARTER_COLUMNS];
  return STARTER_COLUMNS.map(c => c.key).filter(k => set.has(k));
}

/** Cart numbers as staff typed them, tidied: "12,14 , 9" → "12, 14, 9". At most 8, each up to 8 characters. */
export function tidyCartNumbers(raw: unknown): string {
  return String(raw ?? '').split(/[,\s]+/).map(s => s.trim().slice(0, 8)).filter(Boolean).slice(0, 8).join(', ');
}
