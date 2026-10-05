// SP-A (STAFF_POLICY_SPEC Part A). What a staff login may do, decided per person
// by the course owner in Settings → Staff & permissions. ONE catalog: the
// server gates (requirePermission), the Settings screen and the staff UI all
// read it, so a label can never describe a different rule than the one enforced.
//
// Owners have every permission. Staff have exactly the keys on their row — or,
// for a row the owner has never set (permissionsSetAt null), the LEGACY preset:
// what staff could do before SP-A, minus the two powers that move money
// (weather cancel and waiving a fee). Client-safe: no Node or Prisma imports.

export type PermissionKey =
  | 'sheet.view' | 'sheet.checkin' | 'sheet.counter_payment' | 'sheet.walkin' | 'sheet.no_show'
  | 'sheet.cancel' | 'sheet.waive_fee' | 'sheet.block' | 'sheet.edit_times' | 'sheet.delay_start'
  | 'sheet.weather_cancel' | 'sheet.golfer_contact'
  | 'money.cancellations' | 'money.payments' | 'money.refund' | 'money.charge_fee' | 'money.payouts'
  | 'members.view' | 'members.edit'
  | 'schedule.view' | 'schedule.edit'
  | 'analytics.view' | 'messages.use' | 'settings.edit';

export interface PermissionDef {
  key: PermissionKey;
  group: 'Tee sheet' | 'Money' | 'Members' | 'Schedule' | 'Course';
  label: string;
  /** One plain line under the toggle. */
  help: string;
  /** Keys this one needs; turning it on turns these on. */
  requires?: PermissionKey[];
  /** Shown as "Moves money" on the Settings screen. */
  movesMoney?: boolean;
  /** Always on for every staff login (they exist to run the sheet). */
  locked?: boolean;
}

export const PERMISSIONS: PermissionDef[] = [
  { key: 'sheet.view', group: 'Tee sheet', label: 'See the tee sheet', help: 'Every staff login can see the day’s tee times.', locked: true },
  { key: 'sheet.checkin', group: 'Tee sheet', label: 'Check groups in', help: 'Check in a group and take a card payment at check-in.' },
  { key: 'sheet.counter_payment', group: 'Tee sheet', label: 'Mark paid at the counter', help: 'Record a round paid in cash or at the pro shop.' },
  { key: 'sheet.walkin', group: 'Tee sheet', label: 'Add walk-ins and phone bookings', help: 'Book an open time for someone at the counter or on the phone.' },
  { key: 'sheet.no_show', group: 'Tee sheet', label: 'Mark no-shows', help: 'Mark a group that never arrived, or undo it with “still coming”.' },
  { key: 'sheet.cancel', group: 'Tee sheet', label: 'Cancel a booking', help: 'Cancel one booking. Your late-cancellation rule still applies.' },
  { key: 'sheet.waive_fee', group: 'Tee sheet', label: 'Waive the late fee', help: 'Cancel without the late fee — refunds a hold already taken.', requires: ['sheet.cancel'], movesMoney: true },
  { key: 'sheet.block', group: 'Tee sheet', label: 'Block and open times', help: 'Block a tee time so nobody can book it, or open it again.' },
  { key: 'sheet.edit_times', group: 'Tee sheet', label: 'Add and delete tee times', help: 'Add an extra time or remove an empty one.' },
  { key: 'sheet.delay_start', group: 'Tee sheet', label: 'Weather: delay the start', help: 'Frost delay — move early groups into later open times and email them.' },
  { key: 'sheet.weather_cancel', group: 'Tee sheet', label: 'Weather: cancel times', help: 'Cancel every booking in a window or the whole day, with no fee, and email golfers.', requires: ['sheet.cancel'], movesMoney: true },
  { key: 'sheet.golfer_contact', group: 'Tee sheet', label: 'See golfer email and phone', help: 'Shows contact details on the sheet and in bookings.' },
  { key: 'money.cancellations', group: 'Money', label: 'See cancellations', help: 'The list of cancelled bookings and any fees kept.' },
  { key: 'money.payments', group: 'Money', label: 'See payments', help: 'What was charged, per booking and in total.' },
  { key: 'money.refund', group: 'Money', label: 'Issue refunds', help: 'Refund a charge back to the golfer’s card.', requires: ['money.payments'], movesMoney: true },
  { key: 'money.charge_fee', group: 'Money', label: 'Charge a fee by hand', help: 'Charge a late or no-show fee to the card on file.', movesMoney: true },
  { key: 'money.payouts', group: 'Money', label: 'See payouts', help: 'What Stripe has paid out to the course.' },
  { key: 'members.view', group: 'Members', label: 'See members', help: 'The member list and who is paid up.' },
  { key: 'members.edit', group: 'Members', label: 'Manage members', help: 'Add and edit members and send dues reminders.', requires: ['members.view'] },
  { key: 'schedule.view', group: 'Schedule', label: 'See the schedule', help: 'Schedules, intervals, rates and blocked days.' },
  { key: 'schedule.edit', group: 'Schedule', label: 'Edit the schedule', help: 'Change schedules and rates, block whole days, rebuild the sheet.', requires: ['schedule.view'] },
  { key: 'analytics.view', group: 'Course', label: 'See analytics', help: 'Revenue, utilization, no-shows and customers.' },
  { key: 'messages.use', group: 'Course', label: 'Message GreenReserve', help: 'Send and read messages with the GreenReserve team.' },
  { key: 'settings.edit', group: 'Course', label: 'Edit course settings', help: 'Course details, booking rules and facilities. Never staff, Stripe, the agreement or the cancellation policy.' },
];

