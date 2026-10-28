'use client';
// RES-1 (Cam 2026-10-19): "someone comes in and wants to get their resident
// card, they can then be inputted into the system by the staff". The list of
// residents; a golfer signed in with a listed email books at the resident rate,
// and the tee sheet can set residents on any group at the counter.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT, INPUT_COMPACT } from '@/components/ui/field';
import { LoadError } from '@/components/dashboard/LoadError';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { formatDate as fmtDate } from '@/lib/format';

type Resident = { id: string; name: string; email: string | null; cardNumber: string; expiresOn: string; notes: string; courseName?: string };
type Form = { name: string; email: string; cardNumber: string; expiresOn: string; notes: string };
const EMPTY: Form = { name: '', email: '', cardNumber: '', expiresOn: '', notes: '' };
const lbl = 'block text-[13px] font-semibold text-ink mb-1.5';

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ResidentsCard({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Resident[] | null>(null);
  const [hasRate, setHasRate] = useState(true);
  // GRP-1: one list for every course in the group.
  const [shared, setShared] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    const r = await dfetch<{ residents: Resident[]; hasResidentRate: boolean; shared?: boolean }>('/api/operator/residents');
    if (!r.ok) { setLoadError(r.error); return; }
    setRows(r.data.residents); setHasRate(r.data.hasResidentRate); setShared(!!r.data.shared);
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = todayYmd();
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(r => !q || [r.name, r.email ?? '', r.cardNumber].some(v => v.toLowerCase().includes(q)));
  }, [rows, search]);

  function open(r?: Resident) {
    setError('');
    setEditing(r ? r.id : 'new');
    setForm(r ? { name: r.name, email: r.email ?? '', cardNumber: r.cardNumber, expiresOn: r.expiresOn, notes: r.notes } : EMPTY);
  }

  async function save() {
    setSaving(true); setError('');
    const isNew = editing === 'new';
    const r = await dfetch<{ resident: Resident }>('/api/operator/residents', {
      method: isNew ? 'POST' : 'PATCH',
      body: JSON.stringify(isNew ? form : { ...form, id: editing }),
    });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    setRows(list => {
      const rest = (list ?? []).filter(x => x.id !== r.data.resident.id);
      return [...rest, r.data.resident].sort((a, b) => a.name.localeCompare(b.name));
    });
    setEditing(null);
    toast(isNew ? `${r.data.resident.name} added as a resident.` : 'Resident saved.', 'ok');
  }

  async function remove(r: Resident) {
    if (!confirm(`Remove ${r.name} from your residents? Their future online bookings will be at the public rate.`)) return;
    const res = await dfetch(`/api/operator/residents?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' });
    if (!res.ok) { toast(res.error); return; }
    setRows(list => (list ?? []).filter(x => x.id !== r.id));
    if (editing === r.id) setEditing(null);
    toast(`${r.name} removed.`, 'ok');
  }

  const formView = editing && (
    <div className="px-4 py-4 border-b border-line-soft bg-paper/70">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-ink">{editing === 'new' ? 'Add a resident' : 'Edit resident'}</h3>
        <button onClick={() => setEditing(null)} aria-label="Close" className="text-ink-muted hover:text-ink"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className={lbl} htmlFor="r-name">Full name</label>
          <input id="r-name" className={INPUT + ' w-full'} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" /></div>
        <div><label className={lbl} htmlFor="r-email">Email <span className="font-normal text-ink-muted">(so online bookings get the rate)</span></label>
          <input id="r-email" type="email" className={INPUT + ' w-full'} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@email.com" /></div>
        <div><label className={lbl} htmlFor="r-card">Resident card number <span className="font-normal text-ink-muted">(optional)</span></label>
          <input id="r-card" className={INPUT + ' w-full'} value={form.cardNumber} onChange={e => setForm(f => ({ ...f, cardNumber: e.target.value }))} /></div>
        <div><label className={lbl} htmlFor="r-exp">Card good until <span className="font-normal text-ink-muted">(blank = no end date)</span></label>
          <input id="r-exp" type="date" className={INPUT + ' w-full'} value={form.expiresOn} onChange={e => setForm(f => ({ ...f, expiresOn: e.target.value }))} /></div>
        <div className="sm:col-span-2"><label className={lbl} htmlFor="r-notes">Notes for your staff <span className="font-normal text-ink-muted">(optional)</span></label>
          <input id="r-notes" className={INPUT + ' w-full'} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Showed a utility bill, 12 Elm St" /></div>
      </div>
      {error && <div className="mt-3"><LoadError message={error} onRetry={save} /></div>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md text-[13px] text-ink-soft hover:text-ink">Cancel</button>
        <button onClick={save} disabled={saving || !form.name.trim()} className="px-4 py-2 rounded-md bg-pine hover:bg-pine-hover text-white text-[13px] font-medium disabled:opacity-50">
          {saving ? 'Saving…' : editing === 'new' ? 'Add resident' : 'Save'}
        </button>
      </div>
    </div>
  );

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0 max-w-[44em]">
          <h2 className="text-[17px] font-semibold text-ink">Residents</h2>
          <p className="text-[13px] text-ink-soft mt-1">
            Signed in with this email, they book themselves at the resident rate.
            {shared && ' This list is shared with every course in your group: a resident here gets the resident rate at all of them.'}
          </p>
        </div>
        {canEdit && editing !== 'new' && <button onClick={() => open()} className="shrink-0 bg-pine hover:bg-pine-hover text-white rounded-md text-[13px] font-medium px-4 py-2">Add a resident</button>}
      </div>
      {!hasRate && (
        <p className="mx-4 mb-3 text-[13px] text-ink bg-warn/5 border border-warn/20 rounded-md px-3 py-2">
          None of your schedules has a resident price yet, so residents pay the public rate. Add one in Schedule.
        </p>
      )}
      {loadError && <div className="px-4 pb-3"><LoadError message={loadError} onRetry={load} /></div>}
      {formView}
      {rows && rows.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-y border-line-soft">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a resident" aria-label="Find a resident" className={INPUT_COMPACT + ' !w-56'} />
          <span className="ml-auto text-[12.5px] text-ink-muted">{shown.length} of {rows.length}</span>
        </div>
      )}
      {rows === null && !loadError ? (
        <p className="px-4 py-6 text-[13.5px] text-ink-muted">Loading residents…</p>
      ) : rows && rows.length === 0 ? (
        <p className="px-4 pb-5 text-[13.5px] text-ink-soft">No residents yet.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {shown.map(r => {
            const expired = !!r.expiresOn && r.expiresOn < today;
            return (
              <li key={r.id} className="px-4 py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-center">
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-ink truncate">{r.name}</span>
                  <span className="block text-[12.5px] text-ink-muted truncate">{r.email || 'No email — counter only'}{r.cardNumber ? ` · card ${r.cardNumber}` : ''}{shared && r.courseName ? ` · added at ${r.courseName}` : ''}{r.notes ? ` · ${r.notes}` : ''}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ink">
                  <StatusDot status={expired ? 'bad' : 'ok'} />
                  {expired ? `Card expired ${fmtDate(r.expiresOn + 'T12:00:00')}` : r.expiresOn ? `Good until ${fmtDate(r.expiresOn + 'T12:00:00')}` : 'No end date'}
                </span>
                {canEdit && (
                  <span className="flex gap-3 col-span-2 sm:col-span-1 sm:justify-end">
                    <button onClick={() => open(r)} className="text-[13px] font-medium text-pine hover:underline">Edit</button>
                    <button onClick={() => remove(r)} className="text-[13px] font-medium text-bad hover:underline">Remove</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
