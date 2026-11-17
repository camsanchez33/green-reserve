// Team (Cam 2026-11-17, lanes/dashboard.md item 8). The access model on top of
// SP-A's permission keys (staff-permissions.ts), which stay the only thing the
// server checks — requirePermission(session, key) everywhere, unchanged.
//
//  - A ROLE is a named set of keys, per course. A new course has none: only the
//    Owner (the course operator, every key, not a row). Suggested roles below
//    are created only when the owner picks one.
//  - A PERSON with a role has the role's keys plus their own grants minus their
//    own revokes. Changing the role changes everyone in it; their overrides stay.
//  - A PERSON with no role (everyone who existed before Team) keeps exactly the
//    keys on their row, or the Legacy preset — resolveStaffPermissions, as today.
//    That is why Team needs no backfill.
//  - AREAS are the six plain switches (No access / View / Full) the role editor
//    shows; each maps onto keys. The keys stay editable as Advanced.
//
// Client-safe: no Node or Prisma imports.
import {
  ALL_KEYS, PERMISSIONS, PRESETS, normalizePermissions, resolveStaffPermissions, withoutPermission,
  type PermissionKey,
} from './staff-permissions';

export type AreaKey = 'sheet' | 'payments' | 'shop' | 'members' | 'reports' | 'settings';
export type AreaLevel = 'none' | 'view' | 'full';

export interface AreaDef {
  key: AreaKey;
  label: string;
  help: string;
  /** The keys each offered level gives in this area. A level missing here is not offered. */
  levels: Partial<Record<AreaLevel, PermissionKey[]>>;
}

export const AREAS: AreaDef[] = [
  {
    key: 'sheet', label: 'Tee sheet & bookings',
    help: 'Every login sees the tee sheet. Full adds check-in, walk-ins, moves, cancels (and waiving the late fee), blocking, weather and messaging golfers.',
    // sheet.view is locked on for every staff login, so "No access" is not offered.
    levels: {
      view: ['sheet.view'],
      full: ['sheet.view', 'sheet.checkin', 'sheet.counter_payment', 'sheet.walkin', 'sheet.move', 'sheet.no_show', 'sheet.cancel',
        'sheet.waive_fee', 'sheet.block', 'sheet.edit_times', 'sheet.delay_start', 'sheet.weather_cancel', 'sheet.golfer_contact',
        'sheet.message_golfers', 'sheet.course_alert'],
    },
  },
  {
    key: 'payments', label: 'Payments & refunds',
    help: 'View shows payments, cancellations and payouts. Full adds refunds. Refunding rounds is given person by person under Advanced.',
    levels: {
      none: [],
      view: ['money.cancellations', 'money.payments', 'money.payouts'],
      // Cam 2026-10-29: "Refund rounds" is in no preset — so in no area level either.
      // Waiving the late fee (it needs sheet.cancel) is under the tee sheet, so no level reaches into another area:
      // the result never depends on the order areas are applied (final review, 2026-11-17).
      full: ['money.cancellations', 'money.payments', 'money.payouts', 'money.refund'],
    },
  },
  {
    key: 'shop', label: 'Pro shop & register',
    help: 'Selling, discounts, returns, and opening and closing the register. The catalog is under Settings.',
    // There is no read-only shop key, so "View" is not offered.
    levels: {
      none: [],
      full: ['shop.sell', 'shop.discount', 'shop.open', 'shop.open_fix', 'shop.close', 'shop.return'],
    },
  },
  {
    key: 'members', label: 'Members & events',
    help: 'View shows the member list. Full adds managing members and running events.',
    levels: {
      none: [],
      view: ['members.view'],
      full: ['members.view', 'members.edit', 'events.manage'],
    },
  },
  {
    key: 'reports', label: 'Reports',
    help: 'Revenue, utilization, no-shows and customers.',
    levels: { none: [], view: ['analytics.view'] },
  },
  {
    key: 'settings', label: 'Settings & team',
    help: 'View shows the schedule. Full adds editing the schedule, course settings and the shop catalog. Team, Stripe, the agreement and the cancellation policy stay with the owner.',
    levels: {
      none: [],
      view: ['schedule.view'],
      full: ['schedule.view', 'schedule.edit', 'settings.edit', 'shop.catalog'],
    },
  },
];

/** Keys reachable only under Advanced (in no area level). */
export const ADVANCED_ONLY: PermissionKey[] = ['money.refund_rounds', 'messages.use'];

const AREA = new Map(AREAS.map(a => [a.key, a]));
const VALID = new Set<string>(ALL_KEYS);

/** Every key an area's levels can touch. */
export function areaKeys(area: AreaKey): PermissionKey[] {
  const def = AREA.get(area);
  if (!def) return [];
  const s = new Set<PermissionKey>();
  for (const ks of Object.values(def.levels)) for (const k of ks ?? []) s.add(k);
  return ALL_KEYS.filter(k => s.has(k));
}

export function isAreaKey(v: unknown): v is AreaKey { return typeof v === 'string' && AREA.has(v as AreaKey); }
export function isAreaLevel(v: unknown): v is AreaLevel { return v === 'none' || v === 'view' || v === 'full'; }

/**
 * Set one area to a level. The area's keys are turned off first (with anything
 * that requires them, in any area), then the level's keys on (with what they
 * require). Returns null when the area does not offer that level.
 */
