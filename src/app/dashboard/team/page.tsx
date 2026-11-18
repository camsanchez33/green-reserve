'use client';
// TEAM-1 (Cam 2026-11-17, "we are all good"; approved mockup lanes/dashboard/team-mockup.html and its threads;
// lanes/dashboard.md "Next" 8). Team, under Business on the rail, the owner's alone (who works here and what they may do
// is never a staff decision). Spec is the live mockup (claude.ai/artifact/L2SZ76WpfdZMx4krCiubf1 and its copy
// Umx49hzDobDidymMDKuk9v, with Cam's later threads); the repo copy predates them. Two tabs:
//  - Team: one view, every role in rank order with its people under it as compact rows (a role shows even when nobody
//    holds it). A new course has only Owner, plus Suggested roles to add (never made for it). A person opens their own
//    page: role, their access starting from the role, reset link or resend invite, disable, remove.
//  - Roles: what each role can do; a role edit says how many people it changes before saving.
// Invite asks name, email, an optional phone and a role, and the server sends the welcome email.
// This replaces Settings → Staff and permissions: every switch, disable, enable, remove and "last changed by" moved
// here. Data: /api/operator/team and lib/team-access (Build, PR #464, which merges first).
import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import OperatorSidebar from '@/components/OperatorSidebar';
import { SlidingTabs } from '@/components/dashboard/SlidingTabs';
import { LoadError } from '@/components/dashboard/LoadError';
import { Card } from '@/components/ui/Card';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { type Team, type Role, type Person, type Suggested, PlusButton, PlusIcon, ChevronIcon, StatusMark, personLine, plural, areaSummary } from '@/components/dashboard/team/shared';
import { PersonPopup, OwnerPopup } from '@/components/dashboard/team/PersonPopup';
import { RolePopup } from '@/components/dashboard/team/RolePopup';
import { InvitePopup } from '@/components/dashboard/team/InvitePopup';

type Tab = 'team' | 'roles';
type Open =
  | { kind: 'person'; id: string } | { kind: 'owner' }
  | { kind: 'role'; id: string } | { kind: 'newRole'; suggested?: Suggested }
  | { kind: 'invite'; roleId?: string } | null;

const ROW = 'w-full grid items-center gap-2.5 px-3.5 py-2 min-h-[44px] border-t border-line text-left text-[13.5px] text-ink hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-soft';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="team" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-0">
        <div className="px-4 sm:px-6 py-5 flex flex-col gap-4 max-w-[860px] w-full min-w-0">{children}</div>
      </main>
    </div>
  );
}

function RoleGroup({ role, people, onPerson, onInvite, ownerRow }: {
  role: Role; people: Person[]; onPerson: (id: string) => void; onInvite?: () => void; ownerRow?: { name: string; line: string; onOpen: () => void };
}) {
  const count = people.length + (ownerRow ? 1 : 0);
  return (
    <Card className="pt-1 pb-1.5">
      <div className="flex items-center gap-2.5 px-3.5 py-2">
        <b className="text-[14px] font-semibold text-ink">{role.name}</b>
        <span className="text-[12.5px] text-ink-muted">{plural(count, 'person', 'people')}</span>
        <span className="flex-1" />
        {onInvite && <PlusButton label={`Invite someone as ${role.name}`} onClick={onInvite} />}
      </div>
      {ownerRow && (
        <button type="button" onClick={ownerRow.onOpen} className={ROW + ' grid-cols-[10px_minmax(0,1fr)_auto_20px]'}>
          <StatusMark status="active" />
          <span className="min-w-0 truncate">{ownerRow.name} <em className="not-italic text-[12px] text-ink-muted ml-1">you</em></span>
          <span className="hidden sm:block text-[12.5px] text-ink-muted">{ownerRow.line}</span>
          <ChevronIcon className="text-ink-muted" />
        </button>
      )}
      {people.map(p => {
        const extra = p.added.length;
        return (
          <button key={p.id} type="button" onClick={() => onPerson(p.id)} className={ROW + ' grid-cols-[10px_minmax(0,1fr)_auto_20px]'}>
            <StatusMark status={p.status} />
            <span className="min-w-0 truncate">{p.name}{extra > 0 && <em className="not-italic text-[12px] text-ink-muted ml-1">+{extra} extra</em>}</span>
            <span className="hidden sm:block text-[12.5px] text-ink-muted">{personLine(p)}</span>
            <ChevronIcon className="text-ink-muted" />
          </button>
        );
      })}
      {!count && <p className="px-3.5 py-2 border-t border-line text-[12.5px] text-ink-muted">Nobody yet</p>}
    </Card>
  );
}

