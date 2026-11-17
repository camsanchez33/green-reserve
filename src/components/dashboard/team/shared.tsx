'use client';
// TEAM-1 (Cam 2026-11-17, "we are all good"; approved mockup lanes/dashboard/team-mockup.html and its threads;
// lanes/dashboard.md "Next" 8). What the Team page's parts share: the data shape Build's /api/operator/team returns,
// the permission list (the one catalog in lib/staff-permissions, grouped the way the mockup groups it), and the small
// pieces (switch, status line, icons). Tokens only, so Charcoal and Light both follow.
import type { ReactNode } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { PERMISSIONS, normalizePermissions, withoutPermission, type PermissionDef, type PermissionKey } from '@/lib/staff-permissions';

export type Role = {
  id: string; name: string; description: string; rank: number;
  permissions: PermissionKey[];
  /** The Owner role: everything, never edited, never deleted, nobody invited into it. */
  owner: boolean;
  /** How many people hold it, so a role edit can say who it changes before saving. */
  people: number;
};
export type Suggested = { key: string; name: string; description: string; permissions: PermissionKey[] };
export type Person = {
  id: string; name: string; email: string; phone: string | null; roleId: string | null;
  status: 'active' | 'invited' | 'disabled';
  invitedAt: string | null; disabledAt: string | null; lastActiveAt: string | null;
  /** What they can do now (their role plus or minus their own changes). */
  permissions: PermissionKey[];
  added: PermissionKey[]; removed: PermissionKey[];
  lastChange: { at: string; by: string } | null;
  /** Added before per-person permissions and never edited. */
  legacy: boolean;
};
export type Owner = { name: string; email: string; lastActiveAt: string | null };
export type Team = { roles: Role[]; suggested: Suggested[]; owner: Owner; people: Person[] };

export const LINK = 'text-[13px] font-semibold text-ink underline underline-offset-[3px] decoration-ink-muted hover:decoration-ink disabled:opacity-50';
export const LINK_BAD = 'text-[13px] font-semibold text-bad underline underline-offset-[3px] decoration-bad/50 hover:decoration-bad disabled:opacity-50';
export const PRIMARY = 'bg-pine hover:bg-pine-hover text-white rounded-[10px] text-[13px] font-semibold px-3.5 py-[9px] min-h-[40px] disabled:opacity-40';

export const PlusIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
export const ChevronIcon = ({ className = '' }: { className?: string }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}><path d="m9 6 6 6-6 6" /></svg>;

/** A bare plus (the mockup's .ibtn). */
export function PlusButton({ label, onClick, big }: { label: string; onClick: () => void; big?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={(big ? 'w-10 h-10' : 'w-[34px] h-[34px]') + ' grid place-items-center rounded-[9px] text-ink-soft hover:text-ink hover:bg-ink/5'}><PlusIcon /></button>
  );
}

// The mockup's five groups. The catalog's own groups fold into them; every key in the catalog is shown, so nothing a
// staff login could be given before is missing here.
const GROUP_OF: Record<PermissionDef['group'], string> = {
  'Tee sheet': 'Tee sheet', Money: 'Money', 'Pro shop': 'Pro shop',
  Members: 'Memberships and events', Events: 'Memberships and events', Schedule: 'Course', Course: 'Course',
};
export const PERM_GROUPS: [string, PermissionDef[]][] = ['Tee sheet', 'Money', 'Pro shop', 'Memberships and events', 'Course']
  .map(g => [g, PERMISSIONS.filter(p => GROUP_OF[p.group] === g)] as [string, PermissionDef[]]);
export const TOTAL = PERMISSIONS.length;

/** Turn one on (with what it needs) or off (with what needs it), the same rule the server applies. */
export const toggleKey = (keys: readonly PermissionKey[], key: PermissionKey, on: boolean) =>
  on ? normalizePermissions([...keys, key]) : withoutPermission(keys, key);
