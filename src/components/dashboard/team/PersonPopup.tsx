'use client';
// TEAM-1: one person (the mockup's person popup). Their email, phone and role; what they can do, starting from their
// role, switched on or off for just them; and the plain actions: resend the invite or send a password reset link,
// disable or turn sign-in back on, remove. Everything the old Settings → Staff screen did is here: per-person
// switches with the catalog's needs, disable and enable, remove (asks first), and who changed it last.
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { Popup, FIELD } from '@/components/dashboard/settings/ui';
import { formatDateTime } from '@/lib/format';
import type { PermissionKey } from '@/lib/staff-permissions';
import { type Person, type Role, type Owner, type Area, AccessEditor, StatusMark, statusWord, personLine, sameKeys, Field, LINK, LINK_BAD, PRIMARY } from './shared';

export function OwnerPopup({ owner, onClose }: { owner: Owner; onClose: () => void }) {
  return (
    <Popup label={owner.name} onClose={onClose} size="md">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-[18px] font-semibold text-ink">{owner.name}</h3><p className="mt-0.5 text-[13px] text-ink-soft">Owner · you</p></div>
        <button type="button" className={LINK} onClick={onClose}>Close</button>
      </div>
      <p className="text-[13px] text-ink-soft">The owner can do everything and can’t be changed here. Your password and two-step sign-in are in{' '}
        <a href="/dashboard/settings?area=account" className={LINK}>Settings → Your account</a>.</p>
    </Popup>
  );
}