function TeamInner() {
  const router = useRouter();
  const params = useSearchParams();
  const access = useDashboardAccess();
  const tab: Tab = params.get('tab') === 'roles' ? 'roles' : 'team';
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Open>(null);
  const [showDisabled, setShowDisabled] = useState(false);

  const load = useCallback(async () => {
    const r = await dfetch<Team>('/api/operator/team');
    if (r.ok && r.data && Array.isArray(r.data.roles)) { setTeam(r.data); setError(''); return; }
    setError(r.ok ? 'The team list came back empty. Nothing was changed — try again.' : r.error);
  }, []);
  const owner = access.loaded && !access.isStaff;
  useEffect(() => { if (owner) load(); }, [owner, load]);

  const setTab = (t: Tab) => router.replace(t === 'roles' ? '/dashboard/team?tab=roles' : '/dashboard/team', { scroll: false });

  if (!access.loaded && access.failed) return <Shell><h1 className="font-serif text-[30px] sm:text-[34px] leading-none text-ink mt-1">Team</h1><LoadError message="Couldn’t check what your login can do. Refresh the page to try again." onRetry={() => window.location.reload()} /></Shell>;
  if (!access.loaded) return <Shell><h1 className="font-serif text-[30px] sm:text-[34px] leading-none text-ink mt-1">Team</h1><p className="text-[13px] text-ink-muted">Loading…</p></Shell>;
  if (!owner) {
    return (
      <Shell>
        <h1 className="font-serif text-[30px] sm:text-[34px] leading-none text-ink mt-1">Team</h1>
        <Card className="p-5"><p className="text-[13.5px] text-ink-soft">Staff and their access are managed from the owner’s login.</p></Card>
      </Shell>
    );
  }

  const roles = team ? [...team.roles].sort((a, b) => a.rank - b.rank) : [];
  const people = team?.people ?? [];
  // Disabled people sit under their own small toggle at the foot (mockup thread a0203f82); the groups show the rest.
  const current = people.filter(p => p.status !== 'disabled');
  const disabled = people.filter(p => p.status === 'disabled');
  const noRole = current.filter(p => !p.roleId || !roles.some(r => r.id === p.roleId));
  const person = open?.kind === 'person' ? people.find(p => p.id === open.id) : undefined;
  const role = open?.kind === 'role' ? roles.find(r => r.id === open.id) : undefined;
  const close = () => setOpen(null);

  return (
    <Shell>
      <h1 className="font-serif text-[30px] sm:text-[34px] leading-none text-ink mt-1">Team</h1>
      {/* Mockup threads c676100f/af919b5e: plain Team and Roles tabs with a sliding underline, Invite on the same row. */}
      <div className="flex items-center gap-3">
        <SlidingTabs look="line" label="Team" className="min-w-0" tabClassName="text-[14.5px]" value={tab} onChange={setTab} tabs={[['team', 'Team'], ['roles', 'Roles']] as const} />
        <span className="flex-1" />
        {team && (
          <button type="button" onClick={() => setOpen({ kind: 'invite' })}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border border-line bg-ink/5 text-[13.5px] font-semibold text-ink hover:border-ink-soft"><PlusIcon />Invite</button>
        )}
      </div>

      {error && <LoadError message={`${error} Nothing here is your team until this loads.`} onRetry={load} />}
      {!team && !error && <p className="py-16 text-center text-[13px] text-ink-muted">Loading…</p>}

      {team && tab === 'team' && (
        <>
          {roles.map(r => (
            <RoleGroup key={r.id} role={r} people={current.filter(p => p.roleId === r.id)} onPerson={id => setOpen({ kind: 'person', id })}
              onInvite={r.owner ? undefined : () => setOpen({ kind: 'invite', roleId: r.id })}
              ownerRow={r.owner ? { name: team.owner.name, line: 'Now', onOpen: () => setOpen({ kind: 'owner' }) } : undefined} />
          ))}
          {noRole.length > 0 && (
            <RoleGroup role={{ id: '', name: 'No role yet', rank: 999, permissions: [], owner: false, people: noRole.length }}
              people={noRole} onPerson={id => setOpen({ kind: 'person', id })} />
          )}
          {team.suggested.length > 0 && (
            <section className="py-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5 py-2">
                <b className="text-[14px] font-semibold text-ink">Suggested roles</b>
                <span className="text-[12.5px] text-ink-muted">Add the ones you use. You can change what each can do.</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {team.suggested.map(s => (
                  <button key={s.key} type="button" onClick={() => setOpen({ kind: 'newRole', suggested: s })}
                    className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-full border border-line bg-ink/5 text-[13px] text-ink hover:border-ink-soft"><PlusIcon />{s.name}</button>
                ))}
                <button type="button" onClick={() => setOpen({ kind: 'newRole' })}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-full border border-dashed border-line text-[13px] text-ink hover:border-ink-soft"><PlusIcon />Your own</button>
              </div>
            </section>
          )}
          {disabled.length > 0 && (
            <section className="flex flex-col gap-2">
              <button type="button" aria-expanded={showDisabled} onClick={() => setShowDisabled(v => !v)}
                className="self-start inline-flex items-center gap-1.5 min-h-[36px] px-0.5 text-[12.5px] text-ink-muted hover:text-ink">
                <ChevronIcon className={'transition-transform motion-reduce:transition-none ' + (showDisabled ? 'rotate-90' : '')} />Disabled · {disabled.length}
              </button>
              {showDisabled && (
                <Card className="pt-0 pb-1.5">
                  {disabled.map((p, i) => (
                    <button key={p.id} type="button" onClick={() => setOpen({ kind: 'person', id: p.id })} className={ROW + ' opacity-60 grid-cols-[10px_minmax(0,1fr)_auto_20px] ' + (i ? '' : 'border-t-0')}>
                      <StatusMark status="disabled" />
                      <span className="min-w-0 truncate">{p.name}<em className="not-italic text-[12px] text-ink-muted ml-1">{roles.find(r => r.id === p.roleId)?.name ?? ''}</em></span>
                      <span className="hidden sm:block text-[12.5px] text-ink-muted">{personLine(p)}</span>
                      <ChevronIcon className="text-ink-muted" />
                    </button>
                  ))}
                </Card>
              )}
            </section>
          )}
        </>
      )}

      {team && tab === 'roles' && (
        <Card className="pt-1 pb-1.5">
          <div className="flex items-center gap-2.5 px-3.5 py-2">
            <b className="text-[14px] font-semibold text-ink">What each role can do</b>
            <span className="flex-1" />
            <PlusButton label="Add a role" onClick={() => setOpen({ kind: 'newRole' })} />
          </div>
          {roles.map(r => (
            <button key={r.id} type="button" onClick={() => setOpen({ kind: 'role', id: r.id })} className={ROW + ' grid-cols-[minmax(0,1fr)_auto_20px]'}>
              <span className="min-w-0"><b className="block font-semibold">{r.name}</b><small className="block text-[12px] text-ink-muted">{areaSummary(r.permissions, r.owner)}</small></span>
              <span />
              <ChevronIcon className="text-ink-muted" />
            </button>
          ))}
          <p className="px-3.5 py-2 border-t border-line text-[12.5px] text-ink-muted">Change a role and everyone in it changes too. To give one person more or less, open them on Team.</p>
        </Card>
      )}

      {open?.kind === 'owner' && team && <OwnerPopup owner={team.owner} onClose={close} />}
      {person && <PersonPopup key={person.id} person={person} roles={roles} onClose={close} onChanged={load} />}
      {open?.kind === 'role' && role && <RolePopup key={role.id} role={role} onClose={close} onChanged={load} />}
      {open?.kind === 'newRole' && <RolePopup suggested={open.suggested} onClose={close} onChanged={load} />}
      {open?.kind === 'invite' && <InvitePopup roles={roles} roleId={open.roleId} onClose={close} onChanged={load} />}
    </Shell>
  );
}

export default function TeamPage() {
  return <Suspense fallback={<div className="min-h-screen bg-page" />}><TeamInner /></Suspense>;
}
