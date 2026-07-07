'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, Lock, Copy, KeyRound } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { StatusDot } from '@/components/ui/StatusDot';

interface Admin {
  id: string; email: string; name: string; role: string;
  active: boolean; mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string;
}
interface Session { adminId: string; email: string; name: string; role: string; }

const ROLES = [
  { value: 'owner',   label: 'Owner',   desc: 'Full access, manages employees & broadcasts' },
  { value: 'manager', label: 'Manager', desc: 'Courses, inquiries, messages; no employees or broadcasts' },
  { value: 'support', label: 'Support', desc: 'View + reply to messages; no create/edit/delete' },
  { value: 'viewer',  label: 'Viewer',  desc: 'Read-only across everything' },
];

function roleBadgeClass(role: string) {
  if (role === 'owner') return 'bg-pine/10 text-pine';
  if (role === 'manager') return 'bg-ink/5 text-ink border border-line';
  if (role === 'support') return 'bg-paper text-ink-soft border border-line';
  return 'bg-paper text-ink-faint border border-line';
}

const iCls = 'bg-paper border border-line rounded-md px-3 py-2 text-ink text-sm placeholder-ink-faint focus:outline-none focus:border-pine/40 focus:ring-2 focus:ring-pine/10 transition-colors';

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
  const [session, setSession] = useState<Session | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('manager');
  const [createError, setCreateError] = useState('');
  const [createTempPwd, setCreateTempPwd] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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
      const [sRes, aRes] = await Promise.all([
        fetch('/api/admin/session'),
        fetch('/api/admin/employees'),
      ]);
      if (!sRes.ok) { router.push('/admin/login'); return; }
      const [s, a] = await Promise.all([sRes.json(), aRes.json()]);
      setSession(s);
      setAdmins(Array.isArray(a) ? a : []);
    } catch { router.push('/admin/login'); }
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

  async function toggleActive(admin: Admin) {
    setActionLoading(admin.id + '_active');
    await fetch('/api/admin/employees', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: admin.id, active: !admin.active }),
    });
    setActionLoading(null);
    load();
  }

  async function changeRole(admin: Admin, newRoleVal: string) {
    setActionLoading(admin.id + '_role');
    await fetch('/api/admin/employees', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: admin.id, role: newRoleVal }),
    });
    setActionLoading(null);
    load();
  }

  async function resetPassword(admin: Admin) {
    if (!confirm(`Reset ${admin.name}'s password? They will be required to change it on next login.`)) return;
    setActionLoading(admin.id + '_reset');
    const res = await fetch('/api/admin/employees', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: admin.id, action: 'reset_password' }),
    });
    const data = await res.json();
    setActionLoading(null);
    if (res.ok && data.tempPassword) {
      setResetPwds(p => ({ ...p, [admin.id]: data.tempPassword }));
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
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-4xl">

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-[22px] font-serif font-medium tracking-tight text-ink">Employees</h1>
              <p className="text-sm text-ink-soft mt-0.5">Admin account management</p>
            </div>
            <button onClick={load} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-md hover:bg-white border border-transparent hover:border-line transition-colors">
              <RefreshCw className="w-4 h-4"/>Refresh
            </button>
          </div>

          {/* Role reference */}
          <div className="bg-white border border-line rounded-lg p-4 mb-6">
            <div className="text-[11px] uppercase tracking-[0.06em] text-ink-muted mb-2.5">Role permissions</div>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => (
                <div key={r.value} className="flex items-start gap-2">
                  <span className={`text-[10px] uppercase tracking-[0.04em] font-medium px-2 py-0.5 rounded shrink-0 ${roleBadgeClass(r.value)}`}>{r.label}</span>
                  <span className="text-xs text-ink-muted">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Add employee — owner only */}
          {isOwner && (
            <div className="bg-white border border-line rounded-lg p-5 mb-6">
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
            </div>
          )}

          {/* Employee list */}
          <div className="bg-white border border-line rounded-lg overflow-hidden mb-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line bg-paper">
                  <th className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-muted px-5 py-3">Name</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-muted px-5 py-3">Role</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-muted px-5 py-3">Last login</th>
                  <th className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-muted px-5 py-3">Status</th>
                  {isOwner && <th className="px-5 py-3 w-56"/>}
                </tr>
              </thead>
              <tbody>
                {admins.map((admin, i) => (
                  <>
                    <tr key={admin.id} className={'transition-colors ' + (i < admins.length - 1 && !resetPwds[admin.id] ? 'border-b border-line-soft' : '')}>
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
                          <span className={`text-[11px] uppercase tracking-[0.06em] px-2 py-0.5 rounded ${roleBadgeClass(admin.role)}`}>
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
                  </>
                ))}
                {admins.length === 0 && (
                  <tr>
                    <td colSpan={isOwner ? 5 : 4} className="px-5 py-8 text-center text-sm text-ink-muted">
                      No admin accounts yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Change own password */}
          <div className="bg-white border border-line rounded-lg p-5">
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
                <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Current password</label>
                <input type="password" value={cpCurrentPassword} onChange={e => setCpCurrentPassword(e.target.value)} required placeholder="Current password" className={iCls + ' w-full'}/>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">New password</label>
                <input type="password" value={cpNewPassword} onChange={e => setCpNewPassword(e.target.value)} required placeholder="Min 8 characters" className={iCls + ' w-full'}/>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.06em] text-ink-muted block mb-1.5">Confirm new password</label>
                <input type="password" value={cpConfirm} onChange={e => setCpConfirm(e.target.value)} required placeholder="Confirm password" className={iCls + ' w-full'}/>
              </div>
              <div className="col-span-3">
                <button type="submit" disabled={cpLoading || !cpCurrentPassword || !cpNewPassword || !cpConfirm}
                  className="bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[12.5px] font-medium px-5 py-2 rounded-md transition-colors">
                  {cpLoading ? 'Changing...' : 'Change password'}
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
