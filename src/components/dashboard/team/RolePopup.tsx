'use client';
// TEAM-1: a role (the mockup's role popup), new, from Suggested roles, or an existing one. Its name and what the role
// can do. A role edit changes everyone in it, so before Save the popup says how many people that is
// (Cam's review note). Roles have a name only, no description (Cam, via Build 2026-11-17: "get rid of this"). Owner is shown read only. A role with people in it can't be deleted until they have another.
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { Popup, FIELD } from '@/components/dashboard/settings/ui';
import { ALL_KEYS, normalizePermissions, type PermissionKey } from '@/lib/staff-permissions';
import { type Role, type Suggested, PermList, sameKeys, plural, Field, LINK, LINK_BAD, PRIMARY } from './shared';

export function RolePopup({ role, suggested, onClose, onChanged }: {
  /** An existing role; leave out for a new one. */
  role?: Role; suggested?: Suggested; onClose: () => void; onChanged: () => Promise<void> | void;
}) {
  const [name, setName] = useState(role?.name ?? suggested?.name ?? '');
  const [keys, setKeys] = useState<PermissionKey[]>(normalizePermissions(role?.permissions ?? suggested?.permissions ?? []));
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [err, setErr] = useState('');

  if (role?.owner) {
    return (
      <Popup label="Owner" onClose={onClose} size="lg">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-[18px] font-semibold text-ink">{role.name}</h3><p className="mt-0.5 text-[13px] text-ink-soft">Can do everything, including staff, Stripe and the cancellation policy. This role can’t be changed or deleted.</p></div>
          <button type="button" className={LINK} onClick={onClose}>Close</button>
        </div>
        <PermList value={ALL_KEYS} readOnly />
      </Popup>
    );
  }

  const dirty = !role || name.trim() !== role.name || !sameKeys(keys, role.permissions);
  const affects = role?.people ?? 0;
  function close() {
    if (role && dirty && !confirm(`Discard the unsaved changes to ${role.name}?`)) return;
    if (!role && name.trim() && !confirm('Discard this new role?')) return;
    onClose();
  }

  async function save() {
    if (!name.trim()) { setErr('Give the role a name.'); return; }
    setBusy('save'); setErr('');
    const body = { name: name.trim(), permissions: keys };
    const r = role
      ? await dfetch('/api/operator/team/roles', { method: 'PATCH', body: JSON.stringify({ id: role.id, ...body }) })
      : await dfetch('/api/operator/team/roles', { method: 'POST', body: JSON.stringify({ ...body, ...(suggested ? { fromSuggested: suggested.key } : {}) }) });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    toast(role ? (affects ? `Role saved. ${plural(affects, 'person', 'people')} updated.` : 'Role saved.') : 'Role added.', 'ok');
    await onChanged();
    onClose();
  }
  async function remove() {
    if (!role || !confirm(`Delete the ${role.name} role?`)) return;
    setBusy('delete'); setErr('');
    const r = await dfetch('/api/operator/team/roles', { method: 'DELETE', body: JSON.stringify({ id: role.id }) });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return; }
    toast(`${role.name} deleted.`, 'ok');
    await onChanged();
    onClose();
  }

  return (
    <Popup label={role ? role.name : suggested ? `Add ${suggested.name}` : 'New role'} onClose={close} size="lg">
      <form className="contents" onSubmit={e => { e.preventDefault(); if (!busy && dirty) save(); }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-semibold text-ink">{role ? role.name : suggested ? `Add ${suggested.name}` : 'New role'}</h3>
            <p className="mt-0.5 text-[13px] text-ink-soft">{role ? 'Changes apply to everyone with this role.' : 'Pick what this role can do. You can change it any time.'}</p>
          </div>
          <button type="button" className={LINK} onClick={close}>Close</button>
        </div>
        <div className="sm:max-w-[50%]">
          <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} maxLength={40} className={FIELD} autoFocus={!role} /></Field>
        </div>
        <div>
          <p className="text-[12.5px] text-ink-muted mt-1 mb-1">What this role can do</p>
          <PermList value={keys} onChange={setKeys} />
        </div>
        {err && <p role="alert" className="text-[13px] text-bad">{err}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          {role && (affects
            ? <span className="text-[12.5px] text-ink-muted">To delete it, give its people another role first.</span>
            : <button type="button" className={LINK_BAD} disabled={!!busy} onClick={remove}>{busy === 'delete' ? 'Deleting…' : 'Delete role'}</button>)}
          <span className="flex-1" />
          {role && dirty && affects > 0 && <span className="w-full sm:w-auto text-[13px] font-medium text-ink">Saving changes access for {plural(affects, 'person', 'people')}.</span>}
          <button type="button" className={LINK} onClick={close}>Cancel</button>
          <button type="submit" className={PRIMARY} disabled={!!busy || !dirty}>{busy === 'save' ? 'Saving…' : role ? 'Save role' : 'Add role'}</button>
        </div>
      </form>
    </Popup>
  );
}