export function PersonPopup({ person, roles, areas, onClose, onChanged }: {
  person: Person; roles: Role[]; areas?: Area[]; onClose: () => void; onChanged: () => Promise<void> | void;
}) {
  const p = person;
  const [roleId, setRoleId] = useState(p.roleId ?? '');
  const [draft, setDraft] = useState<PermissionKey[]>(p.permissions);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [removing, setRemoving] = useState(false);
  const role = roles.find(r => r.id === roleId) ?? null;
  const first = p.name.split(' ')[0] || p.name;
  const roleChanged = roleId !== (p.roleId ?? '');
  const dirty = roleChanged || !sameKeys(draft, p.permissions);
  const choices = roles.filter(r => !r.owner);

  function pickRole(id: string) {
    setRoleId(id);
    // A new role means starting from that role; their own changes go with the old one.
    const r = roles.find(x => x.id === id);
    if (r) setDraft(r.permissions);
  }
  function close() {
    if (dirty && !confirm(`Discard the unsaved changes to ${p.name}?`)) return;
    onClose();
  }

  async function act(key: string, run: () => Promise<{ ok: boolean; error?: string }>, done: string, closeAfter = false) {
    setBusy(key); setErr('');
    const r = await run();
    setBusy(null);
    if (!r.ok) { setErr(r.error ?? 'That didn’t go through.'); return; }
    toast(done, 'ok');
    await onChanged();
    if (closeAfter) onClose();
  }
  const save = () => act('save', () => dfetch('/api/operator/staff', { method: 'PATCH', body: JSON.stringify({ id: p.id, ...(roleChanged ? { roleId } : {}), permissions: draft }) }),
    `Saved. ${first}’s access applies from their next click.`, true);
  const setActive = (active: boolean) => act('active', () => dfetch('/api/operator/staff', { method: 'PATCH', body: JSON.stringify({ id: p.id, active }) }),
    active ? `${p.name} can sign in again.` : `${p.name} is disabled. Their sign-in stops now.`, true);
  const remove = () => {
    act('remove', () => dfetch('/api/operator/staff', { method: 'DELETE', body: JSON.stringify({ id: p.id }) }), `${p.name} is removed.`, true);
  };
  const resend = () => act('resend', () => dfetch('/api/operator/staff/invite/resend', { method: 'POST', body: JSON.stringify({ id: p.id }) }), `Invite sent again to ${p.email}.`);
  const reset = () => act('reset', () => dfetch('/api/operator/staff/reset-link', { method: 'POST', body: JSON.stringify({ id: p.id }) }), `Reset link sent to ${p.email}.`);

  const line = personLine(p);
  const extraNote = p.added.length || p.removed.length
    ? ` ${[p.added.length ? `${p.added.length} more than ${role?.name ?? 'the role'}` : '', p.removed.length ? `${p.removed.length} fewer` : ''].filter(Boolean).join(', ')}.`
    : '';

  return (
    <Popup label={p.name} onClose={close} size="lg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[18px] font-semibold text-ink">{p.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-soft"><StatusMark status={p.status} />{p.status === 'active' ? (line ? `Active · ${line}` : 'Active') : line || statusWord(p.status)}</p>
        </div>
        <button type="button" className={LINK} onClick={close}>Close</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border border-line rounded-[12px] px-3 py-2.5">
        <div className="flex flex-col gap-0.5 min-w-0"><span className="text-[12.5px] text-ink-muted">Email</span><b className="text-[13.5px] font-medium text-ink [overflow-wrap:anywhere]">{p.email}</b></div>
        {p.phone && <div className="flex flex-col gap-0.5 min-w-0"><span className="text-[12.5px] text-ink-muted">Phone</span><b className="text-[13.5px] font-medium text-ink">{p.phone}</b></div>}
        <Field label="Role">
          <select value={roleId} onChange={e => pickRole(e.target.value)} className={FIELD} aria-label="Role">
            {!roleId && <option value="">No role yet</option>}
            {choices.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
      </div>

      <div>
        <p className="text-[12.5px] text-ink-muted mt-1">What {first} can do</p>
        <p className="text-[13px] text-ink-soft mt-0.5 mb-1">
          {role ? `Starts from ${role.name}. Change any area for just this person.` : 'Change any area for this person.'}
          {!roleChanged && extraNote}
          {roleChanged && role && ` Their own changes are cleared, so they get exactly what ${role.name} gets.`}
          {p.legacy && !roleChanged && ' Added before per-person access: keeps what staff could always do, without weather cancel or waiving fees.'}
        </p>
        <AccessEditor areas={areas} value={draft} onChange={setDraft} />
      </div>

      {removing ? (
        <div role="alertdialog" aria-label={`Remove ${p.name}?`} className="border-t border-line pt-3 flex flex-col gap-2">
          <b className="text-[14px] font-semibold text-ink">Remove {p.name}?</b>
          <p className="text-[13px] text-ink-soft">This can’t be undone. To pause them instead, use Disable.</p>
          <div className="flex items-center gap-3">
            <button type="button" className={LINK} autoFocus onClick={() => setRemoving(false)}>Cancel</button>
            <span className="flex-1" />
            <button type="button" disabled={!!busy} onClick={remove} className="bg-bad text-white rounded-[10px] text-[13px] font-semibold px-3.5 py-[9px] min-h-[40px] disabled:opacity-40">{busy === 'remove' ? 'Removing…' : 'Remove'}</button>
          </div>
        </div>
      ) : (
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3">
        {p.status === 'invited'
          ? <button type="button" className={LINK} disabled={!!busy} onClick={resend}>{busy === 'resend' ? 'Sending…' : 'Resend invite'}</button>
          : <button type="button" className={LINK} disabled={!!busy} onClick={reset}>{busy === 'reset' ? 'Sending…' : 'Send password reset link'}</button>}
        {p.status === 'disabled'
          ? <button type="button" className={LINK} disabled={!!busy} onClick={() => setActive(true)}>Turn sign-in back on</button>
          : <button type="button" className={LINK_BAD} disabled={!!busy} onClick={() => setActive(false)}>Disable</button>}
        <button type="button" className={LINK_BAD} disabled={!!busy} onClick={() => setRemoving(true)}>Remove</button>
      </div>
      )}

      {err && <p role="alert" className="text-[13px] text-bad">{err}</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        {p.lastChange && <span className="text-[12.5px] text-ink-muted">Last changed by {p.lastChange.by}, {formatDateTime(p.lastChange.at)}</span>}
        <span className="flex-1" />
        <button type="button" className={LINK} onClick={close}>Cancel</button>
        <button type="button" className={PRIMARY} disabled={!dirty || !!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
      </div>
    </Popup>
  );
}
