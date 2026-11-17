'use client';
// TEAM-1 (Cam 2026-11-17, "we are all good"; approved mockup lanes/dashboard/team-mockup.html and its threads;
// lanes/dashboard.md "Next" 8). What the Team page's parts share: the data shape Build's /api/operator/team returns,
// the permission list (the one catalog in lib/staff-permissions, grouped the way the mockup groups it), and the small
// pieces (switch, status line, icons). Tokens only, so Charcoal and Light both follow.
// Areas (Cam 2026-11-17, mockup thread 8f2ccf3a, "a lot more consolidated ... less buttons"): access is shown as about six
// areas, each No access / View / Full, with the single switches under Advanced. The areas are only a view and an editor
// over the stored keys (Build): a set that is neither shows as Custom and opens Advanced, and a change that would add a
// key that moves money lists those keys and waits for a yes. Nothing is granted silently.
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { StatusDot } from '@/components/ui/StatusDot';
import { PERMISSIONS, normalizePermissions, withoutPermission, type PermissionDef, type PermissionKey } from '@/lib/staff-permissions';

export type Role = {
  id: string; name: string; rank: number;
  permissions: PermissionKey[];
  /** The Owner role: everything, never edited, never deleted, nobody invited into it. */
  owner: boolean;
  /** How many people hold it, so a role edit can say who it changes before saving. */
  people: number;
};
export type Suggested = { key: string; name: string; permissions: PermissionKey[] };
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
/** One access area from Build: `view` and `full` are key sets (full includes view; view may be empty). */
export type Area = { key: string; label: string; help: string; movesMoney: boolean; view: PermissionKey[]; full: PermissionKey[] };
export type Team = { roles: Role[]; suggested: Suggested[]; owner: Owner; people: Person[]; areas?: Area[] };

export const LINK = 'inline-flex items-center min-h-[40px] text-[13px] font-semibold text-ink underline underline-offset-[3px] decoration-ink-muted hover:decoration-ink disabled:opacity-50';
export const LINK_BAD = 'inline-flex items-center min-h-[40px] text-[13px] font-semibold text-bad underline underline-offset-[3px] decoration-bad/50 hover:decoration-bad disabled:opacity-50';
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

// ── Areas ─────────────────────────────────────────────────────────────────────
type Level = 'none' | 'view' | 'full' | 'custom';
const LOCKED = new Set(PERMISSIONS.filter(p => p.locked).map(p => p.key));
const DEF = new Map(PERMISSIONS.map(p => [p.key, p]));
const keysOf = (ks: readonly PermissionKey[]) => ks.filter(k => !LOCKED.has(k));

/** Where a set of keys stands in one area. */
export function levelOf(area: Area, value: readonly PermissionKey[]): Level {
  const full = keysOf(area.full), on = new Set(value);
  const have = full.filter(k => on.has(k));
  if (!have.length) return 'none';
  if (have.length === full.length) return 'full';
  const view = keysOf(area.view);
  if (view.length && have.length === view.length && view.every(k => on.has(k))) return 'view';
  return 'custom';
}
const countIn = (area: Area, value: readonly PermissionKey[]) => {
  const full = keysOf(area.full);
  return `${full.filter(k => value.includes(k)).length} of ${full.length}`;
};

/** The keys after setting one area to a level: the area's other keys come off (with whatever needs them), the
 *  level's keys go on (with whatever they need). */
function withLevel(area: Area, value: readonly PermissionKey[], level: 'none' | 'view' | 'full'): PermissionKey[] {
  const want = new Set<PermissionKey>(level === 'full' ? area.full : level === 'view' ? area.view : []);
  let next = normalizePermissions(value);
  for (const k of keysOf(area.full)) if (!want.has(k) && next.includes(k)) next = withoutPermission(next, k);
  return normalizePermissions([...next, ...want]);
}

/** "Tee sheet: Full · Payments: View" — what a role can use, for the Roles list. */
export function areaSummary(areas: Area[] | undefined, value: readonly PermissionKey[], owner?: boolean): string {
  if (owner) return 'Full access to everything';
  if (!areas?.length) return `${value.length} of ${TOTAL}`;
  const word = { none: '', view: 'View', full: 'Full', custom: 'Custom' } as const;
  return areas.map(a => { const l = levelOf(a, value); return l === 'none' ? null : `${a.label.split(' &')[0]}: ${word[l]}`; })
    .filter(Boolean).join(' · ') || 'No access yet';
}

const SEG = 'px-3 min-h-[32px] rounded-[8px] text-[12.5px] whitespace-nowrap disabled:cursor-default';

/** Access as areas (No access / View / Full) with every switch under Advanced. Without areas from the server it is
 *  the plain grouped switch list. `readOnly` for the Owner role. */
