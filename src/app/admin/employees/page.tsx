'use client';
import { useState, useEffect, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, Lock, Copy, KeyRound } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import { StatusDot } from '@/components/ui/StatusDot';
import { adminFetch, type AdminFetchFailure } from '@/lib/admin-fetch';
import { ErrorBanner } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { INPUT_COMPACT } from '@/components/ui/field';

interface Admin {
  id: string; email: string; name: string; role: string;
  active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string;
}

const ROLES = [
  { value: 'owner',   label: 'Owner',   desc: 'Full access, manages employees & broadcasts' },
  { value: 'manager', label: 'Manager', desc: 'Courses, inquiries, messages; no employees or broadcasts' },
  { value: 'support', label: 'Support', desc: 'View + reply to messages; no create/edit/delete' },
  { value: 'viewer',  label: 'Viewer',  desc: 'Read-only: Overview, inquiries and the courses list. No money, golfer data, messages or course settings.' },
];

// A role is not a status, so it is plain text, not a tinted pill (CLAUDE.md
// BANNED); the owner reads in the accent, the rest step down in weight.
function roleTextClass(role: string) {
  if (role === 'owner') return 'text-pine font-medium';
  if (role === 'manager') return 'text-ink font-medium';
  if (role === 'support') return 'text-ink-soft';
  return 'text-ink-muted';
}

const iCls = INPUT_COMPACT;

