'use client';
// GRP-1 (Cam 2026-10-19, after golfbergencounty.com): course groups. Several
// courses run together — a county, a club with two courses — get one golfer
// page (/g/{slug}) and one shared resident list. Groups are made here only, so
// GreenReserve approves every one; a course can't join a group by itself.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { MANAGER_PLUS } from '@/lib/admin-roles';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { ErrorBanner } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT } from '@/components/ui/field';

type GroupCourse = { id: string; name: string; slug: string; city: string | null; state: string | null; liveStatus: string; active: boolean; archivedAt: string | null };
type Group = { id: string; name: string; slug: string; description: string; courses: GroupCourse[] };
type CourseOption = { id: string; name: string; archivedAt: string | null };

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const lbl = 'block text-[13px] font-semibold text-ink mb-1.5';

function GroupCard({ group, freeCourses, canEdit, onChanged }: { group: Group; freeCourses: CourseOption[]; canEdit: boolean; onChanged: (g: Group | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const [slug, setSlug] = useState(group.slug);
  const [description, setDescription] = useState(group.description);
  const [addId, setAddId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function patch(body: Record<string, unknown>, what: string) {
    setBusy(what); setError('');
    const r = await adminFetch<{ group: Group }>('/api/admin/course-groups', { method: 'PATCH', body: JSON.stringify({ id: group.id, ...body }), subject: 'the group', action: 'save' });
    setBusy('');
    if (!r.ok) { setError(r.message); return false; }
    onChanged(r.data.group);
    return true;
  }

  async function remove() {
    if (!confirm(`Delete ${group.name}? Its ${group.courses.length} course${group.courses.length === 1 ? '' : 's'} stay on GreenReserve, each on its own again: greenreserve.app/g/${group.slug} stops working and residents are no longer shared.`)) return;
    setBusy('delete'); setError('');
    const r = await adminFetch(`/api/admin/course-groups?id=${encodeURIComponent(group.id)}`, { method: 'DELETE', subject: 'the group', action: 'save' });
    setBusy('');
    if (!r.ok) { setError(r.message); return; }
    onChanged(null);
  }

  return (
    <Card className="p-5">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl} htmlFor={`n-${group.id}`}>Name</label><input id={`n-${group.id}`} value={name} onChange={e => setName(e.target.value)} className={INPUT_COMPACT + ' w-full'} /></div>
          <div><label className={lbl} htmlFor={`s-${group.id}`}>Web address</label><input id={`s-${group.id}`} value={slug} onChange={e => setSlug(toSlug(e.target.value))} className={INPUT_COMPACT + ' w-full'} /></div>
          <div className="sm:col-span-2"><label className={lbl} htmlFor={`d-${group.id}`}>One line for golfers</label><input id={`d-${group.id}`} value={description} onChange={e => setDescription(e.target.value)} className={INPUT_COMPACT + ' w-full'} /></div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button onClick={() => { setEditing(false); setName(group.name); setSlug(group.slug); setDescription(group.description); }} className="px-3 py-2 text-[13px] text-ink-soft hover:text-ink">Cancel</button>
            <button disabled={!!busy} onClick={async () => { if (await patch({ name, slug, description }, 'rename')) setEditing(false); }}
              className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">{busy === 'rename' ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif font-semibold text-ink text-[20px]">{group.name}</h2>
            <p className="text-[13px] text-ink-soft mt-1">
              <a href={`/g/${group.slug}`} target="_blank" rel="noreferrer" className="text-pine hover:underline">greenreserve.app/g/{group.slug}</a>
              {group.description && <> · {group.description}</>}
            </p>
          </div>
          {canEdit && (
            <div className="flex gap-3 text-[13px]">
              <button onClick={() => setEditing(true)} className="text-ink-soft hover:text-ink">Edit</button>
              <button onClick={remove} disabled={!!busy} className="text-bad hover:underline disabled:opacity-50">{busy === 'delete' ? 'Deleting…' : 'Delete group'}</button>
            </div>
          )}
        </div>
      )}

      <ul className="mt-4 divide-y divide-line-soft border-t border-line-soft">
        {group.courses.length === 0 && <li className="py-3 text-[13.5px] text-ink-muted">No courses yet. Add the group&apos;s courses below.</li>}
        {group.courses.map(c => {
          const live = c.liveStatus === 'live' && c.active && !c.archivedAt;
          return (
            <li key={c.id} className="py-2.5 flex items-center justify-between gap-3 text-[13.5px]">
              <div className="min-w-0">
                <Link href={`/admin/courses/${c.id}`} className="font-medium text-ink hover:underline">{c.name}</Link>
                <span className="ml-2 text-ink-muted">{[c.city, c.state].filter(Boolean).join(', ')}</span>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <StatusDot status={live ? 'ok' : 'neutral'} label={live ? 'On the group page' : 'Not live yet — hidden from the group page'} />
                {canEdit && (
                  <button disabled={!!busy} onClick={() => { if (confirm(`Take ${c.name} out of ${group.name}? It leaves the group page and stops sharing the group's resident list.`)) patch({ removeCourseId: c.id }, `rm-${c.id}`); }}
                    className="text-[13px] text-ink-soft hover:text-bad disabled:opacity-50">{busy === `rm-${c.id}` ? 'Removing…' : 'Remove'}</button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label={`Add a course to ${group.name}`} value={addId} onChange={e => setAddId(e.target.value)} className={INPUT_COMPACT + ' min-w-[240px]'}>
            <option value="">Add a course…</option>
            {freeCourses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button disabled={!addId || !!busy} onClick={async () => { if (await patch({ addCourseId: addId }, 'add')) setAddId(''); }}
            className="px-3 py-2 rounded-md border border-line bg-white text-[13px] font-medium text-ink hover:border-pine/40 disabled:opacity-50">{busy === 'add' ? 'Adding…' : 'Add'}</button>
          <span className="text-[12.5px] text-ink-muted">A course in another group must leave it first.</span>
        </div>
      )}
    </Card>
  );
}

export default function AdminGroupsPage() {
  const session = useAdminSession();
  const canEdit = !!session && MANAGER_PLUS.includes(session.role);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoadError(null);
    const [g, c] = await Promise.all([
      adminFetch<{ groups: Group[] }>('/api/admin/course-groups', { subject: 'course groups' }),
      adminFetch<CourseOption[]>('/api/admin/courses?simple=1', { subject: 'courses' }),
    ]);
    if (!g.ok) { setLoadError({ msg: g.message, kind: g.kind }); return; }
    if (!c.ok) { setLoadError({ msg: c.message, kind: c.kind }); return; }
    setGroups(g.data.groups);
    setCourses(c.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const grouped = new Set((groups ?? []).flatMap(g => g.courses.map(c => c.id)));
  const freeCourses = courses.filter(c => !c.archivedAt && !grouped.has(c.id));

  async function create() {
    setCreating(true); setCreateError('');
    const r = await adminFetch<{ group: Group }>('/api/admin/course-groups', { method: 'POST', body: JSON.stringify({ name, slug, description }), subject: 'the group', action: 'save' });
    setCreating(false);
    if (!r.ok) { setCreateError(r.message); return; }
    setGroups(gs => [...(gs ?? []), r.data.group].sort((a, b) => a.name.localeCompare(b.name)));
    setName(''); setSlug(''); setSlugTouched(false); setDescription('');
  }

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="courses" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-4xl">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-[30px] leading-none font-serif font-semibold text-ink">Course groups</h1>
            <button onClick={load} className="text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors">Refresh</button>
          </div>
          <p className="text-[13.5px] text-ink-soft mb-6 max-w-2xl">
            Courses run together, like a county&apos;s courses, share one golfer page that lists every course&apos;s open times, and one resident list: a resident card added at one course works at all of them. Each course keeps its own tee sheet, prices, memberships, staff and payouts. Only GreenReserve makes groups.
          </p>

          {loadError && <ErrorBanner message={loadError.msg} kind={loadError.kind} onRetry={load} />}
          {!groups && !loadError && <p className="text-[13.5px] text-ink-muted">Loading groups…</p>}

          {groups && (
            <div className="space-y-5">
              {groups.length === 0 && <p className="text-[13.5px] text-ink-muted">No groups yet.</p>}
              {groups.map(g => (
                <GroupCard key={g.id} group={g} freeCourses={freeCourses} canEdit={canEdit}
                  onChanged={next => setGroups(gs => (gs ?? []).flatMap(x => x.id !== g.id ? [x] : next ? [next] : []))} />
              ))}

              {canEdit && (
                <Card className="p-5">
                  <h2 className="text-[15px] font-semibold text-ink mb-3">New group</h2>
                  {createError && <ErrorBanner message={createError} onDismiss={() => setCreateError('')} />}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><label className={lbl} htmlFor="g-name">Name</label>
                      <input id="g-name" value={name} placeholder="Bergen County Golf" onChange={e => { setName(e.target.value); if (!slugTouched) setSlug(toSlug(e.target.value)); }} className={INPUT_COMPACT + ' w-full'} /></div>
                    <div><label className={lbl} htmlFor="g-slug">Web address</label>
                      <input id="g-slug" value={slug} placeholder="bergen-county-golf" onChange={e => { setSlugTouched(true); setSlug(toSlug(e.target.value)); }} className={INPUT_COMPACT + ' w-full'} />
                      <p className="text-[12.5px] text-ink-muted mt-1">greenreserve.app/g/{slug || '…'}</p></div>
                    <div className="sm:col-span-2"><label className={lbl} htmlFor="g-desc">One line for golfers (optional)</label>
                      <input id="g-desc" value={description} placeholder="Six county courses, one place to book." onChange={e => setDescription(e.target.value)} className={INPUT_COMPACT + ' w-full'} /></div>
                  </div>
                  <div className="flex justify-end mt-4">
                    <button onClick={create} disabled={creating || !name.trim() || !slug}
                      className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">{creating ? 'Creating…' : 'Create group'}</button>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
