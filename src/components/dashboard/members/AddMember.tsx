'use client';
// Add a member, from a membership's page (Cam 2026-11-16, members-mockup): name, email and phone. The mockup's
// photo, automatic member number and payment first (card reader, cash, or a typed card) come with the Memberships
// data PRs (payment and register; numbers and photos) — until then this adds them the way Members always did:
// an invite emailed, dues taken afterwards from their card (Paid at the shop or Email dues link).
import { useState } from 'react';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { INPUT } from '@/components/ui/field';
import { type Tier, Popup, Label, Hint, LINK, PRIMARY, addMonthsISO, dollars } from './shared';

export function AddMember({ tier, onClose, onAdded }: { tier: Tier; onClose: () => void; onAdded: () => Promise<void> | void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const total = tier.annualFee + tier.initiationFee;
  const add = async () => {
    setSaving(true); setError('');
    const r = await dfetch('/api/operator/members', { method: 'POST', body: JSON.stringify({ ...form, tierId: tier.id, notes: '', expiresAt: addMonthsISO(tier.termMonths || 12) }) });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    toast(`${form.name || form.email} added to ${tier.name}.`, 'ok');
    await onAdded(); onClose();
  };
  return (
    <Popup label="Add a member" onClose={onClose}>
      <div><h3 className="text-[18px] font-semibold">Add a member</h3>
        <p className="text-[12px] text-ink-muted mt-1">{tier.name}{total > 0 ? ` · ${dollars(total)}${tier.initiationFee > 0 ? ` (includes ${dollars(tier.initiationFee)} to join)` : tier.termMonths === 12 ? ' a year' : ''}` : ''}</p></div>
      <div className="flex flex-col gap-2.5">
        <div><Label htmlFor="am-name">Full name</Label><input id="am-name" autoFocus className={INPUT + ' w-full'} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <div><Label htmlFor="am-email">Email</Label><input id="am-email" type="email" className={INPUT + ' w-full'} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div><Label htmlFor="am-phone">Phone (optional)</Label><input id="am-phone" type="tel" className={INPUT + ' w-full'} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
      </div>
      {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
      <div className="flex items-center gap-2.5 border-t border-line pt-3">
        <button type="button" className={LINK} onClick={onClose}>Cancel</button><span className="flex-1" />
        <button type="button" className={PRIMARY} disabled={saving || !form.email.trim()} onClick={add}>{saving ? 'Adding…' : 'Add member'}</button>
      </div>
      <Hint>We email them an invite so they get member rates online.{total > 0 ? ' Take their dues from their card once they’re added.' : ''}</Hint>
    </Popup>
  );
}