function fmt(d: string | null) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function TempPasswordBox({ label, pwd, onDismiss }: { label: string; pwd: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(pwd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="bg-ok/5 border border-ok/20 rounded-md px-4 py-3 flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-medium text-ok mb-1">{label}</div>
        <div className="flex items-center gap-2">
          <code className="text-sm font-mono text-ink bg-white border border-line rounded px-2 py-0.5 tracking-wider">{pwd}</code>
          <button onClick={copy} className="text-ink-muted hover:text-pine transition-colors" title="Copy">
            {copied ? <span className="text-ok text-xs">Copied</span> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="text-[10px] text-ok/70 mt-1">Share this with the employee — it will only be shown once. They must change it on first login.</div>
      </div>
      <button onClick={onDismiss} className="text-xs text-ink-faint hover:text-ink shrink-0">Dismiss</button>
    </div>
  );
}

export default function EmployeesPage() {
  const router = useRouter();
  const session = useAdminSession();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('manager');
  const [createError, setCreateError] = useState('');
  const [createTempPwd, setCreateTempPwd] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [loadError, setLoadError] = useState<{ msg: string; kind: AdminFetchFailure } | null>(null);
  const [resetPwds, setResetPwds] = useState<Record<string, string>>({});

  const [cpCurrentPassword, setCpCurrentPassword] = useState('');
  const [cpNewPassword, setCpNewPassword] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // MP-2b: the roster is MANAGER_PLUS since MP-2. Parsing a 403 body as data
      // told a support/viewer employee the company has zero admin accounts.
      // MP-2c: one classifier, and the banner renders above the table rather
      // than inside the empty-row cell — MP-2b's version could not display the
      // catch branch at all, because that branch left a loaded roster on screen
      // and the cell only renders when admins.length === 0.
      const res = await adminFetch<Admin[]>('/api/admin/employees', { subject: 'employee accounts' });
      if (!res.ok) { setAdmins([]); setLoadError({ msg: res.message, kind: res.kind }); return; }
      setAdmins(res.data);
      setLoadError(null);
    } catch { setAdmins([]); setLoadError({ msg: 'Network error loading employee accounts. Check your connection and try again.', kind: 'network' }); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(''); setCreateTempPwd(''); setCreating(true);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || 'Failed'); return; }
      setCreateTempPwd(data.tempPassword);
      setNewName(''); setNewEmail(''); setNewRole('manager');
      load();
    } catch { setCreateError('Network error'); }
    finally { setCreating(false); }
  }

  // MP-2b: all three actions discarded the response. MP-2 made this endpoint
  // assert the mfa claim and wrote deliberate recovery copy for the failure
  // ("Sign in again at /admin/owner-login") — and the page threw it away, so an
  // mfa-less owner clicked Deactivate and simply nothing happened.
  async function runEmployeeAction(key: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setActionLoading(key); setActionError('');
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setActionError(data.error || 'That did not work. Try again.'); return null; }
      return data;
    } catch {
      setActionError('Network error — nothing was changed. Check your connection and try again.');
      return null;
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleActive(admin: Admin) {
    const ok = await runEmployeeAction(admin.id + '_active', { id: admin.id, active: !admin.active });
    if (ok) load();
  }

  async function changeRole(admin: Admin, newRoleVal: string) {
    const ok = await runEmployeeAction(admin.id + '_role', { id: admin.id, role: newRoleVal });
    if (ok) load();
  }

  async function resetPassword(admin: Admin) {
    if (!confirm(`Reset ${admin.name}'s password? They will be required to change it on next login.`)) return;
    const data = await runEmployeeAction(admin.id + '_reset', { id: admin.id, action: 'reset_password' });
    if (data?.tempPassword) {
      setResetPwds(p => ({ ...p, [admin.id]: String(data.tempPassword) }));
      load();
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setCpError(''); setCpSuccess('');
    if (cpNewPassword !== cpConfirm) { setCpError('New passwords do not match'); return; }
    if (cpNewPassword.length < 8) { setCpError('New password must be at least 8 characters'); return; }
    setCpLoading(true);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cpCurrentPassword, newPassword: cpNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setCpError(data.error || 'Failed to change password'); return; }
      setCpSuccess('Password changed successfully');
      setCpCurrentPassword(''); setCpNewPassword(''); setCpConfirm('');
    } catch { setCpError('Network error'); }
    finally { setCpLoading(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-ink-muted text-sm">Loading...</div>
      </div>
    );
  }

  const isOwner = session?.role === 'owner';

  return (
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="employees" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-4xl">

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[30px] leading-none font-serif font-medium text-ink">Employees</h1>
              <p className="text-[13.5px] text-ink-soft mt-2">Admin account management</p>
            </div>
            <button onClick={load} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors">
              <RefreshCw className="w-4 h-4"/>Refresh
            </button>
          </div>

          {/* Role reference */}
          <Card className="p-4 mb-6">
            <Eyebrow className="mb-2.5">Role permissions</Eyebrow>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => (
                <div key={r.value} className="flex items-start gap-2">
                  <span className={`text-[12.5px] font-semibold shrink-0 ${roleTextClass(r.value)}`}>{r.label}</span>
                  <span className="text-xs text-ink-muted">{r.desc}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Add employee — owner only */}
          {isOwner && (
            <Card className="p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-pine"/>
                <span className="text-sm font-medium text-ink">Add employee</span>
              </div>
              {createError && (
                <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad text-sm mb-4">{createError}</div>
              )}
              {createTempPwd && (
                <div className="mb-4">
                  <TempPasswordBox
                    label={`Account created — temp password for ${newName || 'new employee'}:`}
                    pwd={createTempPwd}
                    onDismiss={() => setCreateTempPwd('')}
                  />
                </div>
              )}
              <form onSubmit={handleCreate} className="flex gap-3 flex-wrap">
                <input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="Full name" className={iCls + ' flex-1 min-w-32'}/>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required placeholder="Email" className={iCls + ' flex-1 min-w-48'}/>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} className={iCls + ' cursor-pointer'}>
                  <option value="manager">Manager</option>
                  <option value="support">Support</option>
                  <option value="viewer">Viewer</option>
                  <option value="owner">Owner</option>
                </select>
                <button type="submit" disabled={creating}
                  className="bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[12.5px] font-medium px-4 py-2 rounded-md transition-colors">
                  {creating ? 'Creating...' : 'Create account'}
                </button>
              </form>
            </Card>
          )}

          {loadError && (
            <ErrorBanner message={loadError.msg} kind={loadError.kind} onRetry={() => load()} />
          )}
          {actionError && (
            <ErrorBanner message={actionError} onDismiss={() => setActionError('')} />
          )}


          {/* Employee list */}
          <Card className="overflow-x-auto mb-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line bg-paper">
                  <Eyebrow as="th" className="text-left px-5 py-3">Name</Eyebrow>
                  <Eyebrow as="th" className="text-left px-5 py-3">Role</Eyebrow>
                  <Eyebrow as="th" className="text-left px-5 py-3">Last login</Eyebrow>
                  <Eyebrow as="th" className="text-left px-5 py-3">Status</Eyebrow>
                  {isOwner && <th className="px-5 py-3 w-56"/>}
                </tr>
              </thead>
              <tbody>
                {admins.map((admin, i) => (
                  <Fragment key={admin.id}>
                    <tr className={'transition-colors ' + (i < admins.length - 1 && !resetPwds[admin.id] ? 'border-b border-line-soft' : '')}>
                      <td className="px-5 py-3.5">
                        <div className="text-sm font-medium text-ink">{admin.name}</div>
                        <div className="text-xs text-ink-soft">{admin.email}</div>
                        {admin.id === session?.adminId && <div className="text-[10px] text-ink-faint mt-0.5">You</div>}
                      </td>
                      <td className="px-5 py-3.5">
                        {isOwner && admin.id !== session?.adminId ? (
                          <select
                            value={admin.role}
                            onChange={e => changeRole(admin, e.target.value)}
                            disabled={actionLoading === admin.id + '_role'}
                            className="text-[11px] border border-line rounded px-2 py-1 bg-paper text-ink cursor-pointer focus:outline-none focus:border-pine/40 disabled:opacity-50"
                          >
                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        ) : (
                          <span className={`text-[12.5px] font-semibold ${roleTextClass(admin.role)}`}>
                            {ROLES.find(r => r.value === admin.role)?.label || admin.role}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-ink-soft tabular-nums">{fmt(admin.lastLoginAt)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          {admin.active
                            ? <StatusDot status="ok" label="Active" />
                            : <StatusDot status="neutral" label="Inactive" />}
                          {admin.mustChangePassword && (
                            <span className="text-[10px] text-warn font-medium">Must change pwd</span>
                          )}
                        </div>
                      </td>
                      {isOwner && (
                        <td className="px-5 py-3.5">
                          {admin.id !== session?.adminId && (
                            <div className="flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => resetPassword(admin)}
                                disabled={!!actionLoading}
                                className="flex items-center gap-1 text-xs text-ink-soft hover:text-ink px-2 py-1 rounded hover:bg-paper border border-line hover:border-line-strong transition-colors disabled:opacity-50"
                                title="Generate new temp password"
                              >
                                <KeyRound className="w-3 h-3" />Reset pwd
                              </button>
                              <button
                                onClick={() => toggleActive(admin)}
                                disabled={actionLoading === admin.id + '_active'}
                                className="text-xs text-ink-soft hover:text-ink px-2 py-1 rounded hover:bg-paper transition-colors disabled:opacity-50"
                              >
                                {admin.active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                    {resetPwds[admin.id] && (
                      <tr key={admin.id + '_pwd'} className={i < admins.length - 1 ? 'border-b border-line-soft' : ''}>
                        <td colSpan={isOwner ? 5 : 4} className="px-5 pb-3.5">
                          <TempPasswordBox
                            label={`Temp password for ${admin.name}:`}
                            pwd={resetPwds[admin.id]}
                            onDismiss={() => setResetPwds(p => { const n = { ...p }; delete n[admin.id]; return n; })}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {admins.length === 0 && !loadError && (
                  <tr>
                    <td colSpan={isOwner ? 5 : 4} className="px-5 py-8 text-center text-sm text-ink-muted">
                      No admin accounts yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          {/* Change own password */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-4 h-4 text-pine"/>
              <span className="text-sm font-medium text-ink">Change your password</span>
            </div>
            {cpError && (
              <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad text-sm mb-4">{cpError}</div>
            )}
            {cpSuccess && (
              <div className="bg-ok/5 border border-ok/20 rounded-md px-3 py-2 text-ok text-sm mb-4">{cpSuccess}</div>
            )}
            <form onSubmit={handleChangePassword} className="grid grid-cols-3 gap-3">
              <div>
                <label className="block"><Eyebrow as="span" className="block mb-1.5">Current password</Eyebrow>
                <input type="password" value={cpCurrentPassword} onChange={e => setCpCurrentPassword(e.target.value)} required placeholder="Current password" className={iCls + ' w-full'}/></label>
              </div>
              <div>
                <label className="block"><Eyebrow as="span" className="block mb-1.5">New password</Eyebrow>
                <input type="password" value={cpNewPassword} onChange={e => setCpNewPassword(e.target.value)} required placeholder="Min 8 characters" className={iCls + ' w-full'}/></label>
              </div>
              <div>
                <label className="block"><Eyebrow as="span" className="block mb-1.5">Confirm new password</Eyebrow>
                <input type="password" value={cpConfirm} onChange={e => setCpConfirm(e.target.value)} required placeholder="Confirm password" className={iCls + ' w-full'}/></label>
              </div>
              <div className="col-span-3">
                <button type="submit" disabled={cpLoading || !cpCurrentPassword || !cpNewPassword || !cpConfirm}
                  className="bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[12.5px] font-medium px-5 py-2 rounded-md transition-colors">
                  {cpLoading ? 'Changing...' : 'Change password'}
                </button>
              </div>
            </form>
          </Card>

        </div>
      </div>
    </div>
  );
}