export function applyAreaLevel(keys: readonly string[], area: AreaKey, level: AreaLevel): PermissionKey[] | null {
  const def = AREA.get(area);
  const want = def?.levels[level];
  if (!def || !want) return null;
  let cur = normalizePermissions(keys);
  for (const k of areaKeys(area)) if (!want.includes(k)) cur = withoutPermission(cur, k);
  return normalizePermissions([...cur, ...want]);
}

/** Each area's level for a set of keys; 'custom' when the set matches no level exactly (set under Advanced). */
export function areaLevels(keys: readonly string[]): Record<AreaKey, AreaLevel | 'custom'> {
  const have = new Set<string>(normalizePermissions(keys));
  const out = {} as Record<AreaKey, AreaLevel | 'custom'>;
  for (const a of AREAS) {
    const inArea = areaKeys(a.key).filter(k => have.has(k)).join(',');
    const match = (Object.entries(a.levels) as [AreaLevel, PermissionKey[]][])
      .find(([, ks]) => normalizePermissions(ks).filter(k => areaKeys(a.key).includes(k)).join(',') === inArea);
    out[a.key] = match ? match[0] : 'custom';
  }
  return out;
}

// ── Suggested roles (never pre-created) ───────────────────────────────────────

export type SuggestedKey = 'manager' | 'front_desk' | 'starter' | 'grounds' | 'bookkeeper';

export interface SuggestedRole { key: SuggestedKey; name: string; description: string; keys: PermissionKey[] }

const preset = (k: string) => PRESETS.find(p => p.key === k)!.keys;

/** The mockup's list (lanes/dashboard/team-mockup.html). Manager, Front desk and Starter are SP-A's presets. */
export const SUGGESTED_ROLES: SuggestedRole[] = [
  { key: 'manager', name: 'Manager', description: 'Everything except refunding rounds.', keys: normalizePermissions(preset('manager')) },
  { key: 'front_desk', name: 'Front desk', description: 'Payments, walk-ins, the register.', keys: normalizePermissions(preset('front_desk')) },
  { key: 'starter', name: 'Starter', description: 'Checks groups in, marks no-shows.', keys: normalizePermissions(preset('starter')) },
  { key: 'grounds', name: 'Grounds crew', description: 'Sees the sheet, updates conditions.', keys: normalizePermissions(['sheet.view', 'sheet.course_alert', 'messages.use']) },
  { key: 'bookkeeper', name: 'Bookkeeper', description: 'Sees payments and payouts only.', keys: normalizePermissions(['sheet.view', 'money.cancellations', 'money.payments', 'money.payouts', 'messages.use']) },
];

export function suggestedRole(key: unknown): SuggestedRole | null {
  return SUGGESTED_ROLES.find(s => s.key === key) ?? null;
}

// ── A person's keys ───────────────────────────────────────────────────────────

/** Role keys plus the person's grants, minus their revokes (a revoke also drops what requires it). */
export function effectiveKeys(roleKeys: readonly string[], grants: readonly string[], revokes: readonly string[]): PermissionKey[] {
  let cur = normalizePermissions([...roleKeys, ...grants]);
  // Each revoke as given — NOT normalized, which would add its prerequisites and revoke those too.
  for (const k of revokes) if (VALID.has(k)) cur = withoutPermission(cur, k as PermissionKey);
  return cur;
}

/**
 * The overrides that make a role give exactly `desired`: grants = what the role
 * lacks, revokes = what the role has that the person shouldn't. effectiveKeys
 * of the result equals normalizePermissions(desired).
 */
export function overridesFor(roleKeys: readonly string[], desired: readonly string[]): { grants: PermissionKey[]; revokes: PermissionKey[] } {
  const role = normalizePermissions(roleKeys);
  const want = normalizePermissions(desired);
  const locked = new Set(PERMISSIONS.filter(p => p.locked).map(p => p.key));
  return {
    grants: want.filter(k => !role.includes(k)),
    revokes: role.filter(k => !want.includes(k) && !locked.has(k)),
  };
}

export interface StaffAccessRow {
  courseId: string;
  permissions: string[];
  permissionsSetAt: Date | string | null;
  roleId?: string | null;
  grantKeys?: string[];
  revokeKeys?: string[];
  courseRole?: { courseId: string; permissions: string[] } | null;
}

/** Locked keys only — what a row resolves to when its role can't be trusted. */
const FLOOR: PermissionKey[] = normalizePermissions([]);

/**
 * THE resolver for a staff login's keys. No role → today's rule (row keys or
 * Legacy). A role → role + overrides. A role that is missing or belongs to
 * another course fails closed to the locked keys (never a fallback to old keys).
 */
export function resolveMemberPermissions(row: StaffAccessRow): PermissionKey[] {
  if (!row.roleId) return resolveStaffPermissions(row);
  if (!row.courseRole || row.courseRole.courseId !== row.courseId) return FLOOR;
  return effectiveKeys(row.courseRole.permissions, row.grantKeys ?? [], row.revokeKeys ?? []);
}

export type PersonStatus = 'active' | 'invited' | 'disabled';

export function personStatus(row: { active: boolean; invitedAt: Date | string | null; passwordSetAt: Date | string | null }): PersonStatus {
  if (!row.active) return 'disabled';
  if (row.invitedAt && !row.passwordSetAt) return 'invited';
  return 'active';
}
