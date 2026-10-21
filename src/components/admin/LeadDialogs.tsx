'use client';
// AW-6c (Cam 2026-10-21: leads join the one pipeline): "Add a lead" and
// "Move to Talking", shared by the board and the inquiry page. Adding a lead
// emails nobody; moving it on needs an email, because everything in Talking
// (call invite, setup sheet) is sent to one.
import { useState } from 'react';
import Link from 'next/link';
import { Modal, ModalActions } from '@/components/ui/Modal';
import { INPUT } from '@/components/ui/field';
import { INQUIRY_SOURCES } from '@/lib/inquiry-status';

const iCls = `${INPUT} w-full`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function post(body: Record<string, unknown>, method: 'POST' | 'PATCH' = 'POST') {
  const r = await fetch('/api/admin/inquiries', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d: d as Record<string, unknown> };
}

export function AddLeadDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ courseName: '', contactName: '', contactTitle: '', phone: '', email: '', city: '', state: '', website: '', source: 'Cold outreach', notes: '' });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [dupe, setDupe] = useState<{ id: string; stage: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { setF(s => ({ ...s, [k]: e.target.value })); setDupe(null); };
  const emailBad = !!f.email.trim() && !EMAIL_RE.test(f.email.trim());

  async function save(force = false) {
    setWorking(true); setError('');
    try {
      const { ok, status, d } = await post({ action: 'create_lead', ...f, force });
      if (ok) { onAdded(); return; }
      if (status === 409 && d.error === 'duplicate') { setDupe({ id: String(d.id), stage: String(d.stage) }); return; }
      setError(String(d.error || `Couldn’t add it (${status}).`));
    } catch {
      setError('Network error — nothing was saved.');
    } finally {
      setWorking(false);
    }
  }

  const field = (label: string, k: keyof typeof f, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="block text-[13px] font-semibold text-ink mb-1">{label}</span>
      <input value={f[k]} onChange={set(k)} className={iCls} {...props} />
    </label>
  );

  return (
    <Modal title="Add a lead" size="lg" onClose={onClose}>
      <p className="text-sm text-ink-soft mb-4">A course you found. Nobody is emailed. It sits in Leads until you move it to Talking.</p>
      <div className="space-y-3">
        {field('Course name', 'courseName', { autoFocus: true, required: true })}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('Contact', 'contactName', { placeholder: 'Name' })}
          {field('Their title', 'contactTitle', { placeholder: 'GM, owner…' })}
          {field('Phone', 'phone', { type: 'tel' })}
          {field('Email', 'email', { type: 'email' })}
          {field('City', 'city')}
          {field('State', 'state')}
        </div>
        {field('Website', 'website')}
        <label className="block">
          <span className="block text-[13px] font-semibold text-ink mb-1">Where it came from</span>
          <select value={f.source} onChange={set('source')} className={iCls}>
            {INQUIRY_SOURCES.filter(s => s !== 'Inbound form' && s !== 'Demo booking').map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[13px] font-semibold text-ink mb-1">Notes</span>
          <textarea value={f.notes} onChange={set('notes')} rows={3} className={iCls} placeholder="Who you talked to, what they use now, when to call…" />
        </label>
      </div>
      {emailBad && <p className="mt-2 text-[12px] text-bad">That email doesn’t look right.</p>}
      {dupe && (
        <div className="mt-3 bg-warn/5 border border-warn/20 rounded-md px-3 py-2.5 text-[13px] text-ink">
          {f.courseName} is already on the board ({dupe.stage}). <Link href={`/admin/inquiries/${dupe.id}`} className="font-medium text-pine hover:underline">Open it</Link>
          {' '}or <button type="button" onClick={() => save(true)} disabled={working} className="font-medium text-pine hover:underline">add it anyway</button>.
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
      <ModalActions working={working} onCancel={onClose} onConfirm={() => save(false)} confirmLabel="Add the lead" disabled={!f.courseName.trim() || emailBad || !!dupe} />
    </Modal>
  );
}

export function MoveToTalkingDialog({ lead, onClose, onMoved }: {
  lead: { id: string; courseName: string; email: string };
  onClose: () => void;
  onMoved: () => void;
}) {
  const [email, setEmail] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const needsEmail = !lead.email;
  const emailOk = !needsEmail || EMAIL_RE.test(email.trim());

  async function move() {
    setWorking(true); setError('');
    try {
      const { ok, status, d } = await post({ id: lead.id, action: 'start_talking', ...(needsEmail ? { email: email.trim() } : {}) }, 'PATCH');
      if (ok) { onMoved(); return; }
      setError(String(d.error || `Couldn’t move it (${status}).`));
    } catch {
      setError('Network error — it is still a lead.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal title={`Move ${lead.courseName} to Talking?`} onClose={onClose}>
      <p className="text-sm text-ink-soft">
        It becomes an inquiry in review: you can book the call, send the setup sheet and build from there. Nothing is emailed yet.
      </p>
      {needsEmail && (
        <label className="block mt-3">
          <span className="block text-[13px] font-semibold text-ink mb-1">Their email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus className={iCls} />
          <span className="block text-[12px] text-ink-muted mt-1">Needed — the call invite and setup sheet go to it.</span>
        </label>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
      <ModalActions working={working} onCancel={onClose} onConfirm={move} confirmLabel="Move to Talking" disabled={!emailOk} />
    </Modal>
  );
}
