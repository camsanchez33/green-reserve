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
// and refund a paid sale (money.refund; items only with shop.return) — cash recorded, card through Stripe.
// POS-4 (Cam 2026-11-08, approved mockup: "layout wastes space · too many ways to sort · checkout is unclear · not
// like a real POS"): Register · Sales · Close out tabs. The register is big tiles under one row of category chips
// (no headings), the ticket always on the right with one Charge button, and Charge runs in steps — how they pay →
// take it → receipt. Tee times are paid on the tee sheet only (Cam: "tee times shouldnt be paid for in pro shop
// they are paid on tee times"), so the register no longer lists rounds or walk-ins; the server routes are unchanged.
import SmsConsentAsk from '@/components/dashboard/SmsConsentAsk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OperatorSidebar from '@/components/OperatorSidebar';
import { StaffNotice } from '@/components/dashboard/StaffNotice';
import { RegisterClose } from '@/components/dashboard/RegisterClose';
import { StockTab } from '@/components/dashboard/StockTab';
import { CalendarDays, Search } from 'lucide-react';
import { ShopMenu } from '@/components/dashboard/shop/ShopMenu';
import { OpenRegister } from '@/components/dashboard/OpenRegister';
import { SaleReceiptPanel } from '@/components/dashboard/shop/SaleReceiptPanel';
import { SlidingTabs } from '@/components/dashboard/SlidingTabs';
import { Card } from '@/components/ui/Card';
import { StatusDot } from '@/components/ui/StatusDot';
import { INPUT_COMPACT as INPUT } from '@/components/ui/field';
import { AccountPicker, type AccountMember } from '@/components/dashboard/AccountPicker';
import { dfetch } from '@/lib/dashboard-fetch';
import { toast } from '@/components/dashboard/Toast';
import { RegisterClosedNotice } from '@/components/dashboard/RegisterClosedNotice';
import { useDashboardAccess } from '@/lib/use-dashboard-access';
import { shopTree, matches, bySku, skuHits, stockOf, type FlatItem, type TreeItem } from '@/lib/shop-tree';

