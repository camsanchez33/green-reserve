'use client';
// TEAM-1: invite someone (the mockup's invite popup). Name, email, an optional phone and a role; they get the welcome
// email and set their own password from it (no temporary password to pass on). The email shown is the real one the
// server will send, drawn by the server; when it can't be fetched the preview is left out rather than guessed at.
import { useEffect, useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { Popup, FIELD } from '@/components/dashboard/settings/ui';
import { type Role, Field, LINK, PRIMARY } from './shared';

export function InvitePopup({ roles, roleId, onClose, onChanged }: {
  roles: Role[]; roleId?: string; onClose: () => void; onChanged: () => Promise<void> | void;
}) {
  const choices = roles.filter(r => !r.owner);
  const start = choices.find(r => r.id === roleId)?.id ?? choices[0]?.id ?? '';
  const [f, setF] = useState({ name: '', email: '', phone: '', roleId: start });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  useEffect(() => {
    if (!f.roleId) return;
    let live = true;
    const q = new URLSearchParams({ roleId: f.roleId, ...(f.name.trim() ? { name: f.name.trim() } : {}) });
    const t = window.setTimeout(() => {
      dfetch<{ subject: string; html: string }>(`/api/operator/staff/invite/preview?${q}`).then(r => {
        if (live) setPreview(r.ok && r.data?.html ? r.data : null);
      });
    }, f.name ? 350 : 0);
    return () => { live = false; window.clearTimeout(t); };
  }, [f.roleId, f.name]);

  if (!choices.length) {
    return (
      <Popup label="Add a role first" onClose={onClose}>
        <h3 className="text-[18px] font-semibold text-ink">Add a role first</h3>
        <p className="text-[13px] text-ink-soft">Everyone you invite gets a role. Add one from Suggested roles, or make your own.</p>
        <div className="flex justify-end"><button type="button" className={PRIMARY} onClick={onClose}>OK</button></div>
      </Popup>
    );
  }

  const ready = f.name.trim() && f.email.trim() && f.roleId;
  function close() {
    if ((f.name.trim() || f.email.trim()) && !confirm('Discard this invite?')) return;
    onClose();
  }
  async function send() {
    if (!ready || busy) return;
    setBusy(true); setErr('');
    const r = await dfetch('/api/operator/staff/invite', { method: 'POST', body: JSON.stringify({
      name: f.name.trim(), email: f.email.trim(), roleId: f.roleId, ...(f.phone.trim() ? { phone: f.phone.trim() } : {}),
    }) });
    setBusy(false);
    // 502: they were added (as Invited) but the email didn't go out. Say so, and where to send it again.
    if (!r.ok && r.status === 502) {
      toast(`${f.name.trim()} is added as Invited, but the email didn’t send: ${r.error} Open them on Team and use Resend invite.`);
      await onChanged();
      onClose();
      return;
    }
    if (!r.ok) { setErr(r.error); return; }
    toast('Invite sent. They show as Invited until they set a password.', 'ok');
    await onChanged();
    onClose();
  }

  return (
    <Popup label="Invite someone" onClose={close} size="lg">
      <form className="contents" onSubmit={e => { e.preventDefault(); send(); }}>
        <div>
          <h3 className="text-[18px] font-semibold text-ink">Invite someone</h3>
          <p className="mt-0.5 text-[13px] text-ink-soft">They get an email to set their own password. Nothing works until they do.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name"><input value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} maxLength={120} autoComplete="off" className={FIELD} autoFocus /></Field>
          <Field label="Email"><input type="email" value={f.email} onChange={e => setF(s => ({ ...s, email: e.target.value }))} maxLength={200} autoComplete="off" className={FIELD} /></Field>
          <Field label="Phone, optional"><input type="tel" inputMode="tel" value={f.phone} onChange={e => setF(s => ({ ...s, phone: e.target.value }))} maxLength={30} autoComplete="off" className={FIELD} /></Field>
          <Field label="Role">
            <select value={f.roleId} onChange={e => setF(s => ({ ...s, roleId: e.target.value }))} className={FIELD}>
              {choices.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        </div>
        {preview && (
          <div>
            <p className="text-[12.5px] text-ink-muted mb-1.5">Welcome email they’ll get</p>
            <div className="border border-line rounded-[12px] overflow-hidden">
              <p className="px-3.5 py-2 text-[13px] text-ink-soft border-b border-line"><b className="font-semibold">Subject:</b> {preview.subject}</p>
              {/* The server's own email, drawn in a sandbox: no scripts, nothing it links to runs here. */}
              <iframe title="Welcome email preview" sandbox="" srcDoc={preview.html} className="block w-full h-[260px] bg-white" />
            </div>
          </div>
        )}
        {err && <p role="alert" className="text-[13px] text-bad">{err}</p>}
        <div className="flex items-center gap-3 border-t border-line pt-3">
          <button type="button" className={LINK} onClick={close}>Cancel</button>
          <span className="flex-1" />
          <button type="submit" className={PRIMARY} disabled={!ready || busy}>{busy ? 'Sending…' : 'Send invite'}</button>
        </div>
      </form>
    </Popup>
  );
}
