'use client';
import { useState } from 'react';

import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import OwnerTwoFactorCard from '@/components/admin/OwnerTwoFactorCard';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/Eyebrow';
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
    <div className="min-h-screen bg-paper flex">
      <AdminSidebar active="profile" />
      <div className="admin-content flex-1 min-h-screen">
        <div className="px-8 py-7 max-w-xl">

          <div className="mb-6">
            <h1 className="text-[22px] font-serif font-semibold tracking-tight text-ink">My profile</h1>
            <p className="text-sm text-ink-soft mt-0.5">Account details and password</p>
          </div>

          {/* Account info */}
          <Card className="p-5 mb-5">
            <div className="flex items-center gap-2 mb-4">
              
              <span className="text-sm font-medium text-ink">Account</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-line-soft">
                <Eyebrow as="span">Name</Eyebrow>
                <span className="text-sm text-ink font-medium">{session.name}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-line-soft">
                <Eyebrow as="span">Email</Eyebrow>
                <span className="text-sm text-ink">{session.email}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <Eyebrow as="span">Role</Eyebrow>
                <span className="text-sm text-ink font-medium">{ROLE_LABELS[session.role ?? ''] ?? session.role}</span>
              </div>
            </div>
            {session.role === 'owner' && (
              <div className="mt-4 pt-3 border-t border-line-soft">
                <a href="/admin/owner-login" className="text-xs text-pine underline hover:text-pine-hover transition-colors">
                  Use secure owner login (with 2FA) next time
                </a>
              </div>
            )}
          </Card>

          {/* OWNER TOTP 2FA — enrolment lives here, owner only. */}
          {session.role === 'owner' && <OwnerTwoFactorCard mfaSession={session.mfa === true} />}

          {/* Change password */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              
              <span className="text-sm font-medium text-ink">Change password</span>
            </div>
            {cpError && (
              <div className="bg-bad/5 border border-bad/20 rounded-md px-3 py-2 text-bad text-sm mb-4">{cpError}</div>
            )}
            {cpSuccess && (
              <div className="bg-ok/5 border border-ok/20 rounded-md px-3 py-2 text-ok text-sm mb-4">{cpSuccess}</div>
            )}
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block"><Eyebrow as="span" className="block mb-1.5">Current password</Eyebrow>
                <input type="password" value={cpCurrent} onChange={e => setCpCurrent(e.target.value)} required className={iCls} /></label>
              </div>
              <div>
                <label className="block"><Eyebrow as="span" className="block mb-1.5">New password</Eyebrow>
                <input type="password" value={cpNew} onChange={e => setCpNew(e.target.value)} required placeholder="Min 8 characters" className={iCls} /></label>
              </div>
              <div>
                <label className="block"><Eyebrow as="span" className="block mb-1.5">Confirm new password</Eyebrow>
                <input type="password" value={cpConfirm} onChange={e => setCpConfirm(e.target.value)} required className={iCls} /></label>
              </div>
              <div className="pt-1">
                <button type="submit" disabled={cpLoading || !cpCurrent || !cpNew || !cpConfirm}
                  className="bg-pine hover:bg-pine-hover disabled:opacity-50 text-white text-[12.5px] font-medium px-5 py-2 rounded-md transition-colors">
                  {cpLoading ? 'Saving…' : 'Update password'}
                </button>
              </div>
            </form>
          </Card>

        </div>
      </div>
    </div>
  );
}