export const ALL_KEYS = PERMISSIONS.map(p => p.key);
const VALID = new Set<string>(ALL_KEYS);
const DEF = new Map(PERMISSIONS.map(p => [p.key, p]));

export type PresetKey = 'starter' | 'front_desk' | 'manager';

export const PRESETS: { key: PresetKey; label: string; help: string; keys: PermissionKey[] }[] = [
  { key: 'starter', label: 'Starter', help: 'Sees the sheet, checks groups in, marks no-shows.',
    keys: ['sheet.view', 'sheet.checkin', 'sheet.no_show', 'messages.use'] },
  { key: 'front_desk', label: 'Front desk', help: 'Runs the counter: payments, walk-ins, cancellations, blocking.',
    keys: ['sheet.view', 'sheet.checkin', 'sheet.no_show', 'messages.use', 'sheet.counter_payment', 'sheet.walkin', 'sheet.cancel', 'sheet.block', 'sheet.golfer_contact', 'money.cancellations'] },
  { key: 'manager', label: 'Manager', help: 'Everything a staff login can be given.', keys: [...ALL_KEYS] },
];

/** Staff created before SP-A: today's powers minus weather cancel and waiving a fee. */
export const LEGACY_KEYS: PermissionKey[] = [
  'sheet.view', 'sheet.checkin', 'sheet.counter_payment', 'sheet.walkin', 'sheet.no_show', 'sheet.cancel',
  'sheet.block', 'sheet.edit_times', 'sheet.delay_start', 'sheet.golfer_contact', 'money.cancellations', 'messages.use',
];

/**
 * Clean a requested set: drop unknown keys, always include locked keys, and add
 * every prerequisite (so `sheet.weather_cancel` brings `sheet.cancel`). Sorted
 * in catalog order so a stored row reads the same way every time.
 */
export function normalizePermissions(keys: readonly string[]): PermissionKey[] {
  const out = new Set<PermissionKey>(PERMISSIONS.filter(p => p.locked).map(p => p.key));
  const add = (k: PermissionKey) => {
    if (out.has(k) && !DEF.get(k)?.locked) return;
    out.add(k);
    for (const r of DEF.get(k)?.requires ?? []) add(r);
  };
  for (const k of keys) if (VALID.has(k)) add(k as PermissionKey);
  return ALL_KEYS.filter(k => out.has(k));
}

/** Turning a key OFF also turns off everything that requires it. */
export function withoutPermission(keys: readonly PermissionKey[], off: PermissionKey): PermissionKey[] {
  const removed = new Set<PermissionKey>([off]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of PERMISSIONS) {
      if (!removed.has(p.key) && p.requires?.some(r => removed.has(r))) { removed.add(p.key); grew = true; }
    }
  }
  return normalizePermissions(keys.filter(k => !removed.has(k) || DEF.get(k)?.locked));
}

/** Which preset a set matches exactly, else "custom". */
export function presetFor(keys: readonly PermissionKey[]): PresetKey | 'custom' {
  const s = normalizePermissions(keys).join(',');
  return PRESETS.find(p => normalizePermissions(p.keys).join(',') === s)?.key ?? 'custom';
}

/** The effective keys for a staff row. */
export function resolveStaffPermissions(row: { permissions: string[]; permissionsSetAt: Date | string | null }): PermissionKey[] {
  return row.permissionsSetAt ? normalizePermissions(row.permissions) : normalizePermissions(LEGACY_KEYS);
}

export function labelFor(key: PermissionKey): string {
  return DEF.get(key)?.label ?? key;
}

/** The 403 message a staff login sees when a permission is missing. */
export function deniedMessage(key: PermissionKey): string {
  return `Your login can’t do this — ask the course owner to turn on “${labelFor(key)}” for you in Settings → Staff & permissions.`;
}
