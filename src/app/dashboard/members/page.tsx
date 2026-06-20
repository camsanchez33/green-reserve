'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Users, Edit2, Check, X,
  RefreshCw, UserCheck, UserX, ChevronDown, AlertCircle,
} from 'lucide-react';
import OperatorSidebar from '@/components/OperatorSidebar';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Tier {
  id: string;
  name: string;
  color: string;
  greenFeeWeekday: number | null;
  greenFeeWeekend: number | null;
  cartFeeWeekday: number | null;
  cartFeeWeekend: number | null;
  discountPct: number | null;
  advanceBookingDays: number;
  guestPassesPerYear: number;
  annualFee: number;
  notes: string;
  active: boolean;
  _count?: { memberships: number };
}

interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  tierId: string | null;
  tierName: string;
  tierColor: string;
  status: string;
  linked: boolean;
  inviteAccepted: boolean;
  expiresAt: string | null;
  notes: string;
  createdAt: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
const TIER_COLORS = ['#1b4332','#1d4ed8','#7c3aed','#b45309','#be123c','#0f766e','#374151'];
const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white';
const fmtMoney = (n: number | null) => n == null ? '—' : `$${n.toFixed(2)}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const emptyTier = (): Partial<Tier> => ({
  name: '', color: '#1b4332',
  greenFeeWeekday: null, greenFeeWeekend: null,
  cartFeeWeekday: null, cartFeeWeekend: null,
  discountPct: null,
  advanceBookingDays: 14, guestPassesPerYear: 0, annualFee: 0, notes: '',
});

/* ─── Pricing mode toggle ─────────────────────────────────────────────── */
type PricingMode = 'flat' | 'pct';

/* ─── Main ────────────────────────────────────────────────────────────── */
export default function MembersPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<'tiers' | 'members'>('tiers');
  const [courseName, setCourseName] = useState('');

  // Tier form
  const [tierForm, setTierForm] = useState<Partial<Tier>>(emptyTier());
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<PricingMode>('flat');
  const [tierSaving, setTierSaving] = useState(false);
  const [tierError, setTierError] = useState('');

  // Member form
  const [addOpen, setAddOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ email: '', name: '', phone: '', tierId: '', notes: '', expiresAt: '' });
  const [memberSaving, setMemberSaving] = useState(false);
  const [memberError, setMemberError] = useState('');

  // Edit member tier inline
  const [editMemberId, setEditMemberId] = useState<string | null>(null);
  const [editMemberTierId, setEditMemberTierId] = useState('');

  const [filterTier, setFilterTier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [tr, mb] = await Promise.all([
      fetch('/api/operator/tiers').then(r => r.ok ? r.json() : []),
      fetch('/api/operator/members').then(r => r.ok ? r.json() : []),
    ]);
    setTiers(tr); setMembers(mb); setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { fetch('/api/operator/courses').then(r => r.json()).then(c => { if (c?.name) setCourseName(c.name); }); }, []);

  /* ── Tier CRUD ── */
  const startEditTier = (t: Tier) => {
    setEditingTier(t.id);
    setTierForm({ ...t });
    setPricingMode(t.discountPct != null ? 'pct' : 'flat');
    setTierError('');
  };

  const saveTier = async () => {
    setTierSaving(true); setTierError('');
    const payload = {
      ...tierForm,
      // Clear the unused pricing mode's fields
      ...(pricingMode === 'pct'
        ? { greenFeeWeekday: null, greenFeeWeekend: null, cartFeeWeekday: null, cartFeeWeekend: null }
        : { discountPct: null }
      ),
    };
    const method = editingTier ? 'PATCH' : 'POST';
    const body   = editingTier ? { ...payload, id: editingTier } : payload;
    const r = await fetch('/api/operator/tiers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (r.ok) {
      await loadAll();
      setTierForm(emptyTier()); setEditingTier(null);
    } else {
      setTierError(d.error || 'Save failed');
    }
    setTierSaving(false);
  };

  const deleteTier = async (id: string) => {
    const r = await fetch(`/api/operator/tiers?id=${id}`, { method: 'DELETE' });
    const d = await r.json();
    if (r.ok) { setTiers(prev => prev.filter(t => t.id !== id)); }
    else alert(d.error);
  };

  const cancelTierEdit = () => { setTierForm(emptyTier()); setEditingTier(null); setTierError(''); };

  /* ── Member CRUD ── */
  const addMember = async () => {
    setMemberSaving(true); setMemberError('');
    const r = await fetch('/api/operator/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memberForm) });
    const d = await r.json();
    if (r.ok) {
      await loadAll();
      setMemberForm({ email: '', name: '', phone: '', tierId: '', notes: '', expiresAt: '' });
      setAddOpen(false);
    } else {
      setMemberError(d.error || 'Failed to add member');
    }
    setMemberSaving(false);
  };

  const updateMemberTier = async (memberId: string, tierId: string) => {
    await fetch('/api/operator/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: memberId, tierId }) });
    setMembers(prev => prev.map(m => {
      if (m.id !== memberId) return m;
      const tier = tiers.find(t => t.id === tierId);
      return { ...m, tierId, tierName: tier?.name ?? m.tierName, tierColor: tier?.color ?? m.tierColor };
    }));
    setEditMemberId(null);
  };

  const toggleMemberStatus = async (m: Member) => {
    const newStatus = m.status === 'active' ? 'inactive' : 'active';
    await fetch('/api/operator/members', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, status: newStatus }) });
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, status: newStatus } : x));
  };

  const removeMember = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from this course?`)) return;
    await fetch(`/api/operator/members?id=${id}`, { method: 'DELETE' });
    setMembers(prev => prev.filter(m => m.id !== id));
  };

  /* ── Derived ── */
  const filteredMembers = members.filter(m => {
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    if (filterTier !== 'all' && m.tierId !== filterTier) return false;
    return true;
  });

  const setTF = (k: keyof typeof tierForm, v: unknown) => setTierForm(f => ({ ...f, [k]: v }));

  if (loading) return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <OperatorSidebar active="members" courseName={courseName} />
      <main className="flex-1 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </main>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <OperatorSidebar active="members" courseName={courseName} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-green-700" />
            <h1 className="font-black text-gray-900 text-lg">Member Management</h1>
          </div>
          <div className="ml-auto flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['tiers', 'members'] as const).map(p => (
              <button key={p} onClick={() => setPanel(p)} className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize transition-colors ${panel === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {p === 'tiers' ? `Tiers (${tiers.length})` : `Members (${members.filter(m => m.status === 'active').length})`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* ══════════════════ TIERS PANEL ══════════════════ */}
        {panel === 'tiers' && (
          <div className="grid lg:grid-cols-2 gap-6">

            {/* Left — tier list */}
            <div className="space-y-3">
              <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Your Tiers</h2>
              {tiers.length === 0 && (
                <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
                  No tiers yet — create your first one →
                </div>
              )}
              {tiers.map(t => (
                <div key={t.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }} />
                      <div>
                        <div className="font-bold text-gray-900">{t.name}</div>
                        <div className="text-xs text-gray-400">{t._count?.memberships ?? 0} active member{(t._count?.memberships ?? 0) !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEditTier(t)} className="p-1.5 text-gray-400 hover:text-green-700"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteTier(t.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  {/* Rates grid */}
                  {t.discountPct != null ? (
                    <div className="bg-green-50 rounded-xl px-4 py-2 text-sm text-green-800 font-semibold">
                      {t.discountPct}% off standard rate
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        ['Green fee (weekday)', fmtMoney(t.greenFeeWeekday)],
                        ['Green fee (weekend)', fmtMoney(t.greenFeeWeekend)],
                        ['Cart fee (weekday)',  fmtMoney(t.cartFeeWeekday)],
                        ['Cart fee (weekend)',  fmtMoney(t.cartFeeWeekend)],
                      ].map(([label, val]) => (
                        <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                          <div className="text-gray-400">{label}</div>
                          <div className="font-bold text-gray-800 mt-0.5">{val}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>⏰ Book {t.advanceBookingDays}d ahead</span>
                    {t.guestPassesPerYear > 0 && <span>🏌️ {t.guestPassesPerYear} guest pass{t.guestPassesPerYear !== 1 ? 'es' : ''}/yr</span>}
                    {t.annualFee > 0 && <span>💳 ${t.annualFee}/yr</span>}
                    {t.notes && <span className="text-gray-400 italic">{t.notes}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Right — create / edit tier form */}
            <div>
              <h2 className="font-bold text-gray-700 text-sm uppercase tracking-wide mb-3">
                {editingTier ? 'Edit Tier' : 'Create New Tier'}
              </h2>
              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">

                {/* Name + color */}
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tier name *</label>
                    <input className={inp} value={tierForm.name ?? ''} onChange={e => setTF('name', e.target.value)} placeholder="e.g. Full Member, Senior, Junior" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Color</label>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {TIER_COLORS.map(c => (
                        <button key={c} onClick={() => setTF('color', c)} className={`w-6 h-6 rounded-full border-2 transition-all ${tierForm.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`} style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Pricing mode */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pricing type</label>
                  <div className="flex gap-2">
                    {(['flat', 'pct'] as PricingMode[]).map(m => (
                      <button key={m} onClick={() => setPricingMode(m)} className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${pricingMode === m ? 'bg-[#1b4332] text-white border-[#1b4332]' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                        {m === 'flat' ? 'Flat rates' : '% discount'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    {pricingMode === 'flat'
                      ? 'Set exact dollar amounts. Overrides the standard tee time price for members of this tier.'
                      : 'Apply a % off the standard rate. Leave null fields blank to inherit standard pricing.'}
                  </p>
                </div>

                {pricingMode === 'flat' ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['Green fee — weekday', 'greenFeeWeekday'],
                      ['Green fee — weekend', 'greenFeeWeekend'],
                      ['Cart fee — weekday',  'cartFeeWeekday'],
                      ['Cart fee — weekend',  'cartFeeWeekend'],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input type="number" min="0" step="0.01" className={`${inp} pl-6`}
                            value={tierForm[key as keyof Tier] as number ?? ''}
                            onChange={e => setTF(key as keyof Tier, e.target.value === '' ? null : Number(e.target.value))}
                            placeholder="e.g. 45" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Discount %</label>
                    <div className="relative">
                      <input type="number" min="0" max="100" step="1" className={`${inp} pr-8`}
                        value={tierForm.discountPct ?? ''}
                        onChange={e => setTF('discountPct', e.target.value === '' ? null : Number(e.target.value))}
                        placeholder="e.g. 20" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                    </div>
                  </div>
                )}

                {/* Access */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Advance booking (days)</label>
                    <input type="number" min="0" className={inp} value={tierForm.advanceBookingDays ?? 14} onChange={e => setTF('advanceBookingDays', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Guest passes / year</label>
                    <input type="number" min="0" className={inp} value={tierForm.guestPassesPerYear ?? 0} onChange={e => setTF('guestPassesPerYear', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Annual fee ($)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input type="number" min="0" step="0.01" className={`${inp} pl-6`} value={tierForm.annualFee ?? 0} onChange={e => setTF('annualFee', Number(e.target.value))} placeholder="0" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes (internal)</label>
                  <textarea rows={2} className={`${inp} resize-none`} value={tierForm.notes ?? ''} onChange={e => setTF('notes', e.target.value)} placeholder="Any extra details about this tier..." />
                </div>

                {tierError && <div className="flex gap-2 items-center text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2"><AlertCircle className="w-4 h-4 shrink-0" />{tierError}</div>}

                <div className="flex gap-3">
                  {editingTier && <button onClick={cancelTierEdit} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50"><X className="w-4 h-4 inline mr-1" />Cancel</button>}
                  <button onClick={saveTier} disabled={tierSaving || !tierForm.name?.trim()} className="flex-1 bg-[#1b4332] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#2d6a4f] disabled:opacity-40 transition-colors">
                    {tierSaving ? 'Saving...' : editingTier ? 'Save Changes' : 'Create Tier'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ MEMBERS PANEL ══════════════════ */}
        {panel === 'members' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-500">
                <option value="all">All tiers</option>
                {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-green-500">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All statuses</option>
              </select>
              <span className="text-sm text-gray-400">{filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}</span>
              <button onClick={() => setAddOpen(o => !o)} className="ml-auto flex items-center gap-2 bg-[#1b4332] text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#2d6a4f] transition-colors">
                <Plus className="w-4 h-4" />Add Member
              </button>
            </div>

            {/* Add member form */}
            {addOpen && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900">Add Member</h3>
                  <button onClick={() => { setAddOpen(false); setMemberError(''); }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email *</label>
                    <input className={inp} value={memberForm.email} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} placeholder="member@email.com" type="email" />
                    <p className="text-xs text-gray-400 mt-1">If they already have a GreenReserve account, rates apply automatically at checkout.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full name</label>
                    <input className={inp} value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone</label>
                    <input className={inp} value={memberForm.phone} onChange={e => setMemberForm(f => ({ ...f, phone: e.target.value }))} placeholder="(201) 555-0100" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tier *</label>
                    <select className={inp} value={memberForm.tierId} onChange={e => setMemberForm(f => ({ ...f, tierId: e.target.value }))}>
                      <option value="">Select tier...</option>
                      {tiers.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Expires (optional)</label>
                    <input type="date" className={inp} value={memberForm.expiresAt} onChange={e => setMemberForm(f => ({ ...f, expiresAt: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Internal notes</label>
                    <input className={inp} value={memberForm.notes} onChange={e => setMemberForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
                  </div>
                </div>
                {memberError && <div className="flex gap-2 items-center text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2 mt-3"><AlertCircle className="w-4 h-4 shrink-0" />{memberError}</div>}
                <div className="flex gap-3 mt-4">
                  <button onClick={() => { setAddOpen(false); setMemberError(''); }} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-semibold">Cancel</button>
                  <button onClick={addMember} disabled={memberSaving || !memberForm.email || !memberForm.tierId} className="flex-1 bg-[#1b4332] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#2d6a4f] disabled:opacity-40 transition-colors">
                    {memberSaving ? 'Adding...' : 'Add Member'}
                  </button>
                </div>
              </div>
            )}

            {/* No tiers warning */}
            {tiers.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 flex gap-3 items-center text-sm text-yellow-800">
                <AlertCircle className="w-5 h-5 shrink-0 text-yellow-500" />
                You need at least one tier before adding members. <button onClick={() => setPanel('tiers')} className="underline font-semibold ml-1">Create a tier →</button>
              </div>
            )}

            {/* Member list */}
            {filteredMembers.length === 0 && tiers.length > 0 && (
              <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-400 text-sm">
                No members match this filter.
              </div>
            )}

            <div className="space-y-2">
              {filteredMembers.map(m => (
                <div key={m.id} className={`bg-white rounded-2xl border px-5 py-4 flex items-center gap-4 ${m.status !== 'active' ? 'opacity-60 border-gray-200' : 'border-gray-200'}`}>
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0" style={{ background: m.tierColor }}>
                    {m.name?.[0]?.toUpperCase() ?? '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{m.name || '—'}</span>
                      {!m.linked && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">No account yet</span>
                      )}
                      {m.status !== 'active' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 truncate">{m.email}{m.phone ? ` · ${m.phone}` : ''}</div>
                    {m.expiresAt && <div className="text-xs text-orange-500 mt-0.5">Expires {fmtDate(m.expiresAt)}</div>}
                    {m.notes && <div className="text-xs text-gray-400 italic mt-0.5">{m.notes}</div>}
                  </div>

                  {/* Tier badge / editor */}
                  <div className="shrink-0">
                    {editMemberId === m.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editMemberTierId}
                          onChange={e => setEditMemberTierId(e.target.value)}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-green-500"
                        >
                          {tiers.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <button onClick={() => updateMemberTier(m.id, editMemberTierId)} className="text-green-600 hover:text-green-800"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditMemberId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditMemberId(m.id); setEditMemberTierId(m.tierId ?? ''); }} className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-400 transition-colors">
                        <span className="w-2 h-2 rounded-full" style={{ background: m.tierColor }} />
                        {m.tierName}
                        <ChevronDown className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleMemberStatus(m)} title={m.status === 'active' ? 'Deactivate' : 'Activate'} className={`p-1.5 rounded-lg transition-colors ${m.status === 'active' ? 'text-green-600 hover:bg-red-50 hover:text-red-500' : 'text-gray-400 hover:bg-green-50 hover:text-green-600'}`}>
                      {m.status === 'active' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                    </button>
                    <button onClick={() => removeMember(m.id, m.name)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </main>
    </div>
  );
}