type Item = FlatItem;
type Refund = { id: string; amountCents: number; method: string; status: string; reason: string; restocked: boolean; error: string; createdAt: string };
type Sale = {
  id: string; status: string; totalCents: number; taxCents: number; createdAt: string; paidAt: string | null; customerName: string; customerPhone: string; customerEmail: string; soldBy: string;
  lines: { id: string; name: string; unitPriceCents: number; quantity: number; returnedQty: number; round: boolean }[];
  discountCents: number; discountNote: string; cashTenderedCents: number | null; refundedCents: number; receiptSentAt: string | null; refunds: Refund[];
  /** POS-3 R2: green fees in this sale — refunded from the booking, not here. */
  roundsCents: number;
  /** POS-3 R3: sent as a pay link (else rung up here — cash or the card reader). */
  link: boolean;
  /** Cam 2026-11-12: the course's running sale number (#1047); null on sales made before numbers began. */
  number?: number | null;
};
type Reader = { id: string; label: string; online: boolean; simulated: boolean };
/** A sale on the card reader: waiting for the card, or what happened. */
type ReaderSale = { sale: Sale; readerId: string; state: 'waiting' | 'declined' | 'cancelled' | 'error'; message: string };
type Custom = { key: string; name: string; priceCents: number; quantity: number };
// Cam 2026-11-12 (approved Sales; Build's decision 7): one Filter — how it was paid, then where it stands — plus the order.
type SalesShow = 'all' | 'cash' | 'reader' | 'link' | 'account' | 'paid' | 'waiting' | 'fix' | 'refunded' | 'voided';
/** What a sale counts as on the Sales tab's filter. "To fix" = a refund Stripe hasn't confirmed. */
function salesShowOf(s: Pick<Sale, 'status' | 'refundedCents' | 'refunds' | 'link'>): SalesShow[] {
  const out: SalesShow[] = ['all'];
  if (s.status === 'paid_cash') out.push('cash');
  if (s.status === 'paid_card' && !s.link) out.push('reader');
  if (s.link) out.push('link');
  if (s.status === 'paid_account') out.push('account');
  if (s.status === 'paid_cash' || s.status === 'paid_card' || s.status === 'paid_account') out.push('paid');
  if (s.status === 'open' || s.status === 'paying') out.push('waiting');
  if (s.refunds.some(r => r.status === 'pending')) out.push('fix');
  if (s.refundedCents > 0) out.push('refunded');
  if (s.status === 'void') out.push('voided');
  return out;
}
const SALES_HOW: [SalesShow, string][] = [['all', 'All'], ['cash', 'Cash'], ['reader', 'Card reader'], ['link', 'Pay link'], ['account', 'On account']];
const SALES_STATE: [SalesShow, string][] = [['paid', 'Paid'], ['waiting', 'Waiting'], ['fix', 'To fix'], ['refunded', 'Refunded'], ['voided', 'Voided']];
/** A sale's number as staff see it: the running number, or the receipt # printed on older receipts. */
const saleNo = (s: Pick<Sale, 'id' | 'number'>) => (s.number != null ? `#${s.number}` : `#${s.id.slice(-8).toUpperCase()}`);
type Discount = { mode: 'percent' | 'amount'; value: string; note: string };
type Quote = { key: string; subtotalCents: number; discountCents: number; taxCents: number; totalCents: number; taxCalculationId: string; taxUnavailable?: boolean };

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const initials = (name: string) => name.split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const toCents = (v: string) => { const n = Number(v.replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
const isPaid = (s: Sale) => s.status === 'paid_cash' || s.status === 'paid_card' || s.status === 'paid_account';
const LINK = 'text-[12.5px] text-pine font-medium hover:underline disabled:opacity-50';
// POS-4: the big choice buttons in the Charge steps (how they pay, the receipt).
const CHOICE = 'min-h-[56px] rounded-[7px] border px-3 text-[14px] font-medium text-ink text-center transition-colors disabled:opacity-50 ';
const PAY_WORDS: Record<string, string> = { cash: 'Cash', reader: 'Card reader', account: 'On account', sms: 'Text a pay link', email: 'Email a pay link' };
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  paid_cash: { label: 'Paid in cash', tone: 'ok' },
  paid_card: { label: 'Paid by card', tone: 'ok' },
  paid_account: { label: 'On account', tone: 'ok' },
  open: { label: 'Waiting on pay link', tone: 'warn' },
  paying: { label: 'Paying now', tone: 'warn' },
  void: { label: 'Voided', tone: 'neutral' },
};

/** How a sale reads on the Sales tab (Cam 2026-11-12 mockup): how it was paid, refunded, waiting or voided. */
function saleState(s: Sale): { label: string; tone: 'ok' | 'warn' | 'neutral' } {
  const itemsCents = s.totalCents - (s.roundsCents ?? 0);
  const paidHow = s.status === 'paid_card' ? (s.link ? 'Paid by card' : 'Paid by card reader') : s.status === 'paid_account' ? 'On their account' : s.status === 'paid_cash' ? 'Paid in cash' : '';
  if (paidHow && itemsCents > 0 && s.refundedCents >= itemsCents) return { label: s.status === 'paid_card' ? 'Refunded to their card' : s.status === 'paid_account' ? 'Credited to their account' : 'Refunded in cash', tone: 'neutral' };
  if (paidHow) return { label: s.refundedCents > 0 ? `${paidHow} · ${usd(s.refundedCents)} refunded` : paidHow, tone: 'ok' };
  // A sale rung up for the card reader, not paid yet (declined or cancelled), or on the reader now.
  if (!s.link && s.status === 'open') return { label: 'Not paid — card reader', tone: 'warn' };
  if (!s.link && s.status === 'paying') return { label: 'On the card reader', tone: 'warn' };
  return STATUS[s.status] ?? { label: s.status, tone: 'neutral' };
}

export default function ShopPage() {
  const access = useDashboardAccess();
  const [items, setItems] = useState<Item[] | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pay, setPay] = useState<'cash' | 'reader' | 'sms' | 'email' | 'account'>('cash');
  // MEM-ACCT 1b: the member whose account an "On account" sale goes on; whether any tier has accounts.
  const [accountMember, setAccountMember] = useState<AccountMember | null>(null);
  const [accountsOn, setAccountsOn] = useState(false);
  // POS-3 R3: the course's card readers (Settings → Pro shop) and the sale on one now.
  const [readers, setReaders] = useState<Reader[]>([]);
  const [readerId, setReaderId] = useState('');
  const [testMode, setTestMode] = useState(false);
  const [onReader, setOnReader] = useState<ReaderSale | null>(null);
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  // SMS-1: the customer said yes to texts after staff read the script. Never on by default.
  const [smsYes, setSmsYes] = useState(false);
  // Shop audit 16: a cash sale rung up without a quote — the panel then says what to collect.
  const [justNoQuote, setJustNoQuote] = useState(false);
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
  // DRAWER-1: the register sells only while it's open (null until known).
  const [regStatus, setRegStatus] = useState<'not_open' | 'open' | 'closed' | null>(null);
  // A sale refused because the register was closed meanwhile (another login closed out): read it again, so the
  // Open/Reopen card replaces the cart instead of every retry failing the same way.
  const [regKey, setRegKey] = useState(0);
  const regRefused = useCallback(() => { setRegStatus(null); setRegKey(k => k + 1); }, []);
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [tendered, setTendered] = useState('');
  const [justPaid, setJustPaid] = useState<Sale | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; via: 'email' | 'sms'; to: string } | null>(null);
  // returns: line id → how many are coming back (dead end 23: a return by item; empty = a refund by amount).
  const [refund, setRefund] = useState<{ id: string; amount: string; reason: string; restock: boolean; confirm: boolean; returns?: Record<string, string> } | null>(null);
  // Dead end 15: the register's history — a past day or a search across 90 days (null = today's list).
  const [hist, setHist] = useState<{ q: string; day: string } | null>(null);
  const [histSales, setHistSales] = useState<Sale[] | null>(null);
  const [histError, setHistError] = useState('');
  // POS-6 (Cam 2026-11-09, Sales: "make sure that it can be sorted and fixed easily and then can be found and organized
  // nicely"): which sales show (how they paid, or what needs fixing) and in what order. Client-side over the list loaded.
  const [salesShow, setSalesShow] = useState<SalesShow>('all');
  const [salesSort, setSalesSort] = useState<'new' | 'old' | 'big'>('new');
  // The sale open beside the list (none picked = the first one shown).
  const [salePick, setSalePick] = useState<string | null>(null);
  // Review 2026-11-12: below a laptop the sale's panel sits under the list — a tap brings it (and its buttons) into view.
  const saleRef = useRef<HTMLHeadingElement>(null);
  const showSale = () => {
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => { saleRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' }); saleRef.current?.focus({ preventScroll: true }); });
  };
  async function loadHistory(h: { q: string; day: string }) {
    setHist(h); setHistError('');
    if (!h.q.trim() && !h.day) { setHist(null); setHistSales(null); return; }
    const p = new URLSearchParams(); if (h.q.trim()) p.set('q', h.q.trim()); if (h.day) p.set('day', h.day);
    const r = await dfetch<{ sales: Sale[] }>(`/api/operator/shop-sales?${p}`);
    if (!r.ok) { setHistError(r.error); setHistSales(null); return; }
    setHistSales(r.data.sales);
  }
  const searchRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  // POS-4: the page's tabs, and where the sale is in the Charge steps (null = building the sale).
  const [view, setView] = useState<'register' | 'sales' | 'stock' | 'close'>('register');
  // POS-5/POS-7: the tab highlight slides to the tab picked (components/dashboard/SlidingTabs, off with reduced motion).
  const [step, setStep] = useState<null | 'pay' | 'take' | 'done'>(null);
  // A pay link just sent: the done step says where it went.
  const [linkSent, setLinkSent] = useState('');
  // The done step's receipt: Text or Email picked (then the number or address to send it to).
  const [rcptOpen, setRcptOpen] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [quoteTry, setQuoteTry] = useState(0);

  // SHOP-4: every reload of the sales also refreshes the Stock line (a sale can take the last one).
  const [loads, setLoads] = useState(0);
  // The course's midnight (its time zone), from the server: "today" here is the course's day, not the browser's.
  const [dayStart, setDayStart] = useState<number | null>(null);
  const paidToday = (paidAt: string | null | undefined) => {
    if (!paidAt) return false;
    const t = Date.parse(paidAt);
    return dayStart != null ? t >= dayStart : new Date(t).toDateString() === new Date().toDateString();
  };
  const load = useCallback(async () => {
    setLoads(n => n + 1);
    setLoadError('');
    const [i, s] = await Promise.all([
      dfetch<{ items: Item[] }>('/api/operator/shop-items'),
      dfetch<{ sales: Sale[]; dayStart?: string }>('/api/operator/shop-sales'),
    ]);
    if (!i.ok) { setLoadError(i.error); return; }
    if (!s.ok) { setLoadError(s.error); return; }
    setItems(i.data.items.filter(x => x.active));
    setSales(s.data.sales);
    if (s.data.dayStart) setDayStart(Date.parse(s.data.dayStart));
    // Readers are optional: a course without one (or Stripe down) still sells in cash and by link.
    const rd = await dfetch<{ readers: Reader[]; testMode: boolean }>('/api/operator/card-readers');
    if (rd.ok) { setReaders(rd.data.readers); setTestMode(rd.data.testMode); setReaderId(id => rd.data.readers.some(x => x.id === id) ? id : rd.data.readers[0]?.id ?? ''); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const tree = useMemo(() => shopTree(items ?? []).filter(i => !i.parentId), [items]);
  const categories = useMemo(() => [...new Set(tree.map(i => i.category || 'Other'))].sort(), [tree]);
  // POS-4: one flat list of tiles — the chip filters it; "All" keeps them in category order. No headings.
  const shown = useMemo(() => tree
    .filter(it => matches(it, q) && (!cat || (it.category || 'Other') === cat))
    .sort((a, b) => (a.category || 'Other').localeCompare(b.category || 'Other')), [tree, q, cat]);
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
  const itemsEmpty = salePayload.length === 0;
  const due = itemsEmpty ? 0 : priced ? priced.totalCents : subtotal;
  // Stripe Tax down: cash still goes through, with no tax (Cam 2026-10-29); a pay link or the reader waits.
  const noTax = !itemsEmpty && !!priced?.taxUnavailable;
  // Shop audit 16 (Cam: "never block cash"): if the total with tax can't be worked out (the quote errored or is
  // rate-limited), cash still goes through — the server works the tax out and the sale shows what to collect.
  // The total with tax can't be worked out right now: cash (and only cash) still goes through.
  const quoteDown = !itemsEmpty && !priced && !!quoteError;
  const cashNoQuote = pay === 'cash' && quoteDown;
  const ready = !itemsEmpty && ((!!priced && (!noTax || pay === 'cash' || pay === 'account')) || cashNoQuote);
  const tenderedCents = toCents(tendered);
  const add = (id: string, d: number) => setCart(c => { const q = Math.max(0, Math.min(99, (c[id] ?? 0) + d)); const n = { ...c }; if (q) n[id] = q; else delete n[id]; return n; });
  // POS-8 (Cam 2026-11-09: "shouldnt be able to sell a sold out item?"; picked "Warn, Sell anyway"): at a count of 0
  // the register asks before adding one — the shelf may hold what the count missed. Asked once per item per sale.
  const [outAsk, setOutAsk] = useState<string | null>(null);
  const [outOk, setOutOk] = useState<Set<string>>(new Set());
  const leftOf = (id: string) => { const it = (items ?? []).find(x => x.id === id); return it?.stockCount == null ? null : it.stockCount - (cart[id] ?? 0); };
  function tryAdd(id: string) {
    const l = leftOf(id);
    if (l !== null && l <= 0 && !outOk.has(id)) { setOutAsk(id); return false; }
    add(id, 1); return true;
  }
  const addCustom = (key: string, d: number) => setCustoms(cs => cs.map(c => c.key === key ? { ...c, quantity: Math.max(0, Math.min(99, c.quantity + d)) } : c).filter(c => c.quantity > 0));
  const empty = itemsEmpty;
  // The sale panel shows once something is in it, and while it is being charged or on the reader.
  const saleOpen = !empty || step !== null || !!onReader;

  // A scanner types the code and presses Enter: an exact SKU goes straight into the sale.
  function scan(code: string) {
    const hit = bySku(items ?? [], code);
    if (hit) { setQ(''); setError(''); if (tryAdd(hit.id)) setNote(`Added ${hit.name}.`); else setNote(''); return true; }
    // Two items with one code: say so instead of adding nothing silently.
    if (skuHits(items ?? [], code).length > 1) { setError(`Code ${code.trim()} is on two items.`); return true; }
    return false;
  }
  // Shop audit 10: a scan that matches nothing said nothing — the cashier thought it rang up.
  function noMatch(code: string) {
    setNote('');
    setError(`No item has the code ${code.trim()}.`);
  }

  // SHOP-4 (Cam 2026-10-30, "scan to add"): a scanner works anywhere on the register,
  // not only in the search box. A scanner types fast and ends with Enter; a person
  // typing in a field is left alone.
  const scanRef = useRef(scan);
  scanRef.current = scan;
  const noMatchRef = useRef(noMatch);
  noMatchRef.current = noMatch;
  useEffect(() => {
    let buf = '', last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      if (now - last > 60) buf = '';
      last = now;
      if (e.key === 'Enter') { if (buf.length >= 3) { e.preventDefault(); if (!scanRef.current(buf)) noMatchRef.current(buf); } buf = ''; return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function ringUp() {
    setBusy('sale'); setError(''); setNote(''); setJustPaid(null);
    const r = await dfetch<{ sale: Sale; sent?: boolean; sendError?: string; readerError?: string; skipped?: string[]; notes?: string[] }>('/api/operator/shop-sales', {
      method: 'POST',
      body: JSON.stringify({
        lines: salePayload, discount: itemsEmpty ? undefined : discountPayload,
        pay: pay === 'cash' || pay === 'reader' || pay === 'account' ? pay : 'link', membershipId: pay === 'account' ? accountMember?.id : undefined, via: pay === 'email' ? 'email' : 'sms', readerId: pay === 'reader' ? readerId : undefined, taxCalculationId: priced?.taxCalculationId || undefined,
        cashTenderedCents: pay === 'cash' && tenderedCents && !cashNoQuote ? tenderedCents : undefined,
        // The total on screen: if the tax has changed since, nothing is rung up and the new total shows.
        expectedItemsCents: (pay === 'cash' || pay === 'account') && !itemsEmpty && priced ? priced.totalCents : undefined,
        customerName: customer.name, customerPhone: customer.phone, customerEmail: customer.email,
        ...(pay === 'sms' && smsYes ? { smsConsent: 'verbal' } : {}),
      }),
    });
    setBusy('');
    if (!r.ok) {
      setError(r.error);
      // The tax changed since the total was shown: work the total out again.
      if (r.status === 409 && /sales tax changed/.test(r.error)) { setQuoteTry(n => n + 1); setStep(null); }
      return;
    }
    setCart({}); setCustoms([]); setDiscount(null); setTendered(''); setCustomer({ name: '', phone: '', email: '' }); setSmsYes(false); setAccountMember(null); setOutOk(new Set()); setOutAsk(null);
    if (r.data.skipped?.length) setError(`Not rung up: ${r.data.skipped.join(' ')} The total shown is what was taken.`);
    if (r.data.notes?.length) setNote(r.data.notes.join(' '));
    if (pay === 'reader') setOnReader({ sale: r.data.sale, readerId, state: r.data.readerError ? 'error' : 'waiting', message: r.data.readerError ?? '' });
    else if (r.data.sendError) { setError(`Sale saved, but ${r.data.sendError.charAt(0).toLowerCase()}${r.data.sendError.slice(1)} Send it again from Sales, or take cash.`); setStep(null); }
    else if (pay === 'cash' || pay === 'account') { setJustPaid(r.data.sale); setJustNoQuote(cashNoQuote); setReceipt({ id: r.data.sale.id, via: 'email', to: r.data.sale.customerEmail || '' }); setStep('done'); }
    else { setLinkSent(`Pay link ${pay === 'sms' ? 'texted' : 'emailed'}. It shows under Sales once paid.`); setStep('done'); }
    load();
    searchRef.current?.focus();
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
    setStep('done');
    load();
  }
  // POS-4: the done step's "New sale" — back to an empty ticket.
  function newSale() { setStep(null); setJustPaid(null); setReceipt(null); setRcptOpen(false); setLinkSent(''); setNote(''); setError(''); searchRef.current?.focus(); }

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
    // Said where the user is (the panel can be far down the Sales list), and at the top as before.
    if (!r.ok) { setError(r.error); toast(r.error, 'bad'); return; }
    setNote(`Receipt ${receipt.via === 'sms' ? 'texted' : 'emailed'}.`);
    toast(`Receipt ${receipt.via === 'sms' ? 'texted' : 'emailed'}.`, 'ok');
    const fromDone = step === 'done' && justPaid?.id === receipt.id;
    setReceipt(null); setJustPaid(null); setRcptOpen(false);
    if (fromDone) setStep(null);
    load();
  }

  async function doRefund(sale: Sale) {
    if (!refund) return;
    setBusy('refund' + sale.id); setError(''); setNote('');
    const lines = Object.entries(refund.returns ?? {}).map(([lineId, q]) => ({ lineId, quantity: Number(q) })).filter(l => l.quantity > 0);
    const r = await dfetch<{ status: 'done' | 'pending' }>('/api/operator/shop-sales', { method: 'PATCH', body: JSON.stringify(lines.length
      ? { id: sale.id, action: 'refund', lines, reason: refund.reason, restock: refund.restock }
      : { id: sale.id, action: 'refund', amountCents: toCents(refund.amount), reason: refund.reason, restock: refund.restock }) });
    setBusy('');
    if (!r.ok) { setError(r.error); load(); return; }
    setRefund(null);
    setNote(r.data.status === 'pending' ? 'Sent to Stripe — not confirmed yet.' : sale.status === 'paid_card' ? 'Refunded to their card.' : sale.status === 'paid_account' ? 'Credited.' : 'Hand the cash back.');
    load(); if (hist) loadHistory(hist);
  }

  async function retryRefund(sale: Sale, refundId: string) {
    setBusy('retry' + refundId); setError(''); setNote('');
    const r = await dfetch<{ status: 'done' | 'pending' }>('/api/operator/shop-sales', { method: 'PATCH', body: JSON.stringify({ id: sale.id, action: 'refund_retry', refundId }) });
    setBusy('');
    if (!r.ok) { setError(r.error); load(); return; }
    setNote(r.data.status === 'done' ? 'Refund went through.' : 'Stripe still hasn’t confirmed it — try again in a few minutes.');
    load();
  }

  async function act(sale: Sale, action: 'void' | 'paid_cash' | 'resend' | 'void_cash', via?: 'sms' | 'email') {
    if (action === 'void' && !confirm(`Void this ${usd(sale.totalCents)} sale?${sale.link ? ' The pay link stops working.' : ''}`)) return;
    if (action === 'void_cash' && !confirm(`Void this ${usd(sale.totalCents)} sale?${sale.status === 'paid_cash' ? ' Hand the cash back.' : ''}`)) return;
    if (onReader?.sale.id === sale.id) setOnReader(null);
    setBusy(sale.id); setError(''); setNote('');
    const r = await dfetch('/api/operator/shop-sales', { method: 'PATCH', body: JSON.stringify({ id: sale.id, action, via }) });
    setBusy('');
    if (!r.ok) { setError(r.error); load(); return; }
    setNote(action === 'void' || action === 'void_cash' ? 'Sale voided.' : action === 'paid_cash' ? 'Recorded as paid in cash.' : 'Pay link sent again.');
    load(); if (hist) loadHistory(hist);
  }

  const canSell = access.can('shop.sell');
  const canDiscount = access.can('shop.discount');
  const canRefund = access.can('money.refund');
  // Launch walk (Cam 2026-10-31): "Return items" takes items back; a typed amount needs Issue refunds.
  const canReturn = canRefund || access.can('shop.return');
  // Recording cash is the counter-payment power, as on the tee sheet.
  const canCash = access.can('sheet.counter_payment');
  const payChoices = (['reader', 'cash', 'account', 'sms', 'email'] as const)
    .filter(k => (k !== 'cash' || canCash) && (k !== 'reader' || readers.length > 0) && (k !== 'account' || (canCash && accountsOn)));
  // MEM-ACCT 1b: "On account" shows only when some tier has member accounts on.
  useEffect(() => {
    if (!access.loaded || !canCash) return;
    // Audit 2026-10-31: a failed check says so, rather than quietly dropping the choice.
    dfetch<{ members: AccountMember[] }>('/api/operator/member-accounts?q=').then(r => {
      setAccountsOn(r.ok && r.data.members.length > 0);
      if (!r.ok) setError(r.error);
    });
  }, [access.loaded, canCash]);
  useEffect(() => { if (access.loaded && !canCash) setPay(p => (p === 'cash' ? (readers.length ? 'reader' : 'sms') : p)); }, [access.loaded, canCash, readers.length]);
  useEffect(() => { if (pay === 'reader' && !readers.length) setPay(canCash ? 'cash' : 'sms'); }, [pay, readers.length, canCash]);
  const readerName = (id: string) => readers.find(x => x.id === id)?.label ?? 'the card reader';
  const needContact = pay === 'sms' ? customer.phone.replace(/\D/g, '').length < 10 : pay === 'email' ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email.trim()) : false;
  // Accuracy (figures audit 2026-11-08): the shop's "today" is what the shop sold — green fees taken in cash on the
  // tee sheet ring through the register (CASH-1) but are counted in the sheet's Paid, so they are left out here
  // (the same rule as Analytics' walk-up shop figure). Refunds on a sale are items only (green fees refund on the booking).
  // Build 2026-11-12 (decision 5): "taken" is paid less refunds; the count leaves out voided and still-waiting sales.
  // Today's list also carries older sales still waiting; only what was paid on the course's day counts for today.
  const takenOf = (list: Sale[], today: boolean) => { const paid = list.filter(s => isPaid(s) && (!today || paidToday(s.paidAt)) && s.totalCents - (s.roundsCents ?? 0) > 0); return { count: paid.length, cents: paid.reduce((t, s) => t + s.totalCents - (s.roundsCents ?? 0) - s.refundedCents, 0) }; };
  // A sale that changed under the steps (emptied, or the total is being worked out again) goes back to building.
  useEffect(() => { if ((step === 'pay' || step === 'take') && empty && !onReader) setStep(null); }, [step, empty, onReader]);
  const chargeLabel = cashNoQuote ? 'Charge' : `Charge ${usd(due)}`;
  const takeDisabled = !payChoices.some(k => k === pay) || busy === 'sale' || needContact || !ready || (pay === 'cash' && !cashNoQuote && tenderedCents > 0 && tenderedCents < due) || (pay === 'account' && !accountMember) || (pay === 'reader' && (!readerId || onReader?.state === 'waiting'));
  // Quick cash amounts: the exact total, then the next notes up.
  const quickCash = [due, ...[2000, 5000, 10000].filter(n => n > due)].filter((n, i, a) => n > 0 && a.indexOf(n) === i).slice(0, 4);

  return (
    <div className="flex flex-col min-h-screen md:h-screen bg-page md:overflow-hidden">
      <OperatorSidebar active="shop" />
      <main className="flex-1 md:overflow-y-auto pb-24 md:pb-8">
        {access.loaded && !canSell && access.can('shop.catalog') ? (
          // POS-6: a login that edits the catalog but doesn't sell gets Stock alone (it used to edit items in Settings).
          <div className="px-4 sm:px-8 py-6">
            <h1 className="font-serif text-[30px] sm:text-[34px] font-semibold leading-none text-ink">Stock</h1>
            <div className="mt-5"><StockTab /></div>
          </div>
        ) : access.loaded && !canSell ? <StaffNotice what="the pro shop" view="shop.sell" /> : (
          <div className="px-4 sm:px-8 py-6">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <h1 className="font-serif text-[30px] sm:text-[34px] font-semibold leading-none text-ink">Pro shop</h1>
              <SlidingTabs look="line" label="Pro shop" value={view} onChange={k => { if (k !== view) { setError(''); setNote(''); } setView(k); }}
                tabs={[['register', 'Register'], ['sales', 'Sales'],
                  ...((access.can('shop.sell') || access.can('shop.catalog')) ? [['stock', 'Stock'] as const] : []),
                  ...(access.can('shop.close') ? [['close', 'Close out'] as const] : [])] as [typeof view, string][]} />
            </div>

            {loadError && (
              <div className="mt-4 bg-bad/5 border border-bad/20 rounded-md px-4 py-3 text-sm text-bad flex items-center justify-between gap-3" role="alert">
                <span>{loadError}</span>
                <button onClick={load} className="text-xs font-medium underline shrink-0">Retry</button>
              </div>
            )}

            {/* Review 2026-11-12: with nothing in the sale the sale panel isn't there, so the register's errors and notes
                (a pay link that didn't send, a scan that matched nothing, "Took cash instead") show up here instead. */}
            {(view !== 'register' || !saleOpen) && (error || note) && (
              <div className="mt-4" aria-live="polite">
                {error && <p className="bg-bad/5 border border-bad/20 rounded-md px-4 py-3 text-[13px] text-bad" role="alert">{error}</p>}
                {note && <p className="text-[13px] text-ok flex items-center gap-1.5"><StatusDot status="ok" />{note}</p>}
              </div>
            )}

            {/* DRAWER-1 (Cam 2026-11-09: "shouldn't be able to start taking charges until the register is open"): until
                it's open (or reopened after a close-out) the register shows only the opening — the server refuses sales too. */}
            {view === 'register' && <div className="mt-5 space-y-3"><RegisterClosedNotice onRefused={regRefused} /><OpenRegister key={regKey} where="register" onStatus={setRegStatus} /></div>}
            {view === 'register' && regStatus === 'open' && (
            // Cam 2026-11-12 (approved Register): with nothing in the sale the items take the whole width; the sale opens
            // beside them on the first tap (and stays while it is being charged).
            <div className={'mt-5 grid gap-4 lg:items-start ' + (saleOpen ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : '')}>
              <Card className="p-4 relative z-10">
                {!items && !loadError && <p className="text-sm text-ink-muted">Loading your shop…</p>}
                {items && items.length === 0 && (
                  <p className="text-sm text-ink-soft">No items yet.{(access.can('shop.sell') || access.can('shop.catalog')) && <> <button type="button" onClick={() => setView('stock')} className="text-pine font-medium underline">Add on Stock</button>.</>}</p>
                )}
                {tree.length > 0 && (
                  <div className="space-y-2.5 mb-3">
                    <label className="flex items-center gap-2 bg-page op-well border border-line rounded-[10px] px-3 min-h-[44px] text-ink-muted">
                      <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const t = q.trim(); if (scan(q) || !t) return; if (!tree.some(i => matches(i, q))) noMatch(q); else setNote(''); } }}
                        aria-label="Find or scan an item" className="flex-1 min-w-0 bg-transparent text-[14px] text-ink outline-none" />
                    </label>
                    {/* Cam 2026-11-12: one Filter button; the categories are in its menu. */}
                    {categories.length > 1 && <ShopMenu label={cat ? `Filter: ${cat}` : 'Filter'} ariaLabel="Filter by category" onPick={k => setCat(k)}
                      sections={[[{ key: '', label: 'All', on: !cat }, ...categories.map(c => ({ key: c, label: c, on: cat === c }))]]} />}
                  </div>
                )}
                {outAsk && (() => { const it = (items ?? []).find(x => x.id === outAsk); return it && (
                  <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-[7px] border-l-[3px] border-warn bg-white shadow-card px-3 py-2.5 text-[13.5px]">
                    <span className="text-ink mr-auto"><b>{it.name}</b> — none left by the count. Sell anyway?</span>
                    <button type="button" autoFocus onClick={() => { setOutOk(o => new Set(o).add(it.id)); add(it.id, 1); setOutAsk(null); searchRef.current?.focus(); }} className="bg-pine hover:bg-pine-hover text-white font-medium rounded-md text-[13px] px-3 py-1.5">Sell anyway</button>
                    <button type="button" onClick={() => { setOutAsk(null); searchRef.current?.focus(); }} className="text-[13px] text-ink-soft hover:text-ink">Cancel</button>
                  </div>
                ); })()}
                {tree.length > 0 && shown.length === 0 && <p className="text-sm text-ink-soft mb-3">Nothing matches.</p>}
                {items && (
                  <div className={'grid grid-cols-2 sm:grid-cols-3 gap-2.5 ' + (saleOpen ? 'xl:grid-cols-4 2xl:grid-cols-5' : 'lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7')}>
                    {shown.map(it => {
                      const n = inCart(it);
                      const opts = it.options.filter(o => o.active);
                      const stockN = stockOf(it);
                      return (
                        <div key={it.id} className={picking === it.id ? 'col-span-full' : ''}>
                          <button onClick={() => (opts.length ? setPicking(p => (p === it.id ? null : it.id)) : tryAdd(it.id))} aria-expanded={opts.length ? picking === it.id : undefined}
                            className={'w-full min-h-[104px] text-left rounded-[10px] border overflow-hidden flex flex-col transition-colors ' + (n ? 'border-ok ring-1 ring-inset ring-ok bg-white' : 'border-line bg-white hover:border-line-strong')}>
                            {/* DASH-D (Cam 2026-11-01, "photo tiles"): the item's photo when it has one; otherwise its initials. */}
                            {(it.photoUrl
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={it.photoUrl} alt="" loading="lazy" className="block w-full h-20 object-contain bg-paper" />
                              : <span aria-hidden="true" className="flex w-full h-20 items-center justify-center bg-page op-well text-[20px] font-bold text-ink-soft">{initials(it.name)}</span>)}
                            {/* POS-6 (Cam 2026-11-09): "in sale" is how many are on this ticket; the stock is its own line, never beside the price. */}
                            <span className="flex items-start justify-between gap-2 px-3 pt-3">
                              <span className="text-[14px] font-medium text-ink leading-snug">{it.name}</span>
                              {n ? <span className="shrink-0 text-[12px] font-bold text-ok tabular-nums whitespace-nowrap">{n} in sale</span> : null}
                            </span>
                            <span className="mt-auto px-3 pt-1 pb-3 tabular-nums">
                              <b className="block text-[15px] font-semibold text-ink">{usd(it.priceCents)}</b>
                              <span className={'block text-[12px] ' + (stockN !== null && stockN <= 0 ? 'text-bad' : 'text-ink-muted')}>{opts.length ? `${opts.length} sizes${stockN !== null ? ` · ${stockN <= 0 ? 'Sold out' : `${stockN} in stock`}` : ''}` : stockN !== null ? (stockN <= 0 ? 'Sold out' : `${stockN} in stock`) : '\u00a0'}</span>
                            </span>
                          </button>
                          {picking === it.id && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5 bg-paper/70 rounded-md p-2" role="group" aria-label={`${it.name} options`}>
                              {opts.map(o => (
                                <button key={o.id} onClick={() => tryAdd(o.id)}
                                  className={'rounded-md border px-3 py-2 text-[13px] ' + (cart[o.id] ? 'border-pine/50 bg-white text-ink font-medium' : 'border-line bg-white text-ink hover:border-line-strong')}>
                                  {o.optionLabel}
                                  {o.priceCents !== it.priceCents && <span className="text-ink-muted tabular-nums"> {usd(o.priceCents)}</span>}
                                  {o.stockCount !== null && <span className={'tabular-nums ' + (o.stockCount <= 0 ? 'text-bad' : 'text-ink-muted')}> {o.stockCount <= 0 ? '· Sold out' : `(${o.stockCount})`}</span>}
                                  {cart[o.id] ? <span className="text-pine font-semibold"> ×{cart[o.id]}</span> : null}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* POS-6 (Cam 2026-11-09): the ticket is only as tall as the sale — Charge sits under the items. */}
              {saleOpen && <Card className="lg:sticky lg:top-6 flex flex-col">
                {step === null ? (
                  <>
                    <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-line">
                      <h2 className="text-[15px] font-semibold text-ink">This sale</h2>
                      {!empty && <button type="button" onClick={() => { setCart({}); setCustoms([]); setDiscount(null); setTendered(''); setError(''); setOutOk(new Set()); setOutAsk(null); }} className="text-[12.5px] text-ink-soft hover:text-ink">Clear</button>}
                    </div>
                    <div className="flex-1 px-5 py-2">
                      {empty ? <p className="text-sm text-ink-soft py-2">Tap or scan items.</p> : (
                        <ul className="divide-y divide-line-soft">
                          {lines.map(l => (
                            <li key={l.item.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                              {/* Cam 2026-11-12: a 36px picture beside each line (the photo, or the item's initials). */}
                              <span className="flex items-center gap-2.5 min-w-0">
                                {(() => { const ph = l.item.photoUrl || (items ?? []).find(x => x.id === l.item.parentId)?.photoUrl; return ph
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={ph} alt="" loading="lazy" className="w-9 h-9 shrink-0 rounded-[8px] object-cover bg-page op-well" />
                                  : <span aria-hidden="true" className="flex w-9 h-9 shrink-0 rounded-[8px] bg-page op-well items-center justify-center text-[12px] font-bold text-ink-soft">{initials(l.item.name)}</span>; })()}
                                <span className="min-w-0 truncate text-ink">{l.item.name}</span>
                              </span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                <button onClick={() => add(l.item.id, -1)} aria-label={`One fewer ${l.item.name}`} className="w-8 h-8 rounded-[7px] border border-line bg-white text-ink-soft hover:text-ink">−</button>
                                <span className="w-6 text-center tabular-nums">{l.quantity}</span>
                                <button onClick={() => tryAdd(l.item.id)} aria-label={`One more ${l.item.name}`} className="w-8 h-8 rounded-[7px] border border-line bg-white text-ink-soft hover:text-ink">+</button>
                                <span className="w-16 text-right tabular-nums text-ink">{usd(l.item.priceCents * l.quantity)}</span>
                              </span>
                            </li>
                          ))}
                          {customs.map(c => (
                            <li key={c.key} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                              <span className="flex items-center gap-2.5 min-w-0">
                                <span aria-hidden="true" className="flex w-9 h-9 shrink-0 rounded-[8px] bg-page op-well items-center justify-center text-[12px] font-bold text-ink-soft">{initials(c.name) || '$'}</span>
                                <span className="min-w-0 truncate text-ink">{c.name}</span>
                              </span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                <button onClick={() => addCustom(c.key, -1)} aria-label={`One fewer ${c.name}`} className="w-8 h-8 rounded-[7px] border border-line bg-white text-ink-soft hover:text-ink">−</button>
                                <span className="w-6 text-center tabular-nums">{c.quantity}</span>
                                <button onClick={() => addCustom(c.key, 1)} aria-label={`One more ${c.name}`} className="w-8 h-8 rounded-[7px] border border-line bg-white text-ink-soft hover:text-ink">+</button>
                                <span className="w-16 text-right tabular-nums text-ink">{usd(c.priceCents * c.quantity)}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!itemsEmpty && canDiscount && (
                        discount === null
                          ? <button type="button" onClick={() => setDiscount({ mode: 'percent', value: '', note: '' })} className={LINK + ' mt-3'}>Add a discount</button>
                          : (
                            <div className="mt-3 bg-paper/70 rounded-md p-3 space-y-2">
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
                              <input value={discount.note} onChange={e => setDiscount({ ...discount, note: e.target.value })} maxLength={120} placeholder="Reason (shown on the receipt)" aria-label="Discount reason" className={INPUT + ' w-full'} />
                            </div>
                          )
                      )}
                    </div>
                    <div className="px-5 pt-3 pb-5 border-t border-line">
                      {!empty && (
                        <dl className="text-[13.5px] space-y-1 mb-3">
                          <div className="flex justify-between text-ink-soft"><dt>Subtotal</dt><dd className="tabular-nums">{usd(subtotal)}</dd></div>
                          {priced && priced.discountCents > 0 && <div className="flex justify-between text-ink-soft"><dt>Discount{discount?.note.trim() ? ` (${discount.note.trim()})` : ''}</dt><dd className="tabular-nums">−{usd(priced.discountCents)}</dd></div>}
                          {priced && priced.taxCents > 0 && <div className="flex justify-between text-ink-soft"><dt>Sales tax</dt><dd className="tabular-nums">{usd(priced.taxCents)}</dd></div>}
                          <div className="flex items-baseline justify-between pt-2 text-ink"><dt className="text-[16px] font-semibold">Total</dt><dd className="text-[24px] font-bold tabular-nums">{cashNoQuote ? <span className="text-ink-muted font-normal text-base">—</span> : priced ? usd(due) : <span className="text-ink-muted font-normal text-sm">Working it out…</span>}</dd></div>
                        </dl>
                      )}
                      {noTax && <p className="text-[13px] text-warn mb-2" role="status">No sales tax right now — cash or on account only. <button type="button" onClick={() => setQuoteTry(n => n + 1)} className="underline font-medium">Try again</button></p>}
                      {quoteError && <p className="text-[13px] text-bad mb-2" role="alert">{quoteError} <button type="button" onClick={() => { setQuoteError(''); setQuoteTry(n => n + 1); }} className="underline font-medium">Try again</button></p>}
                      <button type="button" onClick={() => { setError(''); setNote(''); setStep('pay'); }} disabled={empty || (!priced && !(quoteDown && canCash)) || payChoices.length === 0}
                        className="w-full min-h-[56px] bg-pine hover:bg-pine-hover text-white font-semibold rounded-[7px] text-[17px] disabled:opacity-50">{chargeLabel}</button>
                      {error && <p className="mt-3 text-[13px] text-bad" role="alert">{error}</p>}
                      {note && <p className="mt-3 text-[13px] text-ok flex items-center gap-1.5"><StatusDot status="ok" />{note}</p>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-line">
                      <h2 className="text-[15px] font-semibold text-ink tabular-nums">{step === 'done' ? (linkSent ? 'Sent' : 'Paid') : onReader ? `Charge ${usd(onReader.sale.totalCents)}` : chargeLabel}</h2>
                      {step !== 'done' && onReader?.state !== 'waiting' && <button type="button" onClick={() => { setStep(null); setOnReader(null); }} className={LINK}>Back to sale</button>}
                    </div>
                    <div className="px-5 py-4 space-y-3 flex-1">
                      {step === 'pay' && (
                        <>
                          {/* Cam 2026-11-12 (approved Register): cash first with its amounts — Exact, the next notes up, Other —
                              then one row each for the reader, a texted or emailed pay link and the member's account. */}
                          <h3 className="text-[15px] font-semibold text-ink">How are they paying?</h3>
                          <div role="group" aria-label="How they pay">
                            {payChoices.includes('cash') && (
                              <div className="flex flex-wrap items-center gap-1.5 py-2.5">
                                <span className="mr-auto text-[14px] font-semibold text-ink">Cash</span>
                                {(quoteDown ? [] : quickCash).map(n => (
                                  <button key={n} type="button" onClick={() => { setPay('cash'); setTendered((n / 100).toFixed(2)); setError(''); setStep('take'); }}
                                    className="min-h-[36px] px-2.5 rounded-[8px] border border-line text-[13px] font-semibold text-ink tabular-nums hover:bg-page">{n === due ? 'Exact' : usd(n).replace(/\.00$/, '')}</button>
                                ))}
                                <button type="button" onClick={() => { setPay('cash'); setTendered(''); setError(''); setStep('take'); }}
                                  className="min-h-[36px] px-2.5 rounded-[8px] border border-line text-[13px] font-semibold text-ink hover:bg-page">{quoteDown ? 'Take cash' : 'Other'}</button>
                              </div>
                            )}
                            {payChoices.filter(k => k !== 'cash').map(k => {
                              const off = quoteDown || (k !== 'account' && noTax);
                              return (
                                <button key={k} type="button" disabled={off} onClick={() => { setPay(k); setError(''); setStep('take'); }}
                                  className="w-full flex items-center justify-between gap-3 py-3 border-t border-line text-[14px] text-ink text-left hover:bg-page disabled:opacity-50">
                                  <span>{k === 'account' ? 'On their account' : PAY_WORDS[k]}</span><span aria-hidden="true" className="text-ink-muted">›</span>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                      {step === 'take' && (
                        <>
                          <h3 className="text-[15px] font-semibold text-ink">{PAY_WORDS[pay]}</h3>
                          {pay === 'cash' && !cashNoQuote && due > 0 && (
                            <div className="space-y-2">
                              <div className="grid grid-cols-4 gap-1.5">
                                {quickCash.map(n => (
                                  <button key={n} type="button" onClick={() => setTendered((n / 100).toFixed(2))} aria-pressed={tenderedCents === n}
                                    className={'min-h-[44px] rounded-[7px] text-[13.5px] font-medium tabular-nums ' + (tenderedCents === n ? 'bg-ink text-white' : 'bg-page text-ink hover:bg-line')}>{n === due ? 'Exact' : usd(n)}</button>
                                ))}
                              </div>
                              <label className="flex items-center justify-between gap-3 rounded-[7px] border border-line px-3 min-h-[52px]">
                                <span className="text-[14px] font-medium text-ink">Cash given <span className="font-normal text-ink-muted">(optional)</span></span>
                                <span className="relative w-28"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted">$</span>
                                  <input value={tendered} onChange={e => setTendered(e.target.value)} inputMode="decimal" aria-label="Cash handed over" className={INPUT + ' w-full pl-6 text-right text-[16px] font-semibold tabular-nums'} /></span>
                              </label>
                              {tenderedCents > 0 && (tenderedCents >= due
                                ? <p className="flex justify-between rounded-[7px] bg-ok/10 px-3 py-3 text-[15px] text-ink"><span>Change</span><b className="tabular-nums">{usd(tenderedCents - due)}</b></p>
                                : <p className="text-[13px] text-bad">That’s {usd(due - tenderedCents)} short.</p>)}
                            </div>
                          )}
                          {pay === 'cash' && cashNoQuote && <p className="text-[13px] text-ink-soft">The total with tax is worked out when you take it — the next screen says what to collect.</p>}
                          {pay === 'reader' && readers.length > 1 && (
                            <select value={readerId} onChange={e => setReaderId(e.target.value)} aria-label="Card reader" className={INPUT + ' w-full'}>
                              {readers.map(x => <option key={x.id} value={x.id}>{x.label}{x.online ? '' : ' (offline)'}</option>)}
                            </select>
                          )}
                          {pay === 'account' && <AccountPicker picked={accountMember} onPick={setAccountMember} className={INPUT} />}
                          {(pay === 'sms' || pay === 'email') && (
                            <div className="space-y-2">
                              <input value={customer.name} onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))} placeholder="Name (optional)" aria-label="Customer name" className={INPUT + ' w-full'} />
                              {pay === 'sms'
                                ? <input value={customer.phone} onChange={e => { setCustomer(c => ({ ...c, phone: e.target.value })); setSmsYes(false); }} placeholder="Mobile number" type="tel" aria-label="Mobile number" className={INPUT + ' w-full'} />
                                : <input value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} placeholder="Email address" type="email" aria-label="Email address" className={INPUT + ' w-full'} />}
                              {pay === 'sms' && customer.phone.replace(/\D/g, '').length >= 10 && <SmsConsentAsk courseName="" checked={smsYes} onChange={setSmsYes} />}
                            </div>
                          )}
                          {onReader && (
                            <div className={'border-l-[3px] pl-3 space-y-2 ' + (onReader.state === 'waiting' ? 'border-warn' : 'border-bad')} role="status" aria-live="polite">
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
                                {onReader.state !== 'waiting' && canCash && <button type="button" onClick={async () => { await act(onReader.sale, 'paid_cash'); setStep(null); }} disabled={!!busy} className={LINK}>Took cash instead</button>}
                                {onReader.state !== 'waiting' && <button type="button" onClick={async () => { await act(onReader.sale, 'void'); setStep(null); }} disabled={!!busy} className="text-[12.5px] text-bad hover:underline disabled:opacity-50">Void</button>}
                              </div>
                            </div>
                          )}
                          {noTax && (pay === 'cash' || pay === 'account') && <p className="text-[13px] text-warn" role="status">No sales tax right now — taken without it.</p>}
                          {quoteError && <p className="text-[13px] text-bad" role="alert">{quoteError} <button type="button" onClick={() => { setQuoteError(''); setQuoteTry(n => n + 1); }} className="underline font-medium">Try again</button></p>}
                          {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
                          {!onReader && (
                            <div className="flex gap-2 pt-1">
                              <button type="button" onClick={() => { setStep('pay'); setError(''); }} className="px-5 min-h-[52px] rounded-[7px] border border-line bg-white text-[14px] font-medium text-ink hover:bg-paper">Back</button>
                              <button type="button" onClick={ringUp} disabled={takeDisabled}
                                className="flex-1 min-h-[52px] bg-pine hover:bg-pine-hover text-white font-semibold rounded-[7px] text-[15px] disabled:opacity-50">
                                {busy === 'sale' ? 'Saving…' : pay === 'cash' ? (cashNoQuote ? 'Take cash' : `Take ${usd(due)} cash`) : pay === 'account' ? `Put ${usd(due)} on account` : pay === 'reader' ? `Send ${usd(due)} to the reader` : `Send ${usd(due)} pay link`}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      {step === 'done' && (
                        <>
                          {justPaid ? (
                            <div className="text-center pt-2">
                              <p className="text-[30px] font-bold tabular-nums text-ink">{usd(justPaid.totalCents)}</p>
                              <p className="text-[13.5px] text-ok font-medium mt-1">
                                {justPaid.status === 'paid_card' ? 'Paid by card' : justPaid.status === 'paid_account' ? 'On their account' : 'Paid in cash'}
                                {justPaid.cashTenderedCents != null && justPaid.cashTenderedCents > justPaid.totalCents && <> · change <span className="tabular-nums">{usd(justPaid.cashTenderedCents - justPaid.totalCents)}</span></>}
                              </p>
                              {justNoQuote && <p className="text-[14px] font-semibold text-ink mt-2">Collect {usd(justPaid.totalCents)}.</p>}
                            </div>
                          ) : <p className="text-[14px] text-ink flex items-center gap-1.5"><StatusDot status="ok" />{linkSent}</p>}
                          {error && <p className="text-[13px] text-bad" role="alert">{error}</p>}
                          {note && <p className="text-[13px] text-ok">{note}</p>}
                          {justPaid && receipt?.id === justPaid.id && (
                            <div className="pt-2 space-y-2">
                              <h3 className="text-[15px] font-semibold text-ink">Receipt?</h3>
                              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Receipt">
                                {(['sms', 'email'] as const).map(v => (
                                  <button key={v} type="button" aria-pressed={rcptOpen && receipt.via === v} onClick={() => { setReceipt({ ...receipt, via: v, to: v === 'email' ? justPaid.customerEmail || '' : justPaid.customerPhone || '' }); setRcptOpen(true); }}
                                    className={CHOICE + (rcptOpen && receipt.via === v ? 'border-pine border-2' : 'border-line hover:border-line-strong')}>{v === 'sms' ? 'Text' : 'Email'}</button>
                                ))}
                                <button type="button" onClick={newSale} className={CHOICE + 'border-line hover:border-line-strong'}>No receipt</button>
                              </div>
                              {rcptOpen && (
                                <form className="flex gap-2" onSubmit={e => { e.preventDefault(); sendReceipt(); }}>
                                  <input value={receipt.to} onChange={e => setReceipt({ ...receipt, to: e.target.value })} type={receipt.via === 'email' ? 'email' : 'tel'} required autoFocus
                                    placeholder={receipt.via === 'email' ? 'Their email' : 'Their mobile'} aria-label={receipt.via === 'email' ? 'Receipt email' : 'Receipt mobile number'} className={INPUT + ' flex-1 min-h-[48px]'} />
                                  <button type="submit" disabled={busy === 'receipt' + justPaid.id} className="px-4 min-h-[48px] bg-pine hover:bg-pine-hover text-white font-semibold rounded-[7px] text-[14px] disabled:opacity-50">{busy === 'receipt' + justPaid.id ? 'Sending…' : 'Send'}</button>
                                </form>
                              )}
                            </div>
                          )}
                          {(!justPaid || receipt?.id !== justPaid.id) && (
                            <button type="button" onClick={newSale} className="w-full min-h-[52px] bg-pine hover:bg-pine-hover text-white font-semibold rounded-[7px] text-[15px]">New sale</button>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </Card>}
            </div>
            )}

            {view === 'sales' && (() => {
              // Cam 2026-11-12 (approved Sales): the day's sales as rows — sale number, time, what was sold and how it was paid,
              // the amount — and the one tapped opens beside them with its lines and what can be done with it.
              const all = hist ? histSales : sales;
              const count = (k: SalesShow) => (all ?? []).filter(x => salesShowOf(x).includes(k)).length;
              const list = all && [...all].filter(x => salesShowOf(x).includes(salesShow))
                .sort((a, b) => salesSort === 'big' ? b.totalCents - a.totalCents : (salesSort === 'old' ? 1 : -1) * (Date.parse(a.createdAt) - Date.parse(b.createdAt)));
              const taken = takenOf(all ?? [], !hist);
              const s = (list ?? []).find(x => x.id === salePick) ?? list?.[0] ?? null;
              const filterLabel = salesShow === 'all' ? 'Filter' : `Filter: ${[...SALES_HOW, ...SALES_STATE].find(([k]) => k === salesShow)?.[1] ?? ''}`;
              return (
            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <Card className="p-4 min-w-0 relative z-10">
              {/* POS-8 (Cam 2026-11-09: no Today / Yesterday, "just have the little calendar icon"): the day as words and a
                  calendar icon that opens the picker; what was taken that day on the right. */}
              <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
                <h2 className="text-[17px] font-semibold text-ink">{hist?.q && !hist.day ? 'Last 90 days' : (hist?.day ? new Date(`${hist.day}T12:00:00`) : new Date()).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</h2>
                <span className="relative inline-flex">
                  <button type="button" aria-label="Pick a day" title="Pick a day" onClick={() => { const el = dayRef.current; if (!el) return; try { el.showPicker(); } catch { el.focus(); } }}
                    className="w-8 h-8 rounded-md inline-flex items-center justify-center text-ink-muted hover:text-ink hover:bg-page"><CalendarDays className="w-4 h-4" aria-hidden="true" /></button>
                  <input ref={dayRef} type="date" tabIndex={-1} aria-label="Sales on a day" value={hist?.day ?? ''} max={new Date().toLocaleDateString('en-CA')} onChange={e => loadHistory({ q: hist?.q ?? '', day: e.target.value === new Date().toLocaleDateString('en-CA') ? '' : e.target.value })}
                    className="absolute inset-0 opacity-0 pointer-events-none" />
                </span>
                {all && <span className="ml-auto text-[13.5px] text-ink-muted tabular-nums"><b className="text-[15px] font-semibold text-ink">{usd(taken.cents)}</b> taken · {taken.count} sale{taken.count === 1 ? '' : 's'}</span>}
              </div>
              <div className="flex items-center gap-2.5 mb-2">
                <label className="flex-1 min-w-0 flex items-center gap-2 bg-page op-well border border-line rounded-[10px] px-3 min-h-[38px] text-ink-muted">
                  <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <input value={hist?.q ?? ''} onChange={e => loadHistory({ q: e.target.value, day: hist?.day ?? '' })} aria-label="Find a sale by name, item or sale number" className="flex-1 min-w-0 bg-transparent text-[13.5px] text-ink outline-none" />
                </label>
                <ShopMenu label={filterLabel} ariaLabel="Sort and filter" align="right" onPick={k => { if (k.startsWith('sort:')) setSalesSort(k.slice(5) as typeof salesSort); else setSalesShow(k as SalesShow); }} sections={[
                  SALES_HOW.filter(([k]) => k === 'all' || count(k) > 0 || salesShow === k).map(([k, l]) => ({ key: k, label: l, count: count(k), on: salesShow === k })),
                  SALES_STATE.filter(([k]) => count(k) > 0 || salesShow === k).map(([k, l]) => ({ key: k, label: l, count: count(k), on: salesShow === k })),
                  ([['new', 'Newest first'], ['old', 'Oldest first'], ['big', 'Largest first']] as const).map(([k, l]) => ({ key: `sort:${k}`, label: l, on: salesSort === k })),
                ]} />
              </div>
              {histError && <p className="pb-3 text-[13px] text-bad" role="alert">{histError} <button type="button" onClick={() => hist && loadHistory(hist)} className="underline font-medium">Try again</button></p>}
              {all && all.length === 0 && <p className="py-3 text-sm text-ink-soft">{hist ? 'No sales match.' : 'No walk-up sales yet today.'}</p>}
              {all && all.length > 0 && list && list.length === 0 && <p className="py-3 text-sm text-ink-soft">None. <button type="button" onClick={() => setSalesShow('all')} className={LINK}>Show all</button></p>}
              {list && list.length > 0 && (
                <ul>
                  {list.map(x => {
                    const st = saleState(x);
                    const on = s?.id === x.id;
                    return (
                      <li key={x.id}>
                        <button type="button" onClick={() => { setSalePick(x.id); setRefund(null); if (receipt?.id !== x.id) setReceipt(null); showSale(); }} aria-current={on ? 'true' : undefined}
                          className={'w-full text-left grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_64px_minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-3 rounded-[10px] hover:bg-page ' + (on ? 'bg-page ring-1 ring-inset ring-line' : '')}>
                          <span className="text-[13px] font-semibold text-ink-muted tabular-nums">{saleNo(x)}<span className="block sm:hidden font-normal">{time(x.createdAt)}</span></span>
                          <span className="hidden sm:block text-[13px] text-ink-muted tabular-nums">{time(x.createdAt)}</span>
                          <span className="min-w-0">
                            <b className="block truncate text-[14px] font-semibold text-ink">{x.lines.map(l => `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ''}`).join(', ') || 'Sale'}</b>
                            <span className="block truncate text-[12.5px] text-ink-muted">{st.tone === 'neutral' ? st.label : <StatusDot status={st.tone} label={st.label} />}{x.customerName ? ` · ${x.customerName}` : ''}</span>
                          </span>
                          <span className={'text-right text-[15px] tabular-nums ' + (x.status === 'void' ? 'text-ink-muted line-through font-medium' : 'text-ink font-semibold')}>{usd(x.totalCents)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            {s && (() => {
              const itemsCents = s.totalCents - (s.roundsCents ?? 0);
              // Green fees in the sale are refunded from their booking, not here.
              const left = itemsCents - s.refundedCents;
              const pending = s.refunds.filter(r => r.status === 'pending');
              const st = saleState(s);
              const sub = s.lines.reduce((t, l) => t + l.unitPriceCents * l.quantity, 0);
              const BTN = 'w-full min-h-[42px] rounded-[10px] text-[14px] font-semibold disabled:opacity-50 ';
              return (
            <Card className="p-4 lg:sticky lg:top-6">
              <h2 ref={saleRef} tabIndex={-1} className="text-[20px] font-semibold text-ink outline-none scroll-mt-8">Sale {saleNo(s)}</h2>
              <p className="text-[13px] text-ink-muted mt-1 mb-3">{time(s.createdAt)} · {st.tone === 'neutral' ? st.label : <StatusDot status={st.tone} label={st.label} />}{s.customerName ? ` · ${s.customerName}` : ''}</p>
              <dl className="text-[13.5px]">
                {s.lines.map(l => (
                  <div key={l.id} className="flex justify-between gap-3 py-2 border-t border-line"><dt className="min-w-0 truncate text-ink">{l.name}{l.quantity > 1 ? ` ×${l.quantity}` : ''}{l.returnedQty ? <span className="text-ink-muted"> · {l.returnedQty} back</span> : null}</dt><dd className="font-semibold tabular-nums">{usd(l.unitPriceCents * l.quantity)}</dd></div>
                ))}
                {s.discountCents > 0 && <div className="flex justify-between gap-3 py-2 border-t border-line"><dt className="text-ink-soft">Discount{s.discountNote ? ` (${s.discountNote})` : ''}</dt><dd className="font-semibold tabular-nums">−{usd(s.discountCents)}</dd></div>}
                {(s.taxCents > 0 || sub !== s.totalCents) && <div className="flex justify-between gap-3 py-2 border-t border-line"><dt className="text-ink-soft">Tax</dt><dd className="font-semibold tabular-nums">{usd(s.taxCents)}</dd></div>}
                <div className="flex justify-between gap-3 py-2 border-t border-line"><dt className="font-semibold text-ink">Total</dt><dd className="font-semibold tabular-nums">{usd(s.totalCents)}</dd></div>
                {s.refundedCents > 0 && <div className="flex justify-between gap-3 py-2 border-t border-line"><dt className="text-ink-soft">Refunded</dt><dd className="font-semibold tabular-nums">−{usd(s.refundedCents)}</dd></div>}
              </dl>
              {pending.map(r => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 mt-2 text-[12.5px]">
                  <StatusDot status="warn" label={`Refund ${usd(r.amountCents)} not confirmed by Stripe yet`} />
                  {canReturn && <button onClick={() => retryRefund(s, r.id)} disabled={!!busy} className={LINK}>{busy === 'retry' + r.id ? 'Asking Stripe…' : 'Try again'}</button>}
                </div>
              ))}
              <div className="mt-4 flex flex-col gap-2">
                {isPaid(s) && <button type="button" onClick={() => { setReceipt(receipt?.id === s.id ? null : { id: s.id, via: s.customerEmail || !s.customerPhone ? 'email' : 'sms', to: s.customerEmail || s.customerPhone }); setRefund(null); setError(''); }} disabled={!!busy} className={BTN + 'bg-pine hover:bg-pine-hover text-white'}>Receipt</button>}
                {isPaid(s) && (canRefund || (canReturn && s.lines.some(l => !l.round && l.quantity > l.returnedQty))) && left > 0 && <button type="button" onClick={() => { setRefund(refund?.id === s.id ? null : { id: s.id, amount: (left / 100).toFixed(2), reason: '', restock: false, confirm: false }); setReceipt(null); setError(''); }} disabled={!!busy} className={BTN + 'border border-line text-ink hover:bg-page'}>Refund</button>}
                {/* Dead end 23: a cash sale rung up by mistake, the same day (the server also checks the close-out). */}
                {(s.status === 'paid_cash' || s.status === 'paid_account') && !s.roundsCents && s.refundedCents === 0 && paidToday(s.paidAt) && <button type="button" onClick={() => act(s, 'void_cash')} disabled={!!busy} className={BTN + 'border border-line text-bad hover:bg-page'}>Void</button>}
                {s.status === 'open' && (
                  <>
                    {s.link
                      ? <button type="button" onClick={() => act(s, 'resend', s.customerPhone ? 'sms' : 'email')} disabled={!!busy} className={BTN + 'bg-pine hover:bg-pine-hover text-white'}>Send the pay link again</button>
                      : readers.length > 0 && <button type="button" onClick={() => { setOnReader({ sale: s, readerId: readerId || readers[0].id, state: 'cancelled', message: '' }); setPay('reader'); setStep('take'); setView('register'); setError(''); }} disabled={!!busy || onReader?.state === 'waiting'} className={BTN + 'bg-pine hover:bg-pine-hover text-white'}>Card reader</button>}
                    {canCash && <button type="button" onClick={() => act(s, 'paid_cash')} disabled={!!busy} className={BTN + 'border border-line text-ink hover:bg-page'}>They paid cash</button>}
                    <button type="button" onClick={() => act(s, 'void')} disabled={!!busy} className={BTN + 'border border-line text-bad hover:bg-page'}>Void</button>
                  </>
                )}
              </div>
              {receipt?.id === s.id && justPaid?.id !== s.id && (
                <SaleReceiptPanel receipt={receipt} setReceipt={setReceipt} onSend={sendReceipt} busy={busy === 'receipt' + s.id} onClose={() => setReceipt(null)} />
              )}
              {refund?.id === s.id && (
                <div className="mt-3 bg-page rounded-[10px] p-3 space-y-2">
                  <div className={canRefund ? 'grid grid-cols-[110px_1fr] gap-2' : ''}>
                    {canRefund && <label className="block"><span className="block text-[12.5px] font-medium text-ink mb-1">Amount</span>
                      <div className="relative"><span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-sm">$</span>
                        <input value={refund.amount} onChange={e => setRefund({ ...refund, amount: e.target.value, confirm: false, restock: toCents(e.target.value) === itemsCents && s.refundedCents === 0 ? refund.restock : false })} inputMode="decimal" className={INPUT + ' w-full pl-6'} /></div></label>}
                    <label className="block"><span className="block text-[12.5px] font-medium text-ink mb-1">Reason <span className="font-normal text-ink-muted">(for your records)</span></span>
                      <input value={refund.reason} onChange={e => setRefund({ ...refund, reason: e.target.value })} maxLength={300} className={INPUT + ' w-full'} /></label>
                  </div>
                  {canRefund && s.refundedCents === 0 && toCents(refund.amount) === itemsCents && s.lines.some(l => !/ round · /.test(l.name)) && (
                    <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={refund.restock} onChange={e => setRefund({ ...refund, restock: e.target.checked })} className="accent-pine" />Put the items back on the shelf</label>
                  )}
                  {s.lines.some(l => !l.round && l.quantity > l.returnedQty) && (
                    <div className="space-y-1">
                      <span className="block text-[12.5px] font-medium text-ink">Return items</span>
                      {s.lines.filter(l => !l.round && l.quantity > l.returnedQty).map(l => (
                        <label key={l.id} className="flex items-center justify-between gap-2 text-[13px] text-ink">
                          <span className="truncate">{l.name} <span className="text-ink-muted">· {usd(l.unitPriceCents)}{l.returnedQty ? ` · ${l.returnedQty} back` : ''}</span></span>
                          <input type="number" min={0} max={l.quantity - l.returnedQty} value={refund.returns?.[l.id] ?? ''} placeholder="0" aria-label={`How many ${l.name} back`}
                            onChange={e => setRefund({ ...refund, confirm: false, restock: true, returns: { ...(refund.returns ?? {}), [l.id]: e.target.value } })} className={INPUT + ' w-16'} />
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-[12.5px] text-ink-soft">{s.status === 'paid_card' ? 'To their card, for good.' : s.status === 'paid_account' ? 'To their account.' : 'Hand the cash back.'} Up to {usd(left)} can be refunded{s.roundsCents ? ' — green fees are refunded from the booking on the tee sheet' : ''}.</p>
                  <div className="flex gap-2">
                    {(() => { const byItem = Object.values(refund.returns ?? {}).some(q => Number(q) > 0); return !refund.confirm
                      ? <button onClick={() => setRefund({ ...refund, confirm: true })} disabled={!byItem && (!canRefund || !toCents(refund.amount))} className="px-3 py-2 rounded-md text-[13px] font-medium bg-white border border-line text-ink hover:bg-paper disabled:opacity-50">{byItem ? 'Return these items' : `Refund $${refund.amount || '0'}`}</button>
                      : <button onClick={() => doRefund(s)} disabled={!!busy} className="px-3 py-2 rounded-md text-[13px] font-medium bg-bad text-white disabled:opacity-50">{busy === 'refund' + s.id ? 'Refunding…' : byItem ? 'Yes, refund their share and restock' : `Yes, refund $${refund.amount}`}</button>; })()}
                    <button onClick={() => setRefund(null)} className="px-3 py-2 rounded-md text-[13px] font-medium bg-white border border-line text-ink hover:bg-paper">Close</button>
                  </div>
                </div>
              )}
            </Card>
              ); })()}
            </div>
              ); })()}
            {/* POS-5: stock and the close-out each open full on their own tab. POS-6 (Cam 2026-11-09): Stock is where items
                are added and changed — the register only sells them. Round packs are turned off (lib/round-packs-switch). */}
            {view === 'stock' && (access.can('shop.sell') || access.can('shop.catalog')) && <div className="mt-5"><StockTab refreshKey={loads} onChanged={load} /></div>}
            {/* POS-3 R4: count the drawer at the end of the day (blind until saved). */}
            {view === 'close' && access.can('shop.close') && <RegisterClose page />}
          </div>
        )}
      </main>
    </div>
  );
}

/** POS-3: send a paid sale's receipt by email or text. */
