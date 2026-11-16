// Settings → Team (Cam approved the mockup 2026-11-16, lanes/admin/team-mockup.html; lanes/admin.md "Approved, to
// build: Settings → Team"). The page's pure helpers, pinned by scripts/admin-team-test.ts.
import { ADMIN_AREAS, ALL_AREAS, type AdminArea } from '@/lib/admin-areas';

export interface Admin {
  id: string; email: string; name: string; role: string;
  active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string;
  /** null = never set: every area the role reaches. */
  areas: AdminArea[] | null;
}

/** The three roles the owner gives (the mockup's tiles), what each can do. The owner role is shown, never given here. */
export const ROLES = [
  { value: 'manager', label: 'Manager', desc: 'Does everything in their areas: changes, refunds, sends.' },
  { value: 'support', label: 'Support', desc: 'Reads everything in their areas, answers messages, takes problems. No refunds, settings or deletes.' },
  { value: 'viewer', label: 'Viewer', desc: 'Read-only, and only Pipeline and the Courses list.' },
] as const;

export function roleLabel(role: string): string {
  if (role === 'owner') return 'Owner';
  return ROLES.find(r => r.value === role)?.label ?? role;
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
}

export function areasText(a: Pick<Admin, 'role' | 'areas'>): string {
  if (a.role === 'owner') return 'Everything';
  if (a.areas === null) return 'Everything their role reaches';
  if (a.areas.length === 0) return 'Only Home and My profile';
  if (a.areas.length === ALL_AREAS.length) return 'Every area';
  return a.areas.map(k => ADMIN_AREAS.find(x => x.key === k)?.label ?? k).join(', ');
}

/** Ticking or unticking one area keeps the list in catalog order (as before). */
export function toggleArea(list: AdminArea[], key: AdminArea, on: boolean): AdminArea[] {
  return on ? ALL_AREAS.filter(k => k === key || list.includes(k)) : list.filter(k => k !== key);
}

const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "today, 8:02 AM" · "yesterday, 4:12 PM" · "Oct 2" · "Dec 31, 2025". */
export function whenSignedIn(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (sameDay(d, now)) return `today, ${time(d)}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `yesterday, ${time(d)}`;
  return d.toLocaleDateString('en-US', d.getFullYear() === now.getFullYear() ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}

export type Tone = 'ok' | 'warn' | 'none';

/** The status on a row and on the person: green signed in, amber never signed in, grey turned off. */
export function statusOf(a: Pick<Admin, 'active' | 'lastLoginAt'>, now: Date = new Date()): { tone: Tone; row: string; detail: string } {
  if (!a.active) return { tone: 'none', row: 'Turned off', detail: 'Turned off' };
  if (!a.lastLoginAt) return { tone: 'warn', row: 'Never signed in', detail: 'Never signed in' };
  const w = whenSignedIn(a.lastLoginAt, now);
  return { tone: 'ok', row: `Signed in ${w}`, detail: `Active · signed in ${w}` };
}
