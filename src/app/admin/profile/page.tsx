'use client';
import { useState } from 'react';

import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import OwnerPasskeysCard from '@/components/admin/OwnerPasskeysCard';
import OwnerDevicesCard from '@/components/admin/OwnerDevicesCard';
import OwnerSignOutEverywhere from '@/components/admin/OwnerSignOutEverywhere';
import OwnerTwoFactorCard from '@/components/admin/OwnerTwoFactorCard';
import { INPUT_COMPACT } from '@/components/ui/field';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', manager: 'Manager', support: 'Support', viewer: 'Viewer',
};

const iCls = `${INPUT_COMPACT} w-full`;

export default function ProfilePage() {
  // MP-11a: the session comes from the layout — nothing to fetch, no loading state.
  const session = useAdminSession();

  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState('');

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setCpError(''); setCpSuccess('');
    if (cpNew !== cpConfirm) { setCpError('Passwords do not match'); return; }
    if (cpNew.length < 8) { setCpError('Must be at least 8 characters'); return; }
    setCpLoading(true);
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cpCurrent, newPassword: cpNew }),
      });
      const data = await res.json();
      if (!res.ok) { setCpError(data.error || 'Failed'); return; }
      setCpSuccess('Password updated');
      setCpCurrent(''); setCpNew(''); setCpConfirm('');
    } catch { setCpError('Network error'); }
    finally { setCpLoading(false); }
  }

  return (
    <div className="min-h-screen bg-white flex">
      <AdminSidebar active="profile" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-10 py-8 max-w-xl">

          <div className="mb-8">
            <h1 className="m-0 text-[32px] font-bold tracking-[-0.02em] text-ink leading-none">My profile</h1>
            <p className="mt-2 text-[14px] text-ink-soft">Your account, your password and how you sign in.</p>
          </div>

          {/* ADMIN-C (AW-16, "rework, make more organized"): who you are, your
              password, then — for the owner — everything that guards the owner door. */}
          <section className="mb-8">
            <h2 className="text-[20px] font-bold text-ink">Your account</h2>
            <div className="mt-3 border border-line rounded-lg divide-y divide-line-soft">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[13.5px] text-ink-soft">Name</span>
                <span className="text-sm text-ink font-medium">{session.name}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[13.5px] text-ink-soft">Email</span>
                <span className="text-sm text-ink">{session.email}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[13.5px] text-ink-soft">Role</span>
                <span className="text-sm text-ink font-medium">{ROLE_LABELS[session.role ?? ''] ?? session.role}</span>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-[20px] font-bold text-ink">Password</h2>
            {cpError && (
              <div role="alert" className="mt-3 bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad text-sm">{cpError}</div>
            )}
            {cpSuccess && (
              <div role="status" className="mt-3 bg-ok/5 border border-ok/20 rounded-md px-3 py-2 text-ok text-sm">{cpSuccess}</div>
            )}
            <form onSubmit={handleChangePassword} className="mt-3 space-y-3">
              <label className="block"><span className="block mb-1.5 text-[13.5px] text-ink-soft">Current password</span>
              <input type="password" value={cpCurrent} onChange={e => setCpCurrent(e.target.value)} required className={iCls} /></label>
              <label className="block"><span className="block mb-1.5 text-[13.5px] text-ink-soft">New password</span>
              <input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} required placeholder="Min 8 characters" className={iCls} /></label>
              <label className="block"><span className="block mb-1.5 text-[13.5px] text-ink-soft">Confirm new password</span>
              <input type="password" value={cpConfirm} onChange={e => setCpConfirm(e.target.value)} required className={iCls} /></label>
              <div className="pt-1">
                <button type="submit" disabled={cpLoading || !cpCurrent || !cpNew || !cpConfirm}
                  className="bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[13px] font-medium px-5 py-2 rounded-md transition-colors">
                  {cpLoading ? 'Saving…' : 'Update password'}
                </button>
              </div>
            </form>
          </section>

          {/* OWNER: passkeys, trusted devices, the authenticator app, sign out everywhere. */}
          {session.role === 'owner' && (
            <section className="flex flex-col gap-5">
              <div>
                <h2 className="text-[20px] font-bold text-ink">Owner security</h2>
                <p className="mt-1 text-[14px] text-ink-soft">How you prove it&rsquo;s you at /cam, and which devices are signed in.</p>
              </div>
              <OwnerPasskeysCard />
              <OwnerDevicesCard />
              <OwnerTwoFactorCard mfaSession={session.mfa === true} />
              <OwnerSignOutEverywhere />
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
