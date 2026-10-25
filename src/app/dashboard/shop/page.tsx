'use client';
// POS-2 (Cam 2026-10-19: the pro shop — "everything"): ring up a walk-up sale.
// Tap items into the sale, then take cash or send the customer a pay link
// (text or email; they pay on their own phone). Items for a group that is
// playing go on their round from the tee sheet instead, as before.
// Below: today's sales and any still waiting on a pay link.
// W2-7 (Cam 2026-10-20): find an item by name, size or SKU; filter by
// category; an item with sizes/colors opens its options to pick one.
// POS-3 (Cam 2026-10-24: "look at how Shopify runs their POS or … Square"):
// scan a barcode into the search box, ring up a custom amount, take money off
// (shop.discount), enter the cash handed over for the change, send a receipt,
// and refund a paid sale (money.refund) — cash recorded, card through Stripe.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { RegisterClose } from '@/components/dashboard/RegisterClose';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { dfetch } from '@/lib/dashboard-fetch';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { shopTree, matches, bySku, type FlatItem, type TreeItem } from '@/lib/shop-tree';

type Item = FlatItem;
type Refund = { id: string; amountCents: number; method: string; status: string; reason: string; restocked: boolean; error: string; createdAt: string };
type Sale = {
  id: string; status: string; totalCents: number; taxCents: number; createdAt: string; paidAt: string | null; customerName: string; customerPhone: string; customerEmail: string; soldBy: string;
  lines: { name: string; unitPriceCents: number; quantity: number }[];
  discountCents: number; discountNote: string; cashTenderedCents: number | null; refundedCents: number; receiptSentAt: string | null; refunds: Refund[];
  /** POS-3 R2: green fees in this sale — refunded from the booking, not here. */
  roundsCents: number;
  /** POS-3 R3: sent as a pay link (else rung up here — cash or the card reader). */
  link: boolean;
};
type Reader = { id: string; label: string; online: boolean; simulated: boolean };
/** POS-3 R3b: one group's round on the card reader. */
type RoundOnReader = { bookingId: string; readerId: string; label: string; dueCents: number; state: 'waiting' | 'declined' | 'cancelled' | 'error'; message: string };
/** A sale on the card reader: waiting for the card, or what happened. */
type ReaderSale = { sale: Sale; readerId: string; state: 'waiting' | 'declined' | 'cancelled' | 'error'; message: string };
type Custom = { key: string; name: string; priceCents: number; quantity: number };
// POS-3 R2: green fees at the register — today's groups that owe, and walk-ins.
type Owing = { bookingId: string; time: string; holes: number; golferName: string; players: number; dueCents: number; cardCents: number; noShow: boolean };
type OpenTime = { teeTimeId: string; time: string; holes: number; round: string | null; spots: number; greenFeeCents: number; cartFeeCents: number; walkingAllowed: boolean };
type WalkIn = { key: string; teeTimeId: string; time: string; golferName: string; players: number; cart: boolean; estimateCents: number };
type Discount = { mode: 'percent' | 'amount'; value: string; note: string };
type Quote = { key: string; subtotalCents: number; discountCents: number; taxCents: number; totalCents: number; taxCalculationId: string };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const toCents = (v: string) => { const n = Number(v.replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
const isPaid = (s: Sale) => s.status === 'paid_cash' || s.status === 'paid_card';
const LINK = 'text-[12.5px] text-pine font-medium hover:underline disabled:opacity-50';
const clock = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
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
  const [pay, setPay] = useState<'cash' | 'reader' | 'sms' | 'email'>('cash');
  // POS-3 R3: the course's card readers (Settings → Pro shop) and the sale on one now.
  const [readers, setReaders] = useState<Reader[]>([]);
  const [readerId, setReaderId] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [onReader, setOnReader] = useState<ReaderSale | null>(null);
  const [roundOnReader, setRoundOnReader] = useState<RoundOnReader | null>(null);
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  // W2-7 part B: the total with sales tax, worked out as the sale is built.
  const [quote, setQuote] = useState<Quote | null>(null);
  // POS-3: custom amounts, a discount, the cash handed over, and the sale just taken (for its receipt).
  const [customs, setCustoms] = useState<Custom[]>([]);
  const [customForm, setCustomForm] = useState<{ name: string; amount: string } | null>(null);
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [tendered, setTendered] = useState('');
  const [justPaid, setJustPaid] = useState<Sale | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; via: 'email' | 'sms'; to: string } | null>(null);
  const [refund, setRefund] = useState<{ id: string; amount: string; reason: string; restock: boolean; confirm: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'items' | 'rounds'>('items');
  const [roundsData, setRoundsData] = useState<{ owing: Owing[]; open: OpenTime[] } | null>(null);
  const [roundsError, setRoundsError] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [walkIns, setWalkIns] = useState<WalkIn[]>([]);
  const [walkForm, setWalkForm] = useState<{ teeTimeId: string; name: string; players: number; cart: boolean } | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteTry, setQuoteTry] = useState(0);

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
    // Readers are optional: a course without one (or Stripe down) still sells in cash and by link.
    const rd = await dfetch<{ readers: Reader[]; testMode: boolean }>('/api/operator/card-readers');
    if (rd.ok) { setReaders(rd.data.readers); setTestMode(rd.data.testMode); setReaderId(id => rd.data.readers.some(x => x.id === id) ? id : rd.data.readers[0]?.id ?? ''); }
  }, []);
  const loadRounds = useCallback(async () => {
    const r = await dfetch<{ owing: Owing[]; open: OpenTime[] }>('/api/operator/shop-sales/rounds');
    if (r.ok) { setRoundsData(r.data); setRoundsError(''); } else setRoundsError(r.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => shopTree(items ?? []).filter(i => !i.parentId), [items]);
  const categories = useMemo(() => [...new Set(tree.map(i => i.category || 'Other'))].sort(), [tree]);
  const groups = useMemo(() => {
    const m = new Map<string, TreeItem[]>();
    for (const it of tree) {
      if (!matches(it, q) || (cat && (it.category || 'Other') !== cat)) continue;
      const k = it.category || 'Other'; m.set(k, [...(m.get(k) ?? []), it]);
    }
    return [...m.entries()];
  }, [tree, q, cat]);
  const inCart = (it: TreeItem) => (it.options.length ? it.options.reduce((s, o) => s + (cart[o.id] ?? 0), 0) : cart[it.id] ?? 0);
  const lines = (items ?? []).filter(i => cart[i.id]).map(i => ({ item: i, quantity: cart[i.id] }));
  const subtotal = lines.reduce((s, l) => s + l.item.priceCents * l.quantity, 0) + customs.reduce((s, c) => s + c.priceCents * c.quantity, 0);
  const salePayload = useMemo(() => [
    ...lines.map(l => ({ shopItemId: l.item.id, quantity: l.quantity })),
    ...customs.map(c => ({ name: c.name, priceCents: c.priceCents, quantity: c.quantity })),
  ], [lines, customs]); // eslint-disable-line react-hooks/exhaustive-deps
  const discountPayload = discount && Number(discount.value) > 0
    ? (discount.mode === 'percent' ? { percent: Number(discount.value), note: discount.note } : { amountCents: toCents(discount.value), note: discount.note })
    : undefined;
  const cartKey = salePayload.length ? JSON.stringify([salePayload, discountPayload ?? null]) : '';
  useEffect(() => {
    if (!cartKey) { setQuote(null); setQuoteError(''); return; }
    let live = true;
    const t = setTimeout(async () => {
      const [l, d] = JSON.parse(cartKey);
      const r = await dfetch<Omit<Quote, 'key'>>('/api/operator/shop-sales/quote', { method: 'POST', body: JSON.stringify({ lines: l, discount: d ?? undefined }) });
      if (!live) return;
      if (r.ok) { setQuote({ key: cartKey, ...r.data }); setQuoteError(''); } else { setQuote(null); setQuoteError(r.error); }
    }, 700); // one Stripe Tax calculation per pause, not per tap
    return () => { live = false; clearTimeout(t); };
  }, [cartKey, quoteTry]);
  const priced = quote && quote.key === cartKey ? quote : null;
  const pickedRounds = (roundsData?.owing ?? []).filter(o => picked.includes(o.bookingId));
  // A group in cash owes the round less GreenReserve's fee; on the card reader, the round's card charge (booking fee included).
  const owed = (o: Owing) => (pay === 'reader' ? o.cardCents : o.dueCents);
  const roundsCents = pickedRounds.reduce((n, o) => n + owed(o), 0) + walkIns.reduce((n, w) => n + w.estimateCents, 0);
  const hasRounds = pickedRounds.length + walkIns.length > 0;
  const itemsEmpty = salePayload.length === 0;
  const due = (itemsEmpty ? 0 : priced ? priced.totalCents : subtotal) + roundsCents;
  const ready = itemsEmpty ? hasRounds : !!priced;
  const tenderedCents = toCents(tendered);
  const add = (id: string, d: number) => setCart(c => { const q = Math.max(0, Math.min(99, (c[id] ?? 0) + d)); const n = { ...c }; if (q) n[id] = q; else delete n[id]; return n; });
  const addCustom = (key: string, d: number) => setCustoms(cs => cs.map(c => c.key === key ? { ...c, quantity: Math.max(0, Math.min(99, c.quantity + d)) } : c).filter(c => c.quantity > 0));
  const empty = itemsEmpty && !hasRounds;

  // A scanner types the code and presses Enter: an exact SKU goes straight into the sale.
  function scan(code: string) {
    const hit = bySku(items ?? [], code);
    if (hit) { add(hit.id, 1); setQ(''); setNote(`Added ${hit.name}.`); setError(''); return true; }
    return false;
  }

  async function ringUp() {
    if (pay === 'reader' && hasRounds) return roundToReader();
    setBusy('sale'); setError(''); setNote(''); setJustPaid(null);
    const r = await dfetch<{ sale: Sale; sent?: boolean; sendError?: string; readerError?: string; skipped?: string[]; notes?: string[] }>('/api/operator/shop-sales', {
      method: 'POST',
      body: JSON.stringify({
        lines: salePayload, discount: itemsEmpty ? undefined : discountPayload,
        bookingIds: pickedRounds.map(o => o.bookingId),
        walkIns: walkIns.map(w => ({ teeTimeId: w.teeTimeId, golferName: w.golferName, players: w.players, cartSelected: w.cart })),
        pay: pay === 'cash' || pay === 'reader' ? pay : 'link', via: pay === 'email' ? 'email' : 'sms', readerId: pay === 'reader' ? readerId : undefined, taxCalculationId: priced?.taxCalculationId || undefined,
        cashTenderedCents: pay === 'cash' && tenderedCents ? tenderedCents : undefined,
        customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email,
      }),
    });
    setBusy('');
    if (!r.ok) {
      setError(r.error);
      // The rounds went through (checked in, paid at the counter) though the items didn't: take them out of the sale.
      if (/^The (round was|\d+ rounds were) paid/.test(r.error)) { setPicked([]); setWalkIns([]); loadRounds(); load(); }
      return;
    }
    setCart({}); setCustoms([]); setDiscount(null); setTendered(''); setCustomer({ name: '', phone: '', email: '' }); setPicked([]); setWalkIns([]);
    if (hasRounds) loadRounds();
    if (r.data.skipped?.length) setError(`Not rung up: ${r.data.skipped.join(' ')} The total below is what was taken.`);
    if (r.data.notes?.length) setNote(r.data.notes.join(' '));
    if (pay === 'reader') setOnReader({ sale: r.data.sale, readerId, state: r.data.readerError ? 'error' : 'waiting', message: r.data.readerError ?? '' });
    else if (r.data.sendError) setError(`Sale saved, but ${r.data.sendError.charAt(0).toLowerCase()}${r.data.sendError.slice(1)} Send it again from the list below, or take cash.`);
    else if (pay === 'cash') { setJustPaid(r.data.sale); setReceipt({ id: r.data.sale.id, via: 'email', to: '' }); }
    else setNote(`Pay link ${pay === 'sms' ? 'texted' : 'emailed'}. It shows as paid below when they pay.`);
    load();
    searchRef.current?.focus();
  }

  // POS-3 R3b: one group's round on the reader — a card payment of their booking (checked in when it goes through).
  async function roundToReader(again?: RoundOnReader) {
    const group = again ? null : pickedRounds[0];
    const bookingId = again?.bookingId ?? group?.bookingId ?? '';
    const label = again?.label ?? (group ? `${clock(group.time)} · ${group.golferName} · ${group.players} player${group.players === 1 ? '' : 's'}` : '');
    const rid = again?.readerId ?? readerId;
    setBusy('sale'); setError(''); setNote(''); setJustPaid(null);
    const r = await dfetch<{ status: string; dueCents?: number; message?: string }>('/api/operator/reader-rounds', { method: 'POST', body: JSON.stringify({ bookingId, readerId: rid }) });
    setBusy('');
    if (!r.ok) { setRoundOnReader({ bookingId, readerId: rid, label, dueCents: again?.dueCents ?? 0, state: 'error', message: r.error }); loadRounds(); return; }
    setPicked([]);
    setRoundOnReader({ bookingId, readerId: rid, label, dueCents: r.data.dueCents ?? 0, state: 'waiting', message: r.data.message ?? '' });
  }
  useEffect(() => {
    if (roundOnReader?.state !== 'waiting') return;
    let live = true;
    const t = setInterval(async () => {
      const r = await dfetch<{ status: string; message?: string }>('/api/operator/reader-rounds', { method: 'PATCH', body: JSON.stringify({ bookingId: roundOnReader.bookingId, action: 'status' }) });
      if (!live) return;
      if (!r.ok) { setRoundOnReader(o => o && { ...o, message: `${r.error} Still checking…` }); return; }
      if (r.data.status === 'paid') { setNote(`${roundOnReader.label} — paid by card and checked in.`); setRoundOnReader(null); loadRounds(); return; }
      if (r.data.status === 'refunded') { setError(r.data.message ?? 'The round was already paid — the card payment was refunded.'); setRoundOnReader(null); loadRounds(); return; }
      if (r.data.status === 'declined') setRoundOnReader(o => o && { ...o, state: 'declined', message: r.data.message || 'The card was declined.' });
      else if (r.data.status === 'cancelled' || r.data.status === 'open') setRoundOnReader(o => o && { ...o, state: 'cancelled', message: 'The payment was stopped — nothing was charged.' });
      else if (r.data.message) setRoundOnReader(o => o && { ...o, message: r.data.message ?? '' });
    }, 2000);
    return () => { live = false; clearInterval(t); };
  }, [roundOnReader?.state, roundOnReader?.bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function roundReaderAct(action: 'cancel' | 'simulate', card?: 'ok' | 'declined') {
    if (!roundOnReader) return;
    setBusy('reader'); setError('');
    const r = await dfetch<{ status?: string; message?: string }>('/api/operator/reader-rounds', { method: 'PATCH', body: JSON.stringify({ bookingId: roundOnReader.bookingId, action, readerId: roundOnReader.readerId, card }) });
    setBusy('');
    if (!r.ok) { setRoundOnReader(o => o && { ...o, message: r.error }); return; }
    if (action === 'cancel') {
      if (r.data.status === 'paid') { setNote(`${roundOnReader.label} — the card went through before the reader stopped: paid and checked in.`); setRoundOnReader(null); loadRounds(); return; }
      if (r.data.status === 'refunded') { setError(r.data.message ?? ''); setRoundOnReader(null); loadRounds(); return; }
      setRoundOnReader(o => o && (r.data.status === 'waiting' ? { ...o, message: r.data.message ?? '' } : { ...o, state: 'cancelled', message: 'Cancelled — nothing was charged.' }));
      loadRounds();
    }
  }

  // POS-3 R3: while a sale is on the reader, ask every 2 seconds what it is doing.
  useEffect(() => {
    if (onReader?.state !== 'waiting') return;
    let live = true;
    const t = setInterval(async () => {
      const r = await dfetch<{ status: string; message?: string }>('/api/operator/shop-sales', { method: 'PATCH', body: JSON.stringify({ id: onReader.sale.id, action: 'reader_status' }) });
      if (!live) return;
      if (!r.ok) { setOnReader(o => o && { ...o, message: `${r.error} Still checking…` }); return; }
      if (r.data.status === 'paid') { readerPaid(onReader.sale); return; }
      if (r.data.status === 'declined') setOnReader(o => o && { ...o, state: 'declined', message: r.data.message || 'The card was declined.' });
      else if (r.data.status === 'cancelled' || r.data.status === 'open') setOnReader(o => o && { ...o, state: 'cancelled', message: 'The payment was cancelled on the reader.' });
      else if (r.data.status === 'other') { setOnReader(null); setError(r.data.message || 'This sale changed — see the list below.'); load(); }
    }, 2000);
    return () => { live = false; clearInterval(t); };
  }, [onReader?.state, onReader?.sale.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function readerPaid(sale: Sale) {
    setOnReader(null);
    setJustPaid({ ...sale, status: 'paid_card' });
    setReceipt({ id: sale.id, via: 'email', to: '' });
    load();
  }

  async function readerAct(action: 'reader_start' | 'reader_cancel' | 'reader_simulate', card?: 'ok' | 'declined') {
    if (!onReader) return;
    setBusy('reader'); setError('');
    const r = await dfetch<{ status?: string; message?: string }>('/api/operator/shop-sales', { method: 'PATCH', body: JSON.stringify({ id: onReader.sale.id, action, readerId: onReader.readerId, card }) });
    setBusy('');
    if (!r.ok) { setOnReader(o => o && { ...o, state: action === 'reader_start' ? 'error' : o.state, message: r.error }); load(); return; }
    if (action === 'reader_start') setOnReader(o => o && { ...o, state: 'waiting', message: '' });
    if (action === 'reader_cancel') {
      if (r.data.status === 'paid') { readerPaid(onReader.sale); setNote(r.data.message ?? ''); return; }
      setOnReader(o => o && (r.data.status === 'waiting' ? { ...o, message: r.data.message ?? '' } : { ...o, state: 'cancelled', message: 'Cancelled — nothing was charged.' }));
    }
    load();
  }

  async function sendReceipt() {
    if (!receipt) return;
    setBusy('receipt' + receipt.id); setError(''); setNote('');
    const r = await dfetch('/api/operator/shop-sales', { method: 'PATCH', body: JSON.stringify({ id: receipt.id, action: 'receipt', via: receipt.via, to: receipt.to }) });
    setBusy('');
    if (!r.ok) { setError(r.error); return; }
    setNote(`Receipt ${receipt.via === 'sms' ? 'texted' : 'emailed'}.`);
    setReceipt(null); setJustPaid(null);
    load();
  }

  async function doRefund(sale: Sale) {
    if (!refund) return;
    setBusy('refund' + sale.id); setError(''); setNote('');
    const r = await dfetch<{ status: 'done' | 'pending' }>('/api/operator/shop-sales', { method: 'PATCH', body: JSON.stringify({ id: sale.id, action: 'refund', amountCents: toCents(refund.amount), reason: refund.reason, restock: refund.restock }) });
    setBusy('');
    if (!r.ok) { setError(r.error); load(); return; }
    setRefund(null);
    setNote(r.data.status === 'pending' ? 'Sent to Stripe — it hasn’t confirmed yet. Check back in a few minutes.' : sale.status === 'paid_card' ? 'Refunded to their card.' : 'Refund recorded — hand the cash back.');
    load();
  }

  async function retryRefund(sale: Sale, refundId: string) {
    setBusy('retry' + refundId); setError(''); setNote('');
    const r = await dfetch<{ status: 'done' | 'pending' }>('/api/operator/shop-sales', { method: 'PATCH', body: JSON.stringify({ id: sale.id, action: 'refund_retry', refundId }) });
    setBusy('');
    if (!r.ok) { setError(r.error); load(); return; }
    setNote(r.data.status === 'done' ? 'Refund went through.' : 'Stripe still hasn’t confirmed it — try again in a few minutes.');
    load();
  }

  async function act(sale: Sale, action: 'void' | 'paid_cash' | 'resend', via?: 'sms' | 'email') {
    if (action === 'void' && !confirm(`Void this ${usd(sale.totalCents)} sale?${sale.link ? ' The pay link stops working.' : ''}`)) return;
    if (onReader?.sale.id === sale.id) setOnReader(null);
    setBusy(sale.id); setError(''); setNote('');
    const r = await dfetch('/api/operator/shop-sales', { method: 'PATCH', body: JSON.stringify({ id: sale.id, action, via }) });
    setBusy('');
    if (!r.ok) { setError(r.error); load(); return; }
    setNote(action === 'void' ? 'Sale voided.' : action === 'paid_cash' ? 'Recorded as paid in cash.' : 'Pay link sent again.');
    load();
  }

  const canSell = access.can('shop.sell');
  const canDiscount = access.can('shop.discount');
  const canRefund = access.can('money.refund');
  // Recording cash is the counter-payment power, as on the tee sheet.
  const canCash = access.can('sheet.counter_payment');
  // Rounds at the register are cash for now (rounds on the card reader come next).
  // POS-3 R3b: one group (no items, no walk-in) can go on the card reader; other mixes of rounds are cash.
  const canCheckin = access.can('sheet.checkin');
  const oneRoundForReader = pickedRounds.length === 1 && walkIns.length === 0 && itemsEmpty && canCheckin;
  const payChoices = ([['cash', 'Cash'], ['reader', 'Card reader'], ['sms', 'Text them a pay link'], ['email', 'Email them a pay link']] as const)
    .filter(([k]) => (k !== 'cash' || canCash) && (k !== 'reader' || readers.length > 0) && (!hasRounds || k === 'cash' || (k === 'reader' && oneRoundForReader)));
  useEffect(() => { if (hasRounds) setPay(p => (p === 'reader' && oneRoundForReader ? p : 'cash')); }, [hasRounds, oneRoundForReader]);
  useEffect(() => { if (access.loaded && canCash) loadRounds(); }, [access.loaded, canCash, loadRounds]);
  const canWalkIn = access.can('sheet.walkin');
  const walkTime = roundsData?.open.find(t => t.teeTimeId === walkForm?.teeTimeId) ?? null;
  useEffect(() => { if (access.loaded && !canCash) setPay(p => (p === 'cash' ? (readers.length ? 'reader' : 'sms') : p)); }, [access.loaded, canCash, readers.length]);
  useEffect(() => { if (pay === 'reader' && !readers.length) setPay(canCash ? 'cash' : 'sms'); }, [pay, readers.length, canCash]);
  const readerName = (id: string) => readers.find(x => x.id === id)?.label ?? 'the card reader';
  const needContact = pay === 'sms' ? customer.phone.replace(/\D/g, '').length < 10 : pay === 'email' ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email.trim()) : false;
  const todayTotal = (sales ?? []).filter(s => isPaid(s) && s.paidAt && new Date(s.paidAt).toDateString() === new Date().toDateString()).reduce((t, s) => t + s.totalCents - s.refundedCents, 0);
  // Quick cash amounts: the exact total, then the next notes up.
  const quickCash = [due, ...[2000, 5000, 10000].filter(n => n > due)].filter((n, i, a) => n > 0 && a.indexOf(n) === i).slice(0, 4);

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-white md:overflow-hidden">
      <OperatorSidebar active="shop" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-8">
        {access.loaded && !canSell ? <StaffNotice what="the pro shop" view="shop.sell" /> : (
          <div className="px-4 sm:px-10 py-7">
            <h1 className="font-serif text-[32px] leading-none text-ink">Pro shop</h1>
            <p className="text-[13.5px] text-ink-soft mt-2">Walk-up sales and green fees taken at the register{sales ? ` · ${usd(todayTotal)} today` : ''}. For a group that’s playing, add items to their round from the tee sheet instead.</p>

            {loadError && (
              <div className="mt-4 bg-bad/5 border border-bad/20 rounded-md px-4 py-3 text-sm text-bad flex items-center justify-between gap-3" role="alert">
                <span>{loadError}</span>
                <button onClick={load} className="text-xs font-medium underline shrink-0">Retry</button>
              </div>
            )}

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <Card className="p-5">
                {canCash && (
                  <div className="flex gap-1 mb-4" role="tablist" aria-label="Ring up">
                    {([['items', 'Shop items'], ['rounds', 'Rounds today']] as const).map(([k, l]) => (
                      <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                        className={'px-3 py-1.5 rounded-md border text-[13px] ' + (tab === k ? 'border-pine/40 text-ink font-medium' : 'border-line text-ink-soft hover:text-ink')}>{l}</button>
                    ))}
                  </div>
                )}
                {tab === 'rounds' && (
                  <div>
                    {roundsError && <p className="text-sm text-bad" role="alert">{roundsError} <button onClick={loadRounds} className="underline font-medium">Retry</button></p>}
                    {!roundsData && !roundsError && <p className="text-sm text-ink-muted">Loading today’s tee sheet…</p>}
                    {roundsData && (
                      <>
                        <h2 className="text-[13px] font-semibold text-ink mb-2">Groups still to pay</h2>
                        {roundsData.owing.length === 0 ? <p className="text-sm text-ink-soft">Every group today has paid.</p> : (
                          <ul className="divide-y divide-line-soft">
                            {roundsData.owing.map(o => {
                              const on = picked.includes(o.bookingId);
                              return (
                                <li key={o.bookingId} className="flex items-center justify-between gap-3 py-2 text-sm">
                                  <span className="min-w-0"><span className="tabular-nums text-ink-soft">{clock(o.time)}</span> · <span className="text-ink">{o.golferName}</span> <span className="text-ink-muted">· {o.players} player{o.players === 1 ? '' : 's'} · {o.holes} holes{o.noShow ? ' · marked no-show' : ''}</span></span>
                                  <span className="flex items-center gap-3 shrink-0">
                                    <span className="tabular-nums text-ink">{usd(o.dueCents)}</span>
                                    <button onClick={() => setPicked(p => on ? p.filter(x => x !== o.bookingId) : [...p, o.bookingId])} aria-pressed={on} className={LINK}>{on ? 'Added' : 'Add'}</button>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {canWalkIn && (
                          <div className="mt-5">
                            <h2 className="text-[13px] font-semibold text-ink mb-2">Walk-in</h2>
                            {roundsData.open.length === 0 ? <p className="text-sm text-ink-soft">No open tee times left today.</p> : !walkForm ? (
                              <button onClick={() => { const t = roundsData.open[0]; setWalkForm({ teeTimeId: t.teeTimeId, name: '', players: Math.min(2, t.spots), cart: !t.walkingAllowed || t.cartFeeCents > 0 }); }} className={LINK}>Book a walk-in onto the next open time</button>
                            ) : (
                              <form className="bg-paper/70 rounded-md p-3 space-y-2 max-w-md" onSubmit={e => {
                                e.preventDefault();
                                if (!walkTime || walkForm.name.trim().length < 2) { setError('Pick a time and enter the golfer’s name.'); return; }
                                const cart = walkForm.cart || !walkTime.walkingAllowed;
                                setWalkIns(ws => [...ws, { key: `w${Date.now()}`, teeTimeId: walkTime.teeTimeId, time: walkTime.time, golferName: walkForm.name.trim(), players: walkForm.players, cart, estimateCents: (walkTime.greenFeeCents + (cart ? walkTime.cartFeeCents : 0)) * walkForm.players }]);
                                setWalkForm(null); setError('');
                              }}>
                                <div className="flex flex-wrap gap-2">
                                  <select value={walkForm.teeTimeId} onChange={e => { const t = roundsData.open.find(x => x.teeTimeId === e.target.value)!; setWalkForm({ ...walkForm, teeTimeId: t.teeTimeId, players: Math.min(walkForm.players, t.spots), cart: walkForm.cart || !t.walkingAllowed }); }} aria-label="Tee time" className={INPUT}>
                                    {roundsData.open.map(t => <option key={t.teeTimeId} value={t.teeTimeId}>{clock(t.time)}{t.round ? ` · ${t.round}` : ''} · {t.spots} open</option>)}
                                  </select>
                                  <input type="number" min={1} max={walkTime?.spots ?? 4} value={walkForm.players} onChange={e => setWalkForm({ ...walkForm, players: Math.max(1, Math.min(walkTime?.spots ?? 4, Number(e.target.value) || 1)) })} aria-label="Players" className={INPUT + ' w-20'} />
                                </div>
                                <input value={walkForm.name} onChange={e => setWalkForm({ ...walkForm, name: e.target.value })} placeholder="Golfer’s name" aria-label="Golfer’s name" maxLength={120} className={INPUT + ' w-full'} autoFocus />
                                {walkTime && walkTime.cartFeeCents > 0 && (
                                  <label className="flex items-center gap-2 text-[13px] text-ink">
                                    <input type="checkbox" checked={walkForm.cart || !walkTime.walkingAllowed} disabled={!walkTime.walkingAllowed} onChange={e => setWalkForm({ ...walkForm, cart: e.target.checked })} className="accent-pine" />
                                    Cart ({usd(walkTime.cartFeeCents)} / player){!walkTime.walkingAllowed ? ' — required on this time' : ''}
                                  </label>
                                )}
                                {walkTime && <p className="text-[12.5px] text-ink-muted tabular-nums">{usd((walkTime.greenFeeCents + ((walkForm.cart || !walkTime.walkingAllowed) ? walkTime.cartFeeCents : 0)) * walkForm.players)} at the standard rate. It goes on the tee sheet, checked in and paid, when you take the cash.</p>}
                                <div className="flex gap-2">
                                  <button type="submit" className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-[13px] px-3 py-2">Add to the sale</button>
                                  <button type="button" onClick={() => setWalkForm(null)} className="text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2">Cancel</button>
                                </div>
                              </form>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {tab === 'items' && !items && !loadError && <p className="text-sm text-ink-muted">Loading your shop…</p>}
                {tab === 'items' && items && items.length === 0 && (
                  <p className="text-sm text-ink-soft">Your shop has no items yet. <Link href="/dashboard/settings?section=Pro+shop" className="text-pine font-medium underline">Add them in Settings → Pro shop</Link>.</p>
                )}
                {tab === 'items' && tree.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (!scan(q) && q.trim()) setNote(''); } }}
                      placeholder="Find or scan an item" aria-label="Find or scan an item" className={INPUT + ' w-56'} />
                    {categories.length > 1 && ['', ...categories].map(c => (
                      <button key={c || 'all'} type="button" onClick={() => setCat(c)} aria-pressed={cat === c}
                        className={'text-[12.5px] rounded-md px-2.5 py-1 border ' + (cat === c ? 'border-pine/40 text-ink font-medium' : 'border-line text-ink-soft hover:text-ink')}>{c || 'All'}</button>
                    ))}
                  </div>
                )}
                {tab === 'items' && tree.length > 0 && groups.length === 0 && <p className="text-sm text-ink-soft">Nothing matches.{q.trim() ? ' Scanned a code? Add it as the item’s SKU in Settings → Pro shop.' : ''}</p>}
                {tab === 'items' && groups.map(([group, list]) => (
                  <section key={group} className="mb-4 last:mb-0">
                    <h2 className="text-[13px] font-semibold text-ink mb-2">{group}</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {list.map(it => {
                        const n = inCart(it);
                        const opts = it.options.filter(o => o.active);
                        return (
                          <div key={it.id} className={picking === it.id ? 'col-span-2 sm:col-span-3' : ''}>
                            <button onClick={() => (opts.length ? setPicking(p => (p === it.id ? null : it.id)) : add(it.id, 1))} aria-expanded={opts.length ? picking === it.id : undefined}
                              className={'w-full text-left rounded-md border px-3 py-2.5 transition-colors ' + (n ? 'border-pine/50 bg-pine/[0.05]' : 'border-line bg-white hover:border-line-strong')}>
                              <span className="block text-sm font-medium text-ink leading-snug">{it.name}</span>
                              <span className="block text-[12.5px] text-ink-muted tabular-nums">
                                {usd(it.priceCents)}
                                {opts.length ? <> · {opts.length} options</> : it.stockCount !== null && <span className={it.stockCount <= 0 ? 'text-bad' : ''}> · {it.stockCount <= 0 ? 'none left' : `${it.stockCount} left`}</span>}
                                {n ? <span className="text-pine font-semibold"> · {n} in sale</span> : null}
                              </span>
                            </button>
                            {picking === it.id && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5 bg-paper/70 rounded-md p-2" role="group" aria-label={`${it.name} options`}>
                                {opts.map(o => (
                                  <button key={o.id} onClick={() => add(o.id, 1)}
                                    className={'rounded-md border px-3 py-1.5 text-[13px] ' + (cart[o.id] ? 'border-pine/50 bg-white text-ink font-medium' : 'border-line bg-white text-ink hover:border-line-strong')}>
                                    {o.optionLabel}
                                    {o.priceCents !== it.priceCents && <span className="text-ink-muted tabular-nums"> {usd(o.priceCents)}</span>}
                                    {o.stockCount !== null && <span className={'tabular-nums ' + (o.stockCount <= 0 ? 'text-bad' : 'text-ink-muted')}> ({o.stockCount})</span>}
                                    {cart[o.id] ? <span className="text-pine font-semibold"> ×{cart[o.id]}</span> : null}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </Card>

              <Card className="p-5 lg:sticky lg:top-6">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[15px] font-semibold text-ink">This sale</h2>
                  <button type="button" onClick={() => setCustomForm(f => f ? null : { name: '', amount: '' })} aria-expanded={!!customForm} className={LINK}>Custom amount</button>
                </div>
                {customForm && (
                  <form className="mt-2 bg-paper/70 rounded-md p-3 flex flex-wrap gap-2 items-end" onSubmit={e => {
                    e.preventDefault();
                    const c = toCents(customForm.amount);
                    if (!customForm.name.trim() || !c) { setError('Give the custom amount a name and a price.'); return; }
                    setCustoms(cs => [...cs, { key: `c${Date.now()}`, name: customForm.name.trim().slice(0, 60), priceCents: c, quantity: 1 }]);
                    setCustomForm(null); setError('');
                  }}>
                    <input value={customForm.name} onChange={e => setCustomForm({ ...customForm, name: e.target.value })} placeholder="What it is" aria-label="Custom amount name" maxLength={60} className={INPUT + ' flex-1 min-w-[8rem]'} autoFocus />
                    <div className="relative w-24"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                      <input value={customForm.amount} onChange={e => setCustomForm({ ...customForm, amount: e.target.value })} inputMode="decimal" aria-label="Custom amount price" className={INPUT + ' w-full pl-6'} /></div>
                    <button type="submit" className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-[13px] px-3 py-2">Add</button>
                  </form>
                )}
                {empty ? <p className="text-sm text-ink-soft mt-2">Tap or scan items to add them.</p> : (
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
                    {pickedRounds.map(o => (
                      <li key={o.bookingId} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate text-ink">{clock(o.time)} round · {o.golferName} · {o.players}</span>
                        <span className="flex items-center gap-3 shrink-0">
                          <button onClick={() => setPicked(p => p.filter(x => x !== o.bookingId))} className="text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2">Remove</button>
                          <span className="w-16 text-right tabular-nums text-ink">{usd(owed(o))}</span>
                        </span>
                      </li>
                    ))}
                    {walkIns.map(w => (
                      <li key={w.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate text-ink">{clock(w.time)} walk-in · {w.golferName} · {w.players}{w.cart ? ' · cart' : ''}</span>
                        <span className="flex items-center gap-3 shrink-0">
                          <button onClick={() => setWalkIns(ws => ws.filter(x => x.key !== w.key))} className="text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2">Remove</button>
                          <span className="w-16 text-right tabular-nums text-ink">{usd(w.estimateCents)}</span>
                        </span>
                      </li>
                    ))}
                    {customs.map(c => (
                      <li key={c.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate text-ink">{c.name}</span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => addCustom(c.key, -1)} aria-label={`One fewer ${c.name}`} className="w-7 h-7 rounded-md border border-line text-ink-soft hover:text-ink">−</button>
                          <span className="w-6 text-center tabular-nums">{c.quantity}</span>
                          <button onClick={() => addCustom(c.key, 1)} aria-label={`One more ${c.name}`} className="w-7 h-7 rounded-md border border-line text-ink-soft hover:text-ink">+</button>
                          <span className="w-16 text-right tabular-nums text-ink">{usd(c.priceCents * c.quantity)}</span>
                        </span>
                      </li>
                    ))}
                    {priced && priced.discountCents > 0 && <li className="flex justify-between py-2 text-sm text-ink-soft"><span>Discount{discount?.note.trim() ? ` (${discount.note.trim()})` : ''}</span><span className="tabular-nums">−{usd(priced.discountCents)}</span></li>}
                    {priced && priced.taxCents > 0 && <li className="flex justify-between py-2 text-sm text-ink-soft"><span>Sales tax</span><span className="tabular-nums">{usd(priced.taxCents)}</span></li>}
                    <li className="flex justify-between py-2.5 text-[15px] font-semibold text-ink"><span>Total</span><span className="tabular-nums">{ready ? usd(due) : <span className="text-ink-muted font-normal text-sm">Working out the total…</span>}</span></li>
                  </ul>
                )}

                {!itemsEmpty && canDiscount && (
                  discount === null
                    ? <button type="button" onClick={() => setDiscount({ mode: 'percent', value: '', note: '' })} className={LINK + ' mt-2'}>Add a discount</button>
                    : (
                      <div className="mt-2 bg-paper/70 rounded-md p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex gap-1" role="group" aria-label="Discount as">
                            {(['percent', 'amount'] as const).map(m => (
                              <button key={m} type="button" aria-pressed={discount.mode === m} onClick={() => setDiscount({ ...discount, mode: m })}
                                className={'px-2.5 py-1 rounded-md border text-[12.5px] ' + (discount.mode === m ? 'border-pine/40 bg-white text-ink font-medium' : 'border-line bg-white text-ink-soft')}>{m === 'percent' ? '% off' : '$ off'}</button>
                            ))}
                          </div>
                          <input value={discount.value} onChange={e => setDiscount({ ...discount, value: e.target.value })} inputMode="decimal" aria-label={discount.mode === 'percent' ? 'Percent off' : 'Dollars off'} placeholder={discount.mode === 'percent' ? '10' : '5.00'} className={INPUT + ' w-20'} />
                          <button type="button" onClick={() => setDiscount(null)} className="text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2">Remove</button>
                        </div>
                        <input value={discount.note} onChange={e => setDiscount({ ...discount, note: e.target.value })} maxLength={120} placeholder="Why (for your records, shown on the receipt)" aria-label="Discount reason" className={INPUT + ' w-full'} />
                      </div>
                    )
                )}

                {!empty && (
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5" role="radiogroup" aria-label="How they pay">
                      {payChoices.map(([k, label]) => (
                        <label key={k} className={'flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer text-sm text-ink ' + (pay === k ? 'border-pine/40' : 'border-line')}>
                          <input type="radio" name="pay" checked={pay === k} onChange={() => setPay(k)} className="accent-pine" />{label}
                        </label>
                      ))}
                    </div>
                    {pay === 'reader' && readers.length > 1 && (
                      <select value={readerId} onChange={e => setReaderId(e.target.value)} aria-label="Card reader" className={INPUT + ' w-full'}>
                        {readers.map(x => <option key={x.id} value={x.id}>{x.label}{x.online ? '' : ' (offline)'}</option>)}
                      </select>
                    )}
                    {pay === 'reader' && <p className="text-[12.5px] text-ink-muted">The reader asks for the card. The money goes to your Stripe account.</p>}
                    {hasRounds && <p className="text-[12.5px] text-ink-muted">{pay === 'reader'
                      ? 'The group pays their round by card, booking fee included — the same as paying online — and is checked in when the card goes through.'
                      : 'In cash, each group is checked in and marked paid at the counter on the tee sheet. One group on its own (no items) can go on the card reader. Discounts apply to shop items only.'}</p>}
                    {pay === 'cash' && ready && due > 0 && (
                      <div>
                        <span className="block text-[13px] font-medium text-ink mb-1.5">Cash handed over <span className="font-normal text-ink-muted">(optional)</span></span>
                        <div className="flex flex-wrap gap-1.5">
                          {quickCash.map(n => (
                            <button key={n} type="button" onClick={() => setTendered((n / 100).toFixed(2))} aria-pressed={tenderedCents === n}
                              className={'px-2.5 py-1.5 rounded-md border text-[13px] tabular-nums ' + (tenderedCents === n ? 'border-pine/40 text-ink font-medium' : 'border-line text-ink-soft hover:text-ink')}>{n === due ? 'Exact' : usd(n)}</button>
                          ))}
                          <div className="relative w-24"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                            <input value={tendered} onChange={e => setTendered(e.target.value)} inputMode="decimal" aria-label="Cash handed over" className={INPUT + ' w-full pl-6'} /></div>
                        </div>
                        {tenderedCents > 0 && (tenderedCents >= due
                          ? <p className="text-[15px] font-semibold text-ink mt-2">Change: <span className="tabular-nums">{usd(tenderedCents - due)}</span></p>
                          : <p className="text-[13px] text-bad mt-2">That’s {usd(due - tenderedCents)} short.</p>)}
                      </div>
                    )}
                    {(pay === 'sms' || pay === 'email') && (
                      <div className="space-y-2">
                        <input value={customer.name} onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))} placeholder="Name (optional)" aria-label="Customer name" className={INPUT + ' w-full'} />
                        {pay === 'sms'
                          ? <input value={customer.phone} onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))} placeholder="Mobile number" type="tel" aria-label="Mobile number" className={INPUT + ' w-full'} />
                          : <input value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} placeholder="Email address" type="email" aria-label="Email address" className={INPUT + ' w-full'} />}
                        <p className="text-[12.5px] text-ink-muted">They pay on their phone with Apple Pay, Google Pay or a card. The money goes to your Stripe account.</p>
                      </div>
                    )}
                    {quoteError && <p className="text-[13px] text-bad" role="alert">{quoteError} <button type="button" onClick={() => { setQuoteError(''); setQuoteTry(n => n + 1); }} className="underline font-medium">Try again</button></p>}
                    <button onClick={ringUp} disabled={busy === 'sale' || needContact || !ready || (pay === 'cash' && tenderedCents > 0 && tenderedCents < due) || (pay === 'reader' && (!readerId || onReader?.state === 'waiting' || roundOnReader?.state === 'waiting'))}
                      className="w-full bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-sm py-2.5 disabled:opacity-50">
                      {busy === 'sale' ? 'Saving…' : pay === 'cash' ? `Take ${usd(due)} cash` : pay === 'reader' ? `Charge ${usd(due)} on the reader` : `Send ${usd(due)} pay link`}
                    </button>
                  </div>
                )}
                {roundOnReader && (
                  <div className={'mt-4 border-l-[3px] pl-3 space-y-2 ' + (roundOnReader.state === 'waiting' ? 'border-warn' : 'border-bad')} role="status" aria-live="polite">
                    <p className="text-[14px] text-ink">
                      {roundOnReader.state === 'waiting'
                        ? <>{roundOnReader.dueCents > 0 && <span className="font-semibold tabular-nums">{usd(roundOnReader.dueCents)} </span>}{roundOnReader.label} on {readerName(roundOnReader.readerId)} — waiting for the card.</>
                        : <>{roundOnReader.label} — not paid. {roundOnReader.message}</>}
                    </p>
                    {roundOnReader.state === 'waiting' && roundOnReader.message && <p className="text-[12.5px] text-ink-muted">{roundOnReader.message}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {roundOnReader.state === 'waiting'
                        ? <button type="button" onClick={() => roundReaderAct('cancel')} disabled={busy === 'reader'} className="text-[12.5px] text-bad hover:underline disabled:opacity-50">Cancel on the reader</button>
                        : <button type="button" onClick={() => roundToReader(roundOnReader)} disabled={busy === 'sale'} className={LINK}>Try the reader again</button>}
                      {roundOnReader.state === 'waiting' && testMode && readers.find(x => x.id === roundOnReader.readerId)?.simulated && (
                        <>
                          <button type="button" onClick={() => roundReaderAct('simulate', 'ok')} disabled={busy === 'reader'} className={LINK}>Simulate a tap</button>
                          <button type="button" onClick={() => roundReaderAct('simulate', 'declined')} disabled={busy === 'reader'} className={LINK}>Simulate a decline</button>
                        </>
                      )}
                      {roundOnReader.state !== 'waiting' && <button type="button" onClick={() => setRoundOnReader(null)} className="text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2">Close</button>}
                    </div>
                  </div>
                )}
                {onReader && (
                  <div className={'mt-4 border-l-[3px] pl-3 space-y-2 ' + (onReader.state === 'waiting' ? 'border-warn' : 'border-bad')} role="status" aria-live="polite">
                    <p className="text-[14px] text-ink">
                      {onReader.state === 'waiting'
                        ? <><span className="font-semibold tabular-nums">{usd(onReader.sale.totalCents)}</span> on {readerName(onReader.readerId)} — waiting for the card.</>
                        : <><span className="font-semibold tabular-nums">{usd(onReader.sale.totalCents)}</span> not paid. {onReader.message}</>}
                    </p>
                    {onReader.state === 'waiting' && onReader.message && <p className="text-[12.5px] text-ink-muted">{onReader.message}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {onReader.state === 'waiting'
                        ? <button type="button" onClick={() => readerAct('reader_cancel')} disabled={busy === 'reader'} className="text-[12.5px] text-bad hover:underline disabled:opacity-50">Cancel on the reader</button>
                        : <button type="button" onClick={() => readerAct('reader_start')} disabled={busy === 'reader'} className={LINK}>Try the reader again</button>}
                      {onReader.state === 'waiting' && testMode && readers.find(x => x.id === onReader.readerId)?.simulated && (
                        <>
                          <button type="button" onClick={() => readerAct('reader_simulate', 'ok')} disabled={busy === 'reader'} className={LINK}>Simulate a tap</button>
                          <button type="button" onClick={() => readerAct('reader_simulate', 'declined')} disabled={busy === 'reader'} className={LINK}>Simulate a decline</button>
                        </>
                      )}
                      {onReader.state !== 'waiting' && canCash && <button type="button" onClick={() => act(onReader.sale, 'paid_cash')} disabled={!!busy} className={LINK}>Took cash instead</button>}
                      {onReader.state !== 'waiting' && <button type="button" onClick={() => act(onReader.sale, 'void')} disabled={!!busy} className="text-[12.5px] text-bad hover:underline disabled:opacity-50">Void</button>}
                    </div>
                  </div>
                )}
                {justPaid && (
                  <div className="mt-4 border-l-[3px] border-ok pl-3 space-y-2">
                    <p className="text-[14px] text-ink"><span className="font-semibold tabular-nums">{usd(justPaid.totalCents)}</span> {justPaid.status === 'paid_card' ? 'paid by card' : 'in cash'} — recorded.
                      {justPaid.cashTenderedCents != null && <> Change: <span className="font-semibold tabular-nums">{usd(justPaid.cashTenderedCents - justPaid.totalCents)}</span>.</>}</p>
                    {receipt?.id === justPaid.id && <ReceiptForm receipt={receipt} setReceipt={setReceipt} onSend={sendReceipt} busy={busy === 'receipt' + justPaid.id} onSkip={() => { setReceipt(null); setJustPaid(null); }} />}
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
                    const itemsCents = s.totalCents - (s.roundsCents ?? 0);
                    const fully = isPaid(s) && itemsCents > 0 && s.refundedCents >= itemsCents;
                    // A sale rung up for the card reader, not paid yet (declined or cancelled), or on the reader now.
                    const base = !s.link && s.status === 'open' ? { label: 'Not paid — card reader', tone: 'warn' as const } : !s.link && s.status === 'paying' ? { label: 'On the card reader', tone: 'warn' as const } : STATUS[s.status];
                    const st = fully ? { label: 'Refunded', tone: 'neutral' as const } : s.refundedCents > 0 ? { label: `${base?.label ?? s.status} · ${usd(s.refundedCents)} refunded`, tone: 'ok' as const } : base ?? { label: s.status, tone: 'neutral' as const };
                    // Green fees in the sale are refunded from their booking, not here.
                    const left = itemsCents - s.refundedCents;
                    const pending = s.refunds.filter(r => r.status === 'pending');
                    return (
                      <li key={s.id} className="px-5 py-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-ink"><span className="tabular-nums text-ink-soft">{time(s.createdAt)}</span> · <span className="font-medium tabular-nums">{usd(s.totalCents)}</span>{s.customerName ? ` · ${s.customerName}` : ''}</div>
                          <div className="text-[12.5px] text-ink-muted truncate">{s.lines.map(l => `${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`).join(', ')}{s.discountCents ? ` · ${usd(s.discountCents)} off${s.discountNote ? ` (${s.discountNote})` : ''}` : ''}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <StatusDot status={st.tone} label={st.label} />
                          {isPaid(s) && <button onClick={() => { setReceipt(receipt?.id === s.id ? null : { id: s.id, via: s.customerEmail || !s.customerPhone ? 'email' : 'sms', to: s.customerEmail || s.customerPhone }); setError(''); }} disabled={!!busy} className={LINK}>Receipt</button>}
                          {isPaid(s) && canRefund && left > 0 && <button onClick={() => { setRefund(refund?.id === s.id ? null : { id: s.id, amount: (left / 100).toFixed(2), reason: '', restock: false, confirm: false }); setError(''); }} disabled={!!busy} className={LINK}>Refund</button>}
                          {s.status === 'open' && (
                            <>
                              {s.link
                                ? <button onClick={() => act(s, 'resend', s.customerPhone ? 'sms' : 'email')} disabled={!!busy} className="text-[12.5px] text-pine font-medium hover:underline disabled:opacity-50">Send again</button>
                                : readers.length > 0 && <button onClick={() => { setOnReader({ sale: s, readerId: readerId || readers[0].id, state: 'cancelled', message: '' }); setError(''); }} disabled={!!busy || onReader?.state === 'waiting'} className="text-[12.5px] text-pine font-medium hover:underline disabled:opacity-50">Card reader</button>}
                              {canCash && <button onClick={() => act(s, 'paid_cash')} disabled={!!busy} className="text-[12.5px] text-pine font-medium hover:underline disabled:opacity-50">Took cash</button>}
                              <button onClick={() => act(s, 'void')} disabled={!!busy} className="text-[12.5px] text-bad hover:underline disabled:opacity-50">Void</button>
                            </>
                          )}
                        </div>
                        </div>
                        {pending.map(r => (
                          <div key={r.id} className="flex flex-wrap items-center gap-3 mt-1.5 text-[12.5px]">
                            <StatusDot status="warn" label={`Refund ${usd(r.amountCents)} not confirmed by Stripe yet`} />
                            {canRefund && <button onClick={() => retryRefund(s, r.id)} disabled={!!busy} className={LINK}>{busy === 'retry' + r.id ? 'Asking Stripe…' : 'Try again'}</button>}
                          </div>
                        ))}
                        {receipt?.id === s.id && justPaid?.id !== s.id && (
                          <div className="mt-2 max-w-md"><ReceiptForm receipt={receipt} setReceipt={setReceipt} onSend={sendReceipt} busy={busy === 'receipt' + s.id} onSkip={() => setReceipt(null)} skipLabel="Close" /></div>
                        )}
                        {refund?.id === s.id && (
                          <div className="mt-2 bg-paper/70 rounded-md p-3 space-y-2 max-w-md">
                            <div className="grid grid-cols-[110px_1fr] gap-2">
                              <label className="block"><span className="block text-[12.5px] font-medium text-ink mb-1">Amount</span>
                                <div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                                  <input value={refund.amount} onChange={e => setRefund({ ...refund, amount: e.target.value, confirm: false, restock: toCents(e.target.value) === itemsCents && s.refundedCents === 0 ? refund.restock : false })} inputMode="decimal" className={INPUT + ' w-full pl-6'} /></div></label>
                              <label className="block"><span className="block text-[12.5px] font-medium text-ink mb-1">Reason <span className="font-normal text-ink-muted">(for your records)</span></span>
                                <input value={refund.reason} onChange={e => setRefund({ ...refund, reason: e.target.value })} maxLength={300} className={INPUT + ' w-full'} /></label>
                            </div>
                            {s.refundedCents === 0 && toCents(refund.amount) === itemsCents && s.lines.some(l => !/ round · /.test(l.name)) && (
                              <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={refund.restock} onChange={e => setRefund({ ...refund, restock: e.target.checked })} className="accent-pine" />Put the items back on the shelf</label>
                            )}
                            <p className="text-[12.5px] text-ink-soft">{s.status === 'paid_card' ? 'Goes back to the card they paid with. It can’t be undone.' : 'Recorded only — hand the cash back yourself.'} Up to {usd(left)} can be refunded{s.roundsCents ? ' — green fees are refunded from the booking on the tee sheet' : ''}.</p>
                            <div className="flex gap-2">
                              {!refund.confirm
                                ? <button onClick={() => setRefund({ ...refund, confirm: true })} disabled={!toCents(refund.amount)} className="px-3 py-2 rounded-md text-[13px] font-medium bg-white border border-line text-ink hover:bg-paper disabled:opacity-50">Refund ${refund.amount || '0'}</button>
                                : <button onClick={() => doRefund(s)} disabled={!!busy} className="px-3 py-2 rounded-md text-[13px] font-medium bg-bad text-white disabled:opacity-50">{busy === 'refund' + s.id ? 'Refunding…' : `Yes, refund $${refund.amount}`}</button>}
                              <button onClick={() => setRefund(null)} className="px-3 py-2 rounded-md text-[13px] font-medium bg-white border border-line text-ink hover:bg-paper">Close</button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            {/* POS-3 R4: count the drawer at the end of the day. */}
            {access.can('shop.close') && <RegisterClose />}
          </div>
        )}
      </main>
    </div>
  );
}

/** POS-3: send a paid sale's receipt by email or text. */
function ReceiptForm({ receipt, setReceipt, onSend, onSkip, busy, skipLabel = 'No receipt' }: {
  receipt: { id: string; via: 'email' | 'sms'; to: string }; setReceipt: (r: { id: string; via: 'email' | 'sms'; to: string }) => void;
  onSend: () => void; onSkip: () => void; busy: boolean; skipLabel?: string;
}) {
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); onSend(); }}>
      <div className="flex gap-1" role="group" aria-label="Send the receipt by">
        {(['email', 'sms'] as const).map(v => (
          <button key={v} type="button" aria-pressed={receipt.via === v} onClick={() => setReceipt({ ...receipt, via: v, to: '' })}
            className={'px-2.5 py-1 rounded-md border text-[12.5px] ' + (receipt.via === v ? 'border-pine/40 bg-white text-ink font-medium' : 'border-line bg-white text-ink-soft')}>{v === 'email' ? 'Email' : 'Text'}</button>
        ))}
      </div>
      <input value={receipt.to} onChange={e => setReceipt({ ...receipt, to: e.target.value })} type={receipt.via === 'email' ? 'email' : 'tel'} required
        placeholder={receipt.via === 'email' ? 'Their email' : 'Their mobile'} aria-label={receipt.via === 'email' ? 'Receipt email' : 'Receipt mobile number'} className={INPUT + ' flex-1 min-w-[10rem]'} />
      <button type="submit" disabled={busy} className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-[13px] px-3 py-2 disabled:opacity-50">{busy ? 'Sending…' : 'Send receipt'}</button>
      <button type="button" onClick={onSkip} className="text-[12.5px] text-ink-soft hover:text-ink underline underline-offset-2">{skipLabel}</button>
    </form>
  );
}
