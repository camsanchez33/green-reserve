'use client';
// SETTINGS-6: Your account — this login's email, password and two-step sign-in. Only you see it. Staff logins are a
// separate account: the password and two-step routes here are the owner's only (both refuse staff).
// Alerts (where we reach you, quiet hours) wait for Build's data and stay hidden until then.
import { useState } from 'react';
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from '@/lib/password';
import { dfetch } from '@/lib/dashboard-fetch';
import { type Ctx, Group, Row, Muted, EditPopup, Field, FIELD, Choices, LINK } from './ui';

const s = (v: unknown) => (v == null ? '' : String(v));

function PasswordPopup({ email, onClose }: { email: string; onClose: () => void }) {
  const [cur, setCur] = useState(''), [next, setNext] = useState(''), [again, setAgain] = useState('');
  const [reset, setReset] = useState<'' | 'sending' | 'sent' | 'failed'>('');
  async function save() {
    if (!cur || !next) return 'Fill in both password fields.';
    const weak = validatePasswordStrength(next);
    if (weak) return weak;
    if (next !== again) return 'New passwords do not match.';
    const r = await dfetch('/api/operator/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: cur, newPassword: next }) });
    return r.ok ? null : r.error;
  }
  async function emailReset() {
    setReset('sending');
    const r = await dfetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
    setReset(r.ok ? 'sent' : 'failed');
  }
  return (
    <EditPopup title="Password" hint="For your own login only. Staff keep their own passwords." saveLabel="Update password" savedText="Password updated." onClose={onClose} onSave={save}>
      <Field label="Current password"><input type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} className={FIELD} autoFocus /></Field>
      <Field label="New password" hint={PASSWORD_REQUIREMENTS_HINT}><input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} className={FIELD} /></Field>
      <Field label="New password again"><input type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} className={FIELD} /></Field>
      <p className="text-[12.5px] text-ink-soft" role="status">
        {reset === 'sent' ? `Check ${email} for a reset link.`
          : reset === 'failed' ? <>The reset link wasn’t sent. <button type="button" className={LINK} onClick={emailReset}>Try again</button></>
          : <>Don’t remember your current password? <button type="button" className={LINK} disabled={!email || reset === 'sending'} onClick={emailReset}>{reset === 'sending' ? 'Sending…' : 'Email me a reset link'}</button></>}
      </p>
    </EditPopup>
  );
}

function TwoStepPopup({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const [method, setMethod] = useState<'email' | 'sms'>(s(ctx.form.twoFactorMethod) === 'sms' ? 'sms' : 'email');
  const [phone, setPhone] = useState(s(ctx.form.twoFactorPhone));
  return (
    <EditPopup title="Two-step sign-in" hint="Every sign-in asks for a 6-digit code as well as your password. Choose where it’s sent." onClose={onClose}
      onSave={async () => {
        if (method === 'sms' && !phone.trim()) return 'Enter a phone number to receive text codes.';
        return ctx.save({ twoFactorMethod: method, twoFactorPhone: phone });
      }}>
      <Choices name="Where the code is sent" value={method} onChange={setMethod} options={[
        { key: 'email', label: 'Email', help: ctx.email ? `Sent to ${ctx.email}.` : 'Sent to your sign-in email.' },
        { key: 'sms', label: 'Text message', help: 'Sent to a mobile number you add below.' },
      ]} />
      {method === 'sms' && <Field label="Mobile number for codes"><input type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} className={FIELD} /></Field>}
    </EditPopup>
  );
}

export function AccountArea({ ctx }: { ctx: Ctx }) {
  const f = ctx.form;
  const [pop, setPop] = useState<'' | 'pw' | '2fa'>('');
  const close = () => setPop('');
  const course = s(f.name) || 'your course';
  const sms = s(f.twoFactorMethod) === 'sms';
  return (
    <>
      <Group id="signin" title="Your sign-in" note="Only you.">
        {ctx.accessLoaded && <Row id="signin-who" label={ctx.owner ? 'Owner login' : 'Staff login'}
          note={ctx.owner ? 'The admin of your own course. What each staff login can do is set in Staff and permissions.' : 'The course owner decides what you can see and change.'} value={course} />}
        <Row id="signin-email" label="Email" note={ctx.owner ? 'Where your codes go. To change it, message us on Support.' : 'To change it, ask the course owner.'} value={ctx.email || '…'} />
        {ctx.owner && <Row id="signin-pw" label="Password" value={<Muted>Change</Muted>} onOpen={() => setPop('pw')} />}
        {ctx.owner && <Row id="signin-2fa" label="Two-step sign-in" note="A code each time you sign in." value={sms ? `Text to ${s(f.twoFactorPhone) || 'your phone'}` : `Email${ctx.email ? ` to ${ctx.email}` : ''}`} onOpen={() => setPop('2fa')} />}
        {ctx.accessLoaded && !ctx.owner && <Row id="signin-staff" label="Password and codes" value={<Muted>Set by the course owner</Muted>} />}
      </Group>
      {pop === 'pw' && <PasswordPopup email={ctx.email} onClose={close} />}
      {pop === '2fa' && <TwoStepPopup ctx={ctx} onClose={close} />}
    </>
  );
}
