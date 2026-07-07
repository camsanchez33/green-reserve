'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, CheckCircle, XCircle, Lock } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  passwordSet: boolean;
}

interface Session { adminId: string; email: string; name: string; role: string; }

const iCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/30 transition-colors';

function fmt(d: string | null) {
  if (!d) return 'Never';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function EmployeesPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('staff');
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Change-password state
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
    setCreateError(''); setCreateSuccess(''); setCreating(true);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || 'Failed'); return; }
      setCreateSuccess(`Invite sent to ${newEmail}`);
      setNewName(''); setNewEmail(''); setNewRole('staff');
      load();
    } catch { setCreateError('Network error'); }
    finally { setCreating(false); }
  }

  async function toggleActive(admin: Admin) {
    setActionLoading(admin.id);
    await fetch('/api/admin/employees', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: admin.id, active: !admin.active }),
    });
    setActionLoading(null);
    load();
  }

  async function toggleRole(admin: Admin) {
    setActionLoading(admin.id + '_role');
    await fetch('/api/admin/employees', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: admin.id, role: admin.role === 'owner' ? 'staff' : 'owner' }),
    });
    setActionLoading(null);
    load();
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-600 text-sm">Loading...</div>
      </div>
    );
  }

  const isOwner = session?.role === 'owner';

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <AdminSidebar active="employees" />
      <div className="ml-56 flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-4xl">
          <div className="flex items-center justify-between mb-7">
            <div>
              <h1 className="text-2xl font-black text-white">Employees</h1>
              <div className="text-sm text-gray-500 mt-0.5">Admin account management</div>
            </div>
            <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white px-3 py-2 rounded-lg hover:bg-gray-800 border border-transparent hover:border-gray-700 transition-colors">
              <RefreshCw className="w-4 h-4"/>Refresh
            </button>
          </div>

          {/* Create form — owner only */}
          {isOwner && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-emerald-500"/>
                <span className="text-sm font-bold text-white">Add employee</span>
              </div>
              {createError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm mb-4">{createError}</div>
              )}
              {createSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-emerald-400 text-sm mb-4">{createSuccess}</div>
              )}
              <form onSubmit={handleCreate} className="flex gap-3 flex-wrap">
                <input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="Full name" className={iCls + ' flex-1 min-w-32'}/>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required placeholder="Email" className={iCls + ' flex-1 min-w-48'}/>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} className={iCls}>
                  <option value="staff">Staff</option>
                  <option value="owner">Owner</option>
                </select>
                <button type="submit" disabled={creating}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm px-4 py-2 rounded-lg transition-colors">
                  {creating ? 'Sending...' : 'Send invite'}
                </button>
              </form>
            </div>
          )}

          {/* Employee list */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden mb-6">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 px-5 py-3">Name</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 px-5 py-3">Role</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 px-5 py-3">Last login</th>
                  <th className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 px-5 py-3">Status</th>
                  {isOwner && <th className="px-5 py-3"/>}
                </tr>
              </thead>
              <tbody>
                {admins.map((admin, i) => (
                  <tr key={admin.id} className={i < admins.length - 1 ? 'border-b border-gray-800/50' : ''}>
                    <td className="px-5 py-3.5">
                      <div className="text-sm font-medium text-white">{admin.name}</div>
                      <div className="text-xs text-gray-500">{admin.email}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${admin.role === 'owner' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>
                        {admin.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-400">{fmt(admin.lastLoginAt)}</td>
                    <td className="px-5 py-3.5">
                      {admin.active
                        ? <span className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle className="w-3.5 h-3.5"/>Active</span>
                        : <span className="flex items-center gap-1.5 text-xs text-gray-600"><XCircle className="w-3.5 h-3.5"/>Inactive</span>}
                    </td>
                    {isOwner && (
                      <td className="px-5 py-3.5">
                        {admin.id !== session?.adminId && (
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => toggleRole(admin)} disabled={actionLoading === admin.id + '_role'}
                              className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors">
                              {admin.role === 'owner' ? 'Make staff' : 'Make owner'}
                            </button>
                            <button onClick={() => toggleActive(admin)} disabled={actionLoading === admin.id}
                              className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors">
                              {admin.active ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {admins.length === 0 && (
                  <tr>
                    <td colSpan={isOwner ? 5 : 4} className="px-5 py-8 text-center text-sm text-gray-600">
                      No admin accounts yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Change password */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-4 h-4 text-emerald-500"/>
              <span className="text-sm font-bold text-white">Change your password</span>
            </div>
            {cpError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm mb-4">{cpError}</div>
            )}
            {cpSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-emerald-400 text-sm mb-4">{cpSuccess}</div>
            )}
            <form onSubmit={handleChangePassword} className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Current password</label>
                <input
                  type="password"
                  value={cpCurrentPassword}
                  onChange={e => setCpCurrentPassword(e.target.value)}
                  required
                  placeholder="Current password"
                  className={iCls + ' w-full'}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">New password</label>
                <input
                  type="password"
                  value={cpNewPassword}
                  onChange={e => setCpNewPassword(e.target.value)}
                  required
                  placeholder="Min 8 characters"
                  className={iCls + ' w-full'}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Confirm new password</label>
                <input
                  type="password"
                  value={cpConfirm}
                  onChange={e => setCpConfirm(e.target.value)}
                  required
                  placeholder="Confirm password"
                  className={iCls + ' w-full'}
                />
              </div>
              <div className="col-span-3 flex justify-start">
                <button
                  type="submit"
                  disabled={cpLoading || !cpCurrentPassword || !cpNewPassword || !cpConfirm}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm px-5 py-2.5 rounded-lg transition-colors"
                >
                  {cpLoading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
