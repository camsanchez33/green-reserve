'use client';
// SP-A (STAFF_POLICY_SPEC A6): Settings → Staff & permissions. The course owner
// adds staff, picks a preset, and turns individual permissions on or off per
// person. The catalog, presets and dependencies come from lib/staff-permissions
// — the same file the server enforces with — so a toggle here can never mean a
// different rule than the route applies.
import { useCallback, useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { StatusDot } from '@/components/ui/StatusDot';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { INPUT } from '@/components/ui/field';
import { formatDateTime } from '@/lib/format';
import {
  PERMISSIONS, PRESETS, normalizePermissions, withoutPermission, presetFor,
  type PermissionKey, type PermissionDef,
} from '@/lib/staff-permissions';

interface StaffRow {
  id: string; name: string; email: string; active: boolean; createdAt: string;
  permissions: PermissionKey[];
  preset: string;
  lastChange: { at: string; by: string } | null;
}

const PRESET_LABEL: Record<string, string> = {
  starter: 'Starter', front_desk: 'Front desk', manager: 'Manager', custom: 'Custom',
  legacy: 'Original staff access',
};
const GROUPS = ['Tee sheet', 'Money', 'Members', 'Schedule', 'Course'] as const;

export function StaffPermissions({ onCount }: { onCount?: (n: number) => void }) {
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PermissionKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', preset: 'front_desk' });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [created, setCreated] = useState<{ name: string; tempPassword: string } | null>(null);
  const [showPass, setShowPass] = useState(false);

  const load = useCallback(async () => {
    const r = await dfetch<StaffRow[]>('/api/operator/staff');
    if (!r.ok) { setLoadError(r.error); return; }
    setStaff(Array.isArray(r.data) ? r.data : []);
    setLoadError('');
    onCount?.(Array.isArray(r.data) ? r.data.length : 0);
  }, [onCount]);
  useEffect(() => { load(); }, [load]);

  const open = staff?.find(s => s.id === openId) ?? null;
  const dirty = !!open && open.permissions.join(',') !== normalizePermissions(draft).join(',');

  function openPerson(s: StaffRow) {
    if (dirty && !confirm('Discard the unsaved changes to ' + (open?.name ?? 'this person') + '?')) return;
    setOpenId(openId === s.id ? null : s.id);
    setDraft(s.permissions);
    setSaveError('');
  }

  function toggle(def: PermissionDef, on: boolean) {
    setDraft(d => on ? normalizePermissions([...d, def.key]) : withoutPermission(d, def.key));
  }

  async function save() {
    if (!open) return;
    setSaving(true); setSaveError('');
    const r = await dfetch<{ permissions: PermissionKey[] }>('/api/operator/staff', { method: 'PATCH', body: JSON.stringify({ id: open.id, permissions: draft }) });
    setSaving(false);
    if (!r.ok) { setSaveError(r.error); return; }
    toast(`Saved — ${open.name}'s permissions apply from their next click.`, 'ok');
    await load();
  }

  async function setActive(s: StaffRow, active: boolean) {
    setBusyId(s.id);
    const r = await dfetch('/api/operator/staff', { method: 'PATCH', body: JSON.stringify({ id: s.id, active }) });
    setBusyId(null);
    if (!r.ok) { toast(r.error); return; }
    toast(active ? `${s.name} can sign in again.` : `${s.name} is disabled — their login stops working now.`, 'ok');
    await load();
  }

  async function remove(s: StaffRow) {
    if (!confirm(`Remove ${s.name}? Their login stops working now. This can't be undone — to pause them instead, use Disable.`)) return;
    setBusyId(s.id);
    const r = await dfetch('/api/operator/staff', { method: 'DELETE', body: JSON.stringify({ id: s.id }) });
    setBusyId(null);
    if (!r.ok) { toast(r.error); return; }
    if (openId === s.id) setOpenId(null);
    toast(`${s.name} removed.`, 'ok');
    await load();
  }

  async function add() {
    if (!newStaff.name.trim() || !newStaff.email.trim() || adding) return;
    setAdding(true); setAddError('');
    const r = await dfetch<{ tempPassword: string }>('/api/operator/staff', { method: 'POST', body: JSON.stringify(newStaff) });
    setAdding(false);
    if (!r.ok) { setAddError(r.error); return; }
    setCreated({ name: newStaff.name.trim(), tempPassword: r.data.tempPassword });
    setNewStaff({ name: '', email: '', preset: 'front_desk' });
    await load();
  }

  const draftPreset = presetFor(draft);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13.5px] text-ink-soft">Each person gets their own login. Pick a starting point, then turn individual permissions on or off. Staff, Stripe, your agreement and your cancellation policy always stay with your login.</p>
      </div>

      {loadError && (
        <div className="bg-bad/5 border border-bad/20 text-bad rounded-md px-4 py-3 text-[13.5px]">
          Couldn&apos;t load your staff ({loadError}). <button onClick={load} className="underline font-medium">Retry</button>
        </div>
      )}

      {created && (
        <div className="bg-ok/5 border border-ok/20 rounded-md p-4">
          <div className="font-medium text-ok mb-2">{created.name} added — share this temporary password with them:</div>
          <div className="flex items-center justify-between bg-paper rounded-md px-3 py-2 border border-line mb-2">
            <span className="text-sm font-mono text-ink">{showPass ? created.tempPassword : '••••••••••••'}</span>
            <div className="flex gap-2">
              <button onClick={() => setShowPass(v => !v)} aria-label={showPass ? 'Hide password' : 'Show password'} className="text-ink-muted hover:text-ink">{showPass ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}</button>
              <button onClick={() => navigator.clipboard.writeText(created.tempPassword).then(() => toast('Copied.', 'ok'), () => toast('Couldn’t copy — select it by hand.'))} aria-label="Copy password" className="text-ink-muted hover:text-ink"><Copy className="w-4 h-4"/></button>
            </div>
          </div>
          <button onClick={() => setCreated(null)} className="text-xs text-pine underline">Done</button>
        </div>
      )}

      {staff === null && !loadError && <p className="text-[13.5px] text-ink-soft">Loading…</p>}
      {staff && staff.length === 0 && <p className="text-[13.5px] text-ink-soft">No staff yet — add your first person below.</p>}

      {staff && staff.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {staff.map(s => {
            const isOpen = s.id === openId;
            return (
              <li key={s.id} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-pine/10 rounded-full flex items-center justify-center text-pine font-medium text-sm shrink-0">{s.name[0]?.toUpperCase()}</div>
                  <button onClick={() => openPerson(s)} className="flex-1 min-w-0 text-left" aria-expanded={isOpen}>
                    <div className="font-medium text-ink text-[13.5px] flex items-center gap-2">{s.name}{isOpen ? <ChevronUp className="w-3.5 h-3.5 text-ink-muted"/> : <ChevronDown className="w-3.5 h-3.5 text-ink-muted"/>}</div>
                    <div className="text-[12.5px] text-ink-muted truncate">{s.email} · {PRESET_LABEL[s.preset] ?? 'Custom'} · {s.permissions.length - 1} permission{s.permissions.length - 1 === 1 ? '' : 's'}</div>
                  </button>
                  <StatusDot status={s.active ? 'ok' : 'neutral'} label={s.active ? 'Active' : 'Disabled'} />
                  <button onClick={() => setActive(s, !s.active)} disabled={busyId === s.id} className="text-[12.5px] text-pine hover:underline disabled:opacity-50">{busyId === s.id ? '…' : s.active ? 'Disable' : 'Enable'}</button>
                  <button onClick={() => remove(s)} disabled={busyId === s.id} aria-label={`Remove ${s.name}`} className="text-ink-faint hover:text-bad transition-colors disabled:opacity-50"><Trash2 className="w-4 h-4"/></button>
                </div>

                {isOpen && (
                  <div className="mt-3 sm:ml-11 bg-paper/70 rounded-md p-4 space-y-4">
                    <div>
                      <Eyebrow className="mb-2">Start from</Eyebrow>
                      <div className="flex flex-wrap gap-2">
                        {PRESETS.map(p => (
                          <button key={p.key} onClick={() => setDraft(normalizePermissions(p.keys))} title={p.help}
                            className={'px-3 py-1.5 rounded-md text-[12.5px] font-medium border transition-colors ' + (draftPreset === p.key ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-line hover:border-line-strong hover:text-ink')}>
                            {p.label}
                          </button>
                        ))}
                        {draftPreset === 'custom' && <span className="px-3 py-1.5 text-[12.5px] text-ink-muted">Custom</span>}
                      </div>
                    </div>

                    {GROUPS.map(g => (
                      <div key={g}>
                        <Eyebrow className="mb-1.5">{g}</Eyebrow>
                        <ul className="divide-y divide-line bg-white rounded-md shadow-card">
                          {PERMISSIONS.filter(p => p.group === g).map(p => {
                            const on = draft.includes(p.key);
                            return (
                              <li key={p.key}>
                                <label className={'flex items-start gap-3 px-3 py-2.5 ' + (p.locked ? 'cursor-default' : 'cursor-pointer')}>
                                  <input type="checkbox" checked={on} disabled={p.locked} onChange={e => toggle(p, e.target.checked)} className="mt-0.5 accent-pine"/>
                                  <span className="flex-1 min-w-0">
                                    <span className="text-[13.5px] text-ink font-medium flex items-center gap-2 flex-wrap">
                                      {p.label}
                                      {p.locked && <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted font-normal">Always on</span>}
                                      {p.movesMoney && <span className="text-[11px] text-warn font-normal">Moves money</span>}
                                    </span>
                                    <span className="block text-[12.5px] text-ink-muted">{p.help}{p.requires?.length ? ` Turns on ${p.requires.map(r => `“${PERMISSIONS.find(x => x.key === r)?.label}”`).join(', ')} too.` : ''}</span>
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}

                    {saveError && <p className="text-[13px] text-bad">{saveError}</p>}
                    <div className="flex flex-wrap items-center gap-3">
                      <button onClick={save} disabled={!dirty || saving} className="bg-pine hover:bg-pine-hover text-white px-4 py-2 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving…' : dirty ? 'Save permissions' : 'Saved'}</button>
                      {dirty && <button onClick={() => setDraft(s.permissions)} disabled={saving} className="text-[12.5px] text-ink-soft hover:text-ink">Discard changes</button>}
                      <span className="text-[12px] text-ink-muted ml-auto">
                        {s.lastChange ? `Last changed by ${s.lastChange.by}, ${formatDateTime(s.lastChange.at)}` : s.preset === 'legacy' ? 'Added before per-person permissions — keeps what staff could always do, without weather cancel or waiving fees.' : ''}
                      </span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="bg-paper/70 rounded-md p-4">
        <div className="font-medium text-ink text-[13.5px] mb-3 flex items-center gap-2">Add a staff member</div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <label className="block"><Eyebrow as="span" className="block mb-1.5">Name</Eyebrow>
            <input value={newStaff.name} onChange={e => setNewStaff(s => ({ ...s, name: e.target.value }))} placeholder="First Last" className={`${INPUT} w-full`}/></label>
          <label className="block"><Eyebrow as="span" className="block mb-1.5">Email</Eyebrow>
            <input type="email" value={newStaff.email} onChange={e => setNewStaff(s => ({ ...s, email: e.target.value }))} className={`${INPUT} w-full`}/></label>
        </div>
        <Eyebrow className="mb-1.5">Starts as</Eyebrow>
        <div className="grid sm:grid-cols-3 gap-2 mb-3">
          {PRESETS.map(p => (
            <label key={p.key} className={'flex items-start gap-2 px-3 py-2 rounded-md border cursor-pointer bg-white ' + (newStaff.preset === p.key ? 'border-pine/40' : 'border-line')}>
              <input type="radio" name="new-staff-preset" checked={newStaff.preset === p.key} onChange={() => setNewStaff(s => ({ ...s, preset: p.key }))} className="mt-0.5 accent-pine"/>
              <span><span className="block text-[13px] font-medium text-ink">{p.label}</span><span className="block text-[12px] text-ink-muted">{p.help}</span></span>
            </label>
          ))}
        </div>
        <p className="text-[12px] text-ink-soft mb-3">You can fine-tune their permissions after adding them.</p>
        {addError && <p className="text-[13px] text-bad mb-2">{addError}</p>}
        <button onClick={add} disabled={adding || !newStaff.name.trim() || !newStaff.email.trim()}
          className="w-full bg-pine hover:bg-pine-hover text-white py-2.5 rounded-md text-[12.5px] font-medium disabled:opacity-50 transition-colors">
          {adding ? 'Adding…' : 'Add staff member'}
        </button>
      </div>
    </div>
  );
}
