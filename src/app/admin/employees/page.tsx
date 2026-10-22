'use client';
// AW-11 (Cam 2026-10-22, "per-person access"; ADMIN-C look): Team. Everyone
// with an admin login, what they can do (role) and where (areas), when they
// last signed in, and what they did. The owner adds people, changes role and
// areas, resets passwords and turns access off; managers can read the list.
// Your own password is on My profile now — not here. Rules: /api/admin/employees.
import Link from 'next/link';
import { stepUpFetch } from '@/lib/step-up-client';
import { useState, useEffect, useCallback } from 'react';
import { Copy } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { StatusDot } from '@/components/ui/StatusDot';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { ErrorBanner } from '@/components/ui/ErrorState';
import { INPUT_COMPACT } from '@/components/ui/field';
import { ADMIN_AREAS, ALL_AREAS, type AdminArea } from '@/lib/admin-areas';
import { formatRelative } from '@/lib/format';

interface Admin {
  id: string; email: string; name: string; role: string;
  active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string;
  /** null = never set: every area the role reaches. */
  areas: AdminArea[] | null;
}

const ROLES = [
  { value: 'manager', label: 'Manager', desc: 'Does everything in their areas: changes, refunds, retries, sends.' },
  { value: 'support', label: 'Support', desc: 'Reads everything in their areas, answers messages, takes problems. No refunds, settings or deletes.' },
  { value: 'viewer',  label: 'Viewer',  desc: 'Read-only, and only Pipeline and the Courses list — no money, golfers or messages.' },
  { value: 'owner',   label: 'Owner',   desc: 'Everything, everywhere. Signs in at the owner door, not here.' },
];
const H2 = 'text-[20px] font-bold text-ink';
const BTN = 'text-[13px] font-medium px-3 py-1.5 rounded-md border border-line text-ink hover:border-pine/40 disabled:opacity-50';

function TempPasswordBox({ label, pwd, onDismiss }: { label: string; pwd: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(pwd); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopyError(true); }
  }
  return (
    <div className="bg-ok/5 border border-ok/20 rounded-md px-4 py-3 flex items-start justify-between gap-3">
      <div>
        <div className="text-[13px] font-medium text-ok mb-1">{label}</div>
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono text-ink bg-white border border-line rounded px-2 py-0.5 tracking-wider">{pwd}</code>
          <button type="button" onClick={copy} className="text-ink-muted hover:text-pine" aria-label="Copy the password">
            {copied ? <span className="text-ok text-xs">Copied</span> : <Copy aria-hidden="true" className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="text-[12px] text-ink-soft mt-1">{copyError ? 'Couldn’t copy — select it and copy by hand. ' : ''}Shown once. Give it to them; they set their own on first sign-in.</div>
      </div>
      <button type="button" onClick={onDismiss} className="text-[13px] text-ink-soft hover:text-ink shrink-0">Dismiss</button>
    </div>
  );
}

function AreaPicker({ value, onChange, disabled, idPrefix }: { value: AdminArea[]; onChange: (v: AdminArea[]) => void; disabled?: boolean; idPrefix: string }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {ADMIN_AREAS.map(a => (
        <label key={a.key} htmlFor={`${idPrefix}-${a.key}`} title={a.help} className="flex items-center gap-1.5 text-[13.5px] text-ink cursor-pointer select-none">
          <input id={`${idPrefix}-${a.key}`} type="checkbox" className="accent-pine" disabled={disabled}
            checked={value.includes(a.key)}
            onChange={e => onChange(e.target.checked ? ALL_AREAS.filter(k => k === a.key || value.includes(k)) : value.filter(k => k !== a.key))} />
          {a.label}
        </label>
      ))}
    </div>
  );
}

function areasText(a: Admin): string {
  if (a.role === 'owner') return 'Everything';
  if (a.areas === null) return 'Everything their role reaches (never limited)';
  if (a.areas.length === 0) return 'Nothing — only Home and My profile';
  if (a.areas.length === ALL_AREAS.length) return 'Every area';
  return a.areas.map(k => ADMIN_AREAS.find(x => x.key === k)?.label ?? k).join(', ');
}

