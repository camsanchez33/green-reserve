'use client';
// Settings → My profile (Cam approved the mockup 2026-11-15, lanes/admin/profile-mockup.html; lanes/admin.md "Approved, to
// build: Settings → My profile"). Every login sees Your account and Password; the owner also sees Owner security
// (passkeys, approved devices, the authenticator app and recovery codes, sign out everywhere). Only the skin changed:
// the password still goes to /api/admin/change-password with the same checks and errors, and the owner cards keep their
// calls and step-up.
import { useEffect, useState } from 'react';

import AdminSidebar from '@/components/admin/AdminSidebar';
import { useAdminSession } from '@/lib/admin-session-context';
import OwnerPasskeysCard from '@/components/admin/OwnerPasskeysCard';
import OwnerDevicesCard from '@/components/admin/OwnerDevicesCard';
import OwnerSignOutEverywhere from '@/components/admin/OwnerSignOutEverywhere';
import OwnerTwoFactorCard from '@/components/admin/OwnerTwoFactorCard';
import { ProfileCard, ProfileRow, Msg, profileStyles as s } from '@/components/admin/ProfileCard';
import g from '../admin-glass.module.css';
import { ROLE_LABELS, changedOn } from './logic';

// "Request a change" links to the employee contact page, which doesn't exist yet: hidden until it does (Build's
// default, Cam 2026-11-15). Set the path here when the page lands.
const EMPLOYEE_CONTACT_HREF: string | null = null;

export default function ProfilePage() {
  // MP-11a: the session comes from the layout — nothing to fetch, no loading state.
  const session = useAdminSession();
  const isOwner = session.role === 'owner';

  // The "Changed <date>" row: the date comes from Build ("My profile data") on the session view; until it is there,
  // or when it isn't known, the row is hidden. Formatted after mount so the server and the browser agree on the day.
  const changedIso = (session as { passwordChangedAt?: string | null }).passwordChangedAt ?? null;
  const [changed, setChanged] = useState<string | null>(null);
  useEffect(() => { setChanged(changedOn(changedIso)); }, [changedIso]);

  const [pwOpen, setPwOpen] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState('');
  const [cpSuccess, setCpSuccess] = useState('');

  const resetPw = () => { setCpCurrent(''); setCpNew(''); setCpConfirm(''); setCpError(''); };

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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCpError(data.error || 'Failed'); return; }
      setCpSuccess('Password updated');
      resetPw(); setPwOpen(false);
      setChanged(changedOn(new Date().toISOString()));
    } catch { setCpError('Network error'); }
    finally { setCpLoading(false); }
  }

  const account = (
    <ProfileCard title="Your account" labelId="pf-account"
      lead={isOwner ? 'Your name, email and role on GreenReserve.' : 'Only the owner can change these.'}
      top={!isOwner && EMPLOYEE_CONTACT_HREF ? <a className={s.lnk} href={EMPLOYEE_CONTACT_HREF}>Request a change</a> : undefined}>
      <ProfileRow><span className={s.k}>Name</span>{session.name}</ProfileRow>
      <ProfileRow><span className={s.k}>Email</span>{session.email}</ProfileRow>
      <ProfileRow><span className={s.k}>Role</span>{ROLE_LABELS[session.role ?? ''] ?? session.role}</ProfileRow>
    </ProfileCard>
  );

  const password = pwOpen ? (
    <form onSubmit={handleChangePassword} className={`${g.glass} ${s.card}`} aria-labelledby="pf-password">
      <div className={s.ch}><div><h3 id="pf-password">Password</h3><p>At least 8 characters.</p></div></div>
      <div className={s.cb}>
        {cpError && <Msg ok={false}>{cpError}</Msg>}
        <div className={s.pw}>
          <label>Current password<input type="password" autoComplete="current-password" value={cpCurrent} onChange={e => setCpCurrent(e.target.value)} required autoFocus className={s.fld} /></label>
          <label>New password<input type="password" autoComplete="new-password" value={cpNew} onChange={e => setCpNew(e.target.value)} required minLength={8} className={s.fld} /></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" value={cpConfirm} onChange={e => setCpConfirm(e.target.value)} required className={s.fld} /></label>
        </div>
      </div>
      <div className={s.cf}>
        <button type="submit" disabled={cpLoading || !cpCurrent || !cpNew || !cpConfirm} className={`${s.btn} ${s.pri}`}>{cpLoading ? 'Saving…' : 'Update password'}</button>
        <button type="button" disabled={cpLoading} onClick={() => { resetPw(); setPwOpen(false); }} className={s.btn}>Cancel</button>
      </div>
    </form>
  ) : (
    <ProfileCard title="Password" labelId="pf-password" lead="Used with your email to sign in."
      top={<button type="button" className={s.lnk} onClick={() => { resetPw(); setCpSuccess(''); setPwOpen(true); }}>Update password</button>}>
      <ProfileRow><span className={s.k}>Password</span>••••••••••</ProfileRow>
      {changed && <ProfileRow><span className={s.k}>Changed</span>{changed}</ProfileRow>}
      {cpSuccess && <Msg ok>{cpSuccess}</Msg>}
    </ProfileCard>
  );

  return (
    <>
      <AdminSidebar active="profile" />
      <main className={g.main}>
        <div className={g.head}><h1>My profile</h1></div>
        <div className={s.col}>
          <div className={s.grid}>{account}{password}</div>

          {/* OWNER: passkeys, trusted devices, the authenticator app, sign out everywhere. */}
          {isOwner && (
            <>
              <div className={s.ownh}>
                <h2>Owner security</h2>
                <p>How you prove it’s you at /cam, and which devices are signed in.</p>
              </div>
              <div className={s.grid}>
                <OwnerPasskeysCard />
                <OwnerDevicesCard />
                <OwnerTwoFactorCard mfaSession={session.mfa === true} />
              </div>
              <OwnerSignOutEverywhere />
            </>
          )}
        </div>
      </main>
    </>
  );
}
