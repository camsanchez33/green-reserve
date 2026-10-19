'use client';
// POS-2 (Cam 2026-10-19: the pro shop — "everything"): ring up a walk-up sale.
// Tap items into the sale, then take cash or send the customer a pay link
// (text or email; they pay on their own phone). Items for a group that is
// playing go on their round from the tee sheet instead, as before.
// Below: today's sales and any still waiting on a pay link.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';

type Item = { id: string; name: string; category: string; priceCents: number; active: boolean; stockCount: number | null };
type Sale = { id: string; status: string; totalCents: number; createdAt: string; paidAt: string | null; customerName: string; customerPhone: string; customerEmail: string; soldBy: string; lines: { name: string; unitPriceCents: number; quantity: number }[] };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  paid_cash: { label: 'Paid in cash', tone: 'ok' },
  paid_card: { label: 'Paid by card', tone: 'ok' },
  open: { label: 'Waiting on pay link', tone: 'warn' },
  paying: { label: 'Paying now', tone: 'warn' },
  void: { label: 'Voided', tone: 'neutral' },
};

export default function ShopPage() {
  const access = useDashboardAccess();
  const [items, setItems] = useState<Item[] | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pay, setPay] = useState<'cash' | 'sms' | 'email'>('cash');
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    const [i, s] = await Promise.all([
      dfetch<{ items: Item[] }>('/api/operator/shop-items'),
      dfetch<{ sales: Sale[] }>('/api/operator/shop-sales'),
    ]);
    if (!i.ok) { setLoadError(i.error); return; }
    if (!s.ok) { setLoadError(s.error); return; }
    setItems(i.data.items.filter(x => x.active));
    setSales(s.data.sales);
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items ?? []) { const k = it.category || 'Other'; m.set(k, [...(m.get(k) ?? []), it]); }
    return [...m.entries()];
  }, [items]);
  const lines = (items ?? []).filter(i => cart[i.id]).map(i => ({ item: i, quantity: cart[i.id] }));
  const total = lines.reduce((s, l) => s + l.item.priceCents * l.quantity, 0);
  const add = (id: string, d: number) => setCart(c => { const q = Math.max(0, Math.min(99, (c[id] ?? 0) + d)); const n = { ...c }; if (q) n[id] = q; else delete n[id]; return n; });

  async function ringUp() {
    setBusy('sale'); setError(''); setNote('');
    const r = await dfetch<{ sale: Sale; sent?: boolean; sendError?: string }>('/api/operator/shop-sales', {
      method: 'POST',
      body: JSON.stringify({
        lines: lines.map(l => ({ shopItemId: l.item.id, quantity: l.quantity })),
        pay: pay === 'cash' ? 'cash' : 'link', via: pay === 'email' ? 'email' : 'sms',
        customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email,
      }),
    });
    setBusy('');
    if (!r.ok) { setError(r.error); return; }
    setCart({}); setCustomer({ name: '', phone: '', email: '' });
    if (r.data.sendError) setError(`Sale saved, but ${r.data.sendError.charAt(0).toLowerCase()}${r.data.sendError.slice(1)} Send it again from the list below, or take cash.`);
    else setNote(pay === 'cash' ? `${usd(r.data.sale.totalCents)} in cash — recorded.` : `Pay link ${pay === 'sms' ? 'texted' : 'emailed'}. It shows as paid below when they pay.`);
    load();
  }

  async function act(sale: Sale, action: 'void' | 'paid_cash' | 'resend', via?: 'sms' | 'email') {
    if (action === 'void' && !confirm(`Void this ${usd(sale.totalCents)} sale? The pay link stops working.`)) return;
    setBusy(sale.id); setError(''); setNote('');
    const r = await dfetch('/api/operator/shop-sales', { method: 'PATCH', body: JSON.stringify({ id: sale.id, action, via }) });
    setBusy('');
    if (!r.ok) { setError(r.error); load(); return; }
    setNote(action === 'void' ? 'Sale voided.' : action === 'paid_cash' ? 'Recorded as paid in cash.' : 'Pay link sent again.');
    load();
  }

  const canSell = access.can('shop.sell');
  // Recording cash is the counter-payment power, as on the tee sheet.
  const canCash = access.can('sheet.counter_payment');
  const payChoices = ([['cash', 'Cash'], ['sms', 'Text them a pay link'], ['email', 'Email them a pay link']] as const).filter(([k]) => k !== 'cash' || canCash);
  useEffect(() => { if (access.loaded && !canCash) setPay(p => (p === 'cash' ? 'sms' : p)); }, [access.loaded, canCash]);
  const needContact = pay === 'sms' ? customer.phone.replace(/\D/g, '').length < 10 : pay === 'email' ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email.trim()) : false;
  const todayTotal = (sales ?? []).filter(s => (s.status === 'paid_cash' || s.status === 'paid_card') && s.paidAt && new Date(s.paidAt).toDateString() === new Date().toDateString()).reduce((t, s) => t + s.totalCents, 0);

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-paper md:overflow-hidden">
      <OperatorSidebar active="shop" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-8">
        {access.loaded && !canSell ? <StaffNotice what="the pro shop" view="shop.sell" /> : (
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            <h1 className="font-serif text-[30px] font-semibold leading-none text-ink">Pro shop</h1>
            <p className="text-[13.5px] text-ink-soft mt-2">Walk-up sales{sales ? ` · ${usd(todayTotal)} taken today` : ''}. For a group that’s playing, add items to their round from the tee sheet instead.</p>

            {loadError && (
              <div className="mt-4 bg-bad/5 border border-bad/20 rounded-md px-4 py-3 text-sm text-bad flex items-center justify-between gap-3" role="alert">
                <span>{loadError}</span>
                <button onClick={load} className="text-xs font-medium underline shrink-0">Retry</button>
              </div>
            )}

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <Card className="p-5">
                {!items && !loadError && <p className="text-sm text-ink-muted">Loading your shop…</p>}
                {items && items.length === 0 && (
                  <p className="text-sm text-ink-soft">Your shop has no items yet. <Link href="/dashboard/settings?section=Pro+shop" className="text-pine font-medium underline">Add them in Settings → Pro shop</Link>.</p>
                )}
                {groups.map(([cat, list]) => (
                  <section key={cat} className="mb-4 last:mb-0">
                    <h2 className="text-[13px] font-semibold text-ink mb-2">{cat}</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {list.map(it => (
                        <button key={it.id} onClick={() => add(it.id, 1)}
                          className={'text-left rounded-md border px-3 py-2.5 transition-colors ' + (cart[it.id] ? 'border-pine/50 bg-pine/[0.05]' : 'border-line bg-white hover:border-line-strong')}>
                          <span className="block text-sm font-medium text-ink leading-snug">{it.name}</span>
                          <span className="block text-[12.5px] text-ink-muted tabular-nums">
                            {usd(it.priceCents)}
                            {it.stockCount !== null && <span className={it.stockCount <= 0 ? 'text-bad' : ''}> · {it.stockCount <= 0 ? 'none left' : `${it.stockCount} left`}</span>}
                            {cart[it.id] ? <span className="text-pine font-semibold"> · {cart[it.id]} in sale</span> : null}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </Card>

              <Card className="p-5 lg:sticky lg:top-6">
                <h2 className="text-[15px] font-semibold text-ink">This sale</h2>
                {lines.length === 0 ? <p className="text-sm text-ink-soft mt-2">Tap items to add them.</p> : (
                  <ul className="mt-2 divide-y divide-line-soft">
                    {lines.map(l => (
                      <li key={l.item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate text-ink">{l.item.name}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => add(l.item.id, -1)} aria-label={`One fewer ${l.item.name}`} className="w-7 h-7 rounded-md border border-line text-ink-soft hover:text-ink">−</button>
                          <span className="w-6 text-center tabular-nums">{l.quantity}</span>
                          <button onClick={() => add(l.item.id, 1)} aria-label={`One more ${l.item.name}`} className="w-7 h-7 rounded-md border border-line text-ink-soft hover:text-ink">+</button>
                          <span className="w-16 text-right tabular-nums text-ink">{usd(l.item.priceCents * l.quantity)}</span>
                        </span>
                      </li>
                    ))}
                    <li className="flex justify-between py-2.5 text-[15px] font-semibold text-ink"><span>Total</span><span className="tabular-nums">{usd(total)}</span></li>
                  </ul>
                )}

                {lines.length > 0 && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5" role="radiogroup" aria-label="How they pay">
                      {payChoices.map(([k, label]) => (
                        <label key={k} className={'flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer text-sm text-ink ' + (pay === k ? 'border-pine/40' : 'border-line')}>
                          <input type="radio" name="pay" checked={pay === k} onChange={() => setPay(k)} className="accent-pine" />{label}
                        </label>
                      ))}
                    </div>
                    {pay !== 'cash' && (
                      <div className="space-y-2">
                        <input value={customer.name} onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))} placeholder="Name (optional)" aria-label="Customer name" className={INPUT + ' w-full'} />
                        {pay === 'sms'
                          ? <input value={customer.phone} onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))} placeholder="Mobile number" type="tel" aria-label="Mobile number" className={INPUT + ' w-full'} />
                          : <input value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} placeholder="Email address" type="email" aria-label="Email address" className={INPUT + ' w-full'} />}
                        <p className="text-[12.5px] text-ink-muted">They pay on their phone with Apple Pay, Google Pay or a card. The money goes to your Stripe account.</p>
                      </div>
                    )}
                    <button onClick={ringUp} disabled={busy === 'sale' || needContact}
                      className="w-full bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm py-2.5 disabled:opacity-50">
                      {busy === 'sale' ? 'Saving…' : pay === 'cash' ? `Take ${usd(total)} cash` : `Send ${usd(total)} pay link`}
                    </button>
                  </div>
                )}
                {error && <p className="mt-3 text-[13px] text-bad" role="alert">{error}</p>}
                {note && <p className="mt-3 text-[13px] text-ok flex items-center gap-1.5"><StatusDot status="ok" />{note}</p>}
              </Card>
            </div>

            <Card className="mt-5">
              <h2 className="text-[15px] font-semibold text-ink px-5 pt-4 pb-2">Today’s sales</h2>
              {sales && sales.length === 0 && <p className="px-5 pb-4 text-sm text-ink-soft">No walk-up sales yet today.</p>}
              {sales && sales.length > 0 && (
                <ul className="divide-y divide-line-soft">
                  {sales.map(s => {
                    const st = STATUS[s.status] ?? { label: s.status, tone: 'neutral' as const };
                    return (
                      <li key={s.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="text-ink"><span className="tabular-nums text-ink-soft">{time(s.createdAt)}</span> · <span className="font-medium tabular-nums">{usd(s.totalCents)}</span>{s.customerName ? ` · ${s.customerName}` : ''}</div>
                          <div className="text-[12.5px] text-ink-muted truncate">{s.lines.map(l => `${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`).join(', ')}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <StatusDot status={st.tone} label={st.label} />
                          {s.status === 'open' && (
                            <>
                              <button onClick={() => act(s, 'resend', s.customerPhone ? 'sms' : 'email')} disabled={!!busy} className="text-[12.5px] text-pine font-medium hover:underline disabled:opacity-50">Send again</button>
                              {canCash && <button onClick={() => act(s, 'paid_cash')} disabled={!!busy} className="text-[12.5px] text-pine font-medium hover:underline disabled:opacity-50">Took cash</button>}
                              <button onClick={() => act(s, 'void')} disabled={!!busy} className="text-[12.5px] text-bad hover:underline disabled:opacity-50">Void</button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="px-5 py-3 text-[12px] text-ink-muted border-t border-line-soft">Card refunds for a paid sale are made in your Stripe dashboard for now.</p>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