export const sameKeys = (a: readonly PermissionKey[], b: readonly PermissionKey[]) =>
  normalizePermissions(a).join(',') === normalizePermissions(b).join(',');

/** The switch in the mockup (.tsw): green when on. */
function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={'relative flex-none w-10 h-6 rounded-full transition-colors motion-reduce:transition-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 ' + (on ? 'bg-ok' : 'bg-line')}>
      <i aria-hidden="true" className={'absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full transition-transform motion-reduce:transition-none ' + (on ? 'translate-x-4 bg-white' : 'bg-ink')} />
    </button>
  );
}

/** Every permission, in its group (a fold showing "n of m"), each a switch. `readOnly` for the Owner role. */
export function PermList({ value, onChange, readOnly }: { value: readonly PermissionKey[]; onChange?: (next: PermissionKey[]) => void; readOnly?: boolean }) {
  return (
    <div>
      {PERM_GROUPS.map(([g, defs]) => {
        const n = defs.filter(p => value.includes(p.key)).length;
        return (
          <details key={g} className="group border-t border-line">
            <summary className="list-none [&::-webkit-details-marker]:hidden flex items-center gap-2.5 py-2.5 px-0.5 min-h-[44px] cursor-pointer">
              <b className="flex-1 text-[13.5px] font-semibold text-ink">{g}</b>
              <span className="text-[12.5px] text-ink-muted tabular-nums">{n} of {defs.length}</span>
              <ChevronIcon className="text-ink-muted transition-transform motion-reduce:transition-none group-open:rotate-90" />
            </summary>
            {defs.map(p => {
              const on = value.includes(p.key);
              const needs = p.requires?.length ? ` Turns on ${p.requires.map(r => `“${PERMISSIONS.find(x => x.key === r)?.label}”`).join(', ')} too.` : '';
              return (
                <div key={p.key} className="flex items-center justify-between gap-4 py-[9px] border-t border-line">
                  <span className="flex-1 min-w-0">
                    <b className="block text-[13.5px] font-semibold text-ink">
                      {p.label}
                      {p.movesMoney && <em className="not-italic font-medium text-[11px] text-warn border border-current rounded-full px-1.5 ml-1.5 align-[1px]">Moves money</em>}
                      {p.locked && !readOnly && <em className="not-italic font-normal text-[11px] text-ink-muted ml-1.5">Always on</em>}
                    </b>
                    <small className="block text-[12px] text-ink-muted">{p.help}{needs}</small>
                  </span>
                  <Switch on={on} label={p.label} disabled={readOnly || p.locked || !onChange} onChange={v => onChange?.(toggleKey(value, p.key, v))} />
                </div>
              );
            })}
          </details>
        );
      })}
    </div>
  );
}

const DOT: Record<Person['status'], 'ok' | 'warn' | 'bad'> = { active: 'ok', invited: 'warn', disabled: 'bad' };
const WORD: Record<Person['status'], string> = { active: 'Active', invited: 'Invited', disabled: 'Disabled' };
export const StatusMark = ({ status }: { status: Person['status'] }) => <StatusDot status={DOT[status]} />;
export const statusWord = (s: Person['status']) => WORD[s];

/** "Today, 8:14 AM", "Yesterday, 4:40 PM", "Nov 14" — when someone was last on. */
export function whenShort(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

/** The line beside a person: when they were last on, or Invited/Disabled and since when. Empty when unknown. */
export function personLine(p: Person): string {
  if (p.status === 'invited') return p.invitedAt ? `Invited · ${whenShort(p.invitedAt)}` : 'Invited';
  if (p.status === 'disabled') return p.disabledAt ? `Disabled · ${whenShort(p.disabledAt)}` : 'Disabled';
  return p.lastActiveAt ? whenShort(p.lastActiveAt) : '';
}

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** A label over its field, the popups' size. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-[12.5px] text-ink-muted">{label}{children}</label>;
}