export default function TeamPage() {
  const session = useAdminSession();
  const isOwner = session.role === 'owner';
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('support');
  const [newAreas, setNewAreas] = useState<AdminArea[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [created, setCreated] = useState<{ name: string; pwd: string } | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [resetPwds, setResetPwds] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; areas: AdminArea[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch<Admin[]>('/api/admin/employees', { subject: 'your team' });
      if (!res.ok) { setAdmins([]); setLoadError({ msg: res.message, kind: res.kind }); return; }
      setAdmins(res.data);
      setLoadError(null);
    } catch { setAdmins([]); setLoadError({ msg: 'Network error loading your team. Check your connection and try again.', kind: 'network' }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (newRole !== 'owner' && newAreas.length === 0) { setCreateError('Tick at least one area they can open.'); return; }
    setCreateError(''); setCreated(null); setCreating(true);
    try {
      const res = await stepUpFetch('/api/admin/employees', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole, areas: newRole === 'owner' ? undefined : newAreas }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateError(data.error || `Couldn’t add them (${res.status}).`); return; }
      setCreated({ name: newName, pwd: data.tempPassword });
      setNewName(''); setNewEmail(''); setNewRole('support'); setNewAreas([]);
      load();
    } catch { setCreateError('Network error — nobody was added. Try again.'); }
    finally { setCreating(false); }
  }

  // Every change answers on its own row; nothing fails quietly (MP-2b).
  async function patch(admin: Admin, key: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(admin.id + key); setRowError(r => ({ ...r, [admin.id]: '' }));
    try {
      const res = await stepUpFetch('/api/admin/employees', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: admin.id, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setRowError(r => ({ ...r, [admin.id]: data.error || 'That didn’t work. Try again.' })); return null; }
      return data;
    } catch {
      setRowError(r => ({ ...r, [admin.id]: 'Network error — nothing was changed. Try again.' }));
      return null;
    } finally { setBusy(null); }
  }

  async function saveAreas(admin: Admin) {
    if (!editing) return;
    if (editing.areas.length === 0 && !confirm(`Leave ${admin.name} with no areas? They’ll only see Home and My profile.`)) return;
    if (await patch(admin, '_areas', { action: 'areas', areas: editing.areas })) { setEditing(null); load(); }
  }
  async function changeRole(admin: Admin, role: string) { if (await patch(admin, '_role', { role })) load(); }
  async function toggleActive(admin: Admin) { if (await patch(admin, '_active', { active: !admin.active })) load(); }
  async function resetPassword(admin: Admin) {
    if (!confirm(`Reset ${admin.name}'s password? They'll set a new one when they next sign in.`)) return;
    const data = await patch(admin, '_reset', { action: 'reset_password' });
    if (data?.tempPassword) { setResetPwds(p => ({ ...p, [admin.id]: String(data.tempPassword) })); load(); }
  }

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar active="employees" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-10 pt-6 pb-10 flex flex-col gap-7">
          <div>
            <h1 className="m-0 text-[32px] font-bold tracking-[-0.02em] text-ink leading-none">Team</h1>
            <p className="mt-2 text-[14px] text-ink-soft">
              Everyone with an admin login. The role says how much they can do; the areas say where. Change your own password on <Link href="/admin/profile" className="text-pine hover:underline">My profile</Link>.
            </p>
          </div>

          {loadError && <ErrorBanner message={loadError.msg} kind={loadError.kind} onRetry={() => load()} />}
          {loading && admins.length === 0 && !loadError && <p className="py-10 text-center text-ink-muted text-sm">Loading…</p>}

          {admins.length > 0 && (
            <section className="flex flex-col">
              {admins.map(a => {
                const me = a.id === session.adminId;
                // As before: the owner can change anyone but themselves; areas don't apply to an owner.
                const canEdit = isOwner && !me;
                const canAreas = canEdit && a.role !== 'owner';
                return (
                  <div key={a.id} className="py-4 border-b border-line-soft last:border-0">
                    <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
                      <div className="min-w-[220px] flex-1">
                        <div className="text-[15px] font-medium text-ink">{a.name}{me && <span className="ml-2 text-[12.5px] text-ink-muted">you</span>}</div>
                        <div className="text-[13px] text-ink-soft">{a.email}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[12.5px]">
                          {a.active ? <StatusDot status="ok" label="Active" /> : <StatusDot status="neutral" label="Turned off" />}
                          <span className="text-ink-muted">{a.lastLoginAt ? `Signed in ${formatRelative(new Date(a.lastLoginAt).getTime())}` : 'Never signed in'}</span>
                          {a.mustChangePassword && <span className="text-warn">Hasn’t set their own password yet</span>}
                        </div>
                      </div>
                      <div className="w-[160px]">
                        <div className="text-[12.5px] text-ink-muted mb-1">Role</div>
                        {canEdit ? (
                          <select aria-label={`${a.name}'s role`} value={a.role} disabled={!!busy} onChange={e => changeRole(a, e.target.value)} className={INPUT_COMPACT + ' w-full'}>
                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        ) : <div className="text-[14px] text-ink">{ROLES.find(r => r.value === a.role)?.label ?? a.role}</div>}
                      </div>
                      <div className="flex-[2_1_320px] min-w-0">
                        <div className="text-[12.5px] text-ink-muted mb-1">Can open</div>
                        {editing?.id === a.id ? (
                          <div className="flex flex-col gap-2">
                            <AreaPicker idPrefix={`areas-${a.id}`} value={editing.areas} onChange={v => setEditing({ id: a.id, areas: v })} disabled={!!busy} />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => saveAreas(a)} disabled={!!busy} className="text-[13px] font-medium px-3 py-1.5 rounded-md bg-pine hover:bg-pine-hover text-white disabled:opacity-50">{busy === a.id + '_areas' ? 'Saving…' : 'Save'}</button>
                              <button type="button" onClick={() => setEditing(null)} className="text-[13px] text-ink-soft hover:text-ink">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[14px] text-ink">
                            {areasText(a)}
                            {canAreas && <button type="button" onClick={() => setEditing({ id: a.id, areas: a.areas ?? ALL_AREAS })} className="ml-2 text-[13px] text-pine hover:underline">Change</button>}
                          </div>
                        )}
                      </div>
                      {isOwner && (
                        <div className="flex flex-wrap gap-2 items-start">
                          <Link href={`/admin/audit?admin=${a.id}`} className={BTN}>What they did</Link>
                          {canEdit && <button type="button" onClick={() => resetPassword(a)} disabled={!!busy} className={BTN}>{busy === a.id + '_reset' ? 'Resetting…' : 'Reset password'}</button>}
                          {canEdit && <button type="button" onClick={() => toggleActive(a)} disabled={!!busy} className={BTN}>{busy === a.id + '_active' ? 'Saving…' : a.active ? 'Turn off' : 'Turn back on'}</button>}
                        </div>
                      )}
                    </div>
                    {rowError[a.id] && <p role="alert" className="mt-2 text-[13px] text-bad">{rowError[a.id]}</p>}
                    {resetPwds[a.id] && (
                      <div className="mt-3">
                        <TempPasswordBox label={`New password for ${a.name}:`} pwd={resetPwds[a.id]} onDismiss={() => setResetPwds(p => { const n = { ...p }; delete n[a.id]; return n; })} />
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {isOwner && (
            <section className="bg-paper rounded-lg p-5 max-w-[880px]">
              <h2 className={H2}>Add someone</h2>
              {createError && <p role="alert" className="mt-2 text-[13px] text-bad">{createError}</p>}
              {created && <div className="mt-3"><TempPasswordBox label={`${created.name || 'They'} can sign in at /admin with:`} pwd={created.pwd} onDismiss={() => setCreated(null)} /></div>}
              <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-3">
                <div className="flex flex-wrap gap-3">
                  <label className="flex flex-col gap-1 text-[13px] text-ink-soft flex-1 min-w-[180px]">Name<input value={newName} onChange={e => setNewName(e.target.value)} required className={INPUT_COMPACT} /></label>
                  <label className="flex flex-col gap-1 text-[13px] text-ink-soft flex-1 min-w-[220px]">Email<input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required className={INPUT_COMPACT} /></label>
                  <label className="flex flex-col gap-1 text-[13px] text-ink-soft w-[160px]">Role
                    <select value={newRole} onChange={e => setNewRole(e.target.value)} className={INPUT_COMPACT}>
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </label>
                </div>
                <p className="text-[13px] text-ink-soft">{ROLES.find(r => r.value === newRole)?.desc}</p>
                {newRole !== 'owner' && (
                  <div>
                    <div className="text-[13px] text-ink-soft mb-1.5">Can open</div>
                    <AreaPicker idPrefix="new" value={newAreas} onChange={setNewAreas} />
                  </div>
                )}
                <div><button type="submit" disabled={creating} className="text-[13px] font-medium px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white disabled:opacity-50">{creating ? 'Adding…' : 'Add to the team'}</button></div>
              </form>
            </section>
          )}

          <section>
            <h2 className={H2}>What the roles mean</h2>
            <div className="mt-2 flex flex-col gap-1.5 text-[14px]">
              {ROLES.map(r => <div key={r.value}><span className="font-medium text-ink">{r.label}</span> <span className="text-ink-soft">— {r.desc}</span></div>)}
            </div>
            <p className="mt-3 text-[13px] text-ink-muted">Areas: {ADMIN_AREAS.map(a => `${a.label} (${a.help.replace(/\.$/, '')})`).join(' · ')}.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