export function AccessEditor({ areas, value, onChange, readOnly }: {
  areas?: Area[]; value: readonly PermissionKey[]; onChange?: (next: PermissionKey[]) => void; readOnly?: boolean;
}) {
  const [ask, setAsk] = useState<{ next: PermissionKey[]; keys: PermissionKey[]; what: string; at: string } | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  // A confirm is for the keys as they stood when it opened: any other change (a new role, another area) drops it, so
  // Allow can never put back keys nobody saw listed.
  const valueKey = value.join(',');
  useEffect(() => { setAsk(null); }, [valueKey]);
  if (!areas?.length) return <PermList value={value} onChange={onChange} readOnly={readOnly} />;
  const anyCustom = !readOnly && areas.some(a => levelOf(a, value) === 'custom');

  function pick(area: Area, level: 'none' | 'view' | 'full') {
    if (!onChange) return;
    const next = withLevel(area, value, level);
    const money = next.filter(k => !value.includes(k) && DEF.get(k)?.movesMoney);
    if (money.length) { setAsk({ next, keys: money, what: `${level === 'full' ? 'Full' : 'View'} on ${area.label}`, at: area.key }); return; }
    onChange(next);
  }
  // Any change made under Advanced that adds a key that moves money asks too.
  function fromSwitches(next: PermissionKey[]) {
    const money = next.filter(k => !value.includes(k) && DEF.get(k)?.movesMoney);
    if (money.length) { setAsk({ next, keys: money, what: 'This change', at: 'advanced' }); return; }
    onChange?.(next);
  }

  const confirmBox = ask && (
      <div role="alertdialog" aria-label="Allow money actions" className="mt-1 mb-2 border border-warn/40 rounded-[12px] p-3 flex flex-col gap-2">
        <p className="text-[13px] text-ink">{ask.what} also lets them move money:</p>
        <ul className="text-[13px] text-ink list-disc pl-5">{ask.keys.map(k => <li key={k}>{DEF.get(k)?.label}</li>)}</ul>
        <div className="flex items-center gap-3">
          <button type="button" className={LINK} autoFocus onClick={() => setAsk(null)}>Cancel</button>
          <button type="button" className={PRIMARY} onClick={() => { onChange?.(ask.next); setAsk(null); }}>Allow</button>
        </div>
      </div>
  );

  return (
    <div>
      {areas.map(a => {
        const lv = readOnly ? 'full' : levelOf(a, value);
        const opts: ['none' | 'view' | 'full', string][] = [['none', 'No access'], ...(keysOf(a.view).length ? [['view', 'View'] as ['view', string]] : []), ['full', 'Full']];
        return (
          <Fragment key={a.key}>
          <div className="flex flex-col gap-2 py-2.5 border-t border-line">
            <span className="min-w-0">
              <b className="block text-[13.5px] font-semibold text-ink">{a.label}
                {a.movesMoney && <em className="not-italic font-medium text-[11px] text-warn border border-current rounded-full px-1.5 ml-1.5 align-[1px]">Moves money</em>}</b>
              <small className="block text-[12px] text-ink-muted">{a.help}</small>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span role="radiogroup" aria-label={a.label} className="inline-flex gap-0.5 p-[3px] rounded-[11px] bg-ink/5 border border-line">
                {opts.map(([k, l]) => (
                  <button key={k} type="button" role="radio" aria-checked={lv === k} disabled={readOnly || !onChange} onClick={() => lv !== k && pick(a, k)}
                    className={SEG + ' ' + (lv === k ? 'bg-white text-ink font-semibold shadow-card' : 'text-ink-soft hover:text-ink')}>{l}</button>
                ))}
              </span>
              {lv === 'custom' && <span className="text-[12.5px] text-ink-muted">Custom · {countIn(a, value)}, see Advanced</span>}
            </span>
          </div>
          {ask?.at === a.key && confirmBox}
          </Fragment>
        );
      })}
      {!readOnly && (
        <details open={anyCustom || advOpen} onToggle={e => setAdvOpen((e.target as HTMLDetailsElement).open)} className="group/adv border-t border-line mt-1">
          <summary className="list-none [&::-webkit-details-marker]:hidden flex items-center gap-1.5 py-2.5 min-h-[44px] text-[12.5px] text-ink-muted cursor-pointer hover:text-ink">
            <ChevronIcon className="transition-transform motion-reduce:transition-none group-open/adv:rotate-90" />Advanced: switch single things on or off
          </summary>
          {ask?.at === 'advanced' && confirmBox}
          <PermList value={value} onChange={onChange ? fromSwitches : undefined} />
        </details>
      )}
    </div>
  );
}
