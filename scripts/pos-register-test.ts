// POS-4 (Cam 2026-11-08, approved mockup): the Pro shop is Register · Sales · Close out; the register is big tiles
// under one row of category chips (no headings), the ticket on the right with one Charge button, and Charge runs in
// steps — how they pay → take it → receipt. Tee times are paid on the tee sheet only ("tee times shouldnt be paid
// for in pro shop they are paid on tee times"). "$X today" is what the shop sold: green fees taken in cash on the
// tee sheet ring through the register (CASH-1) but are counted in the sheet's Paid, so they are left out here.
// Run: npx tsx scripts/pos-register-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const page = readFileSync('src/app/dashboard/shop/page.tsx', 'utf8');

ok('tabs: Register · Sales · Stock · Close out, each gated as before (POS-5; POS-6 took Round packs off)', page.includes("[['register', 'Register'], ['sales', 'Sales'],") && page.includes("[['stock', 'Stock']]") && !page.includes("'Round packs'") && page.includes("[['close', 'Close out']]") && page.includes("{view === 'close' && access.can('shop.close') && <RegisterClose page />}"));
ok('POS-6: Stock is where items are added and changed; the register re-reads them after', page.includes('<StockTab refreshKey={loads} onChanged={load} />') && page.includes("onClick={() => setView('stock')}") && !page.includes('Add them in Settings'));
ok('POS-5: the tab highlight slides, and not with reduced motion', page.includes('transition-[left,top,width,height] duration-200 ease-out motion-reduce:transition-none') && page.includes('document.fonts?.ready.then(place)') && !page.includes('inline-flex flex-wrap gap-1 p-1'));
ok('one flat list of tiles filtered by the chip — no category headings', page.includes('const shown = useMemo(() => tree') && !page.includes('<h2 className="text-[13px] font-semibold text-ink mb-2">{group}</h2>'));
ok('Custom amount is a tile; no round pack on the register (POS-6)', page.includes('>Custom amount</button>') && !page.includes('>Round pack</button>') && !page.includes('PackPicker') && !page.includes('roundPackId'));
ok('POS-6: a tile says how many are "in sale" and its stock on its own line', page.includes('{n} in sale</span>') && page.includes('const stockN = stockOf(it);'));
ok('POS-6: the ticket is only as tall as the sale', !page.includes('lg:min-h-[calc(100vh-9rem)]'));
ok('POS-6: Sales filter (needs fixing, how paid, refunded), sort and day chips', page.includes("const SALES_SHOW: [SalesShow, string][] = [['all', 'All'], ['fix', 'To fix'], ['card', 'Card'], ['cash', 'Cash'], ['account', 'On account'], ['refunded', 'Refunded']];") && page.includes("salesSort === 'big' ? b.totalCents - a.totalCents") && page.includes('>Yesterday</button>') && page.includes("s.refunds.some(r => r.status === 'pending')"));
ok('one Charge button opens the steps', page.includes("onClick={() => { setError(''); setNote(''); setStep('pay'); }}") && page.includes("[['pay', '1. How they pay'], ['take', '2. Take it'], ['done', '3. Receipt']]"));
ok('the money calls are the ones the register always made', page.includes("dfetch<{ sale: Sale; sent?: boolean; sendError?: string; readerError?: string; skipped?: string[]; notes?: string[] }>('/api/operator/shop-sales', {") && page.includes("action: 'reader_status'") && page.includes("action: 'receipt'"));
ok('no tee times on the register: no rounds list, no walk-ins, no round on the reader', !page.includes('/api/operator/shop-sales/rounds') && !page.includes('/api/operator/reader-rounds') && !page.includes('bookingIds:') && !page.includes('walkIns:'));
ok('the receipt step: Text · Email · No receipt as big choices, then New sale', page.includes(">No receipt</button>") && page.includes('function newSale()'));
ok('"today" is shop sales only — cash green fees from the tee sheet are left out', page.includes('const todayTotal = paidTodaySales.reduce((t, s) => t + s.totalCents - (s.roundsCents ?? 0) - s.refundedCents, 0);'));
ok('cash never waits on the tax quote, whatever the last sale used', page.includes('const quoteDown = !itemsEmpty && !priced && !!quoteError;') && page.includes('disabled={empty || (!priced && !(quoteDown && canCash)) || payChoices.length === 0}') && page.includes("const off = k !== 'cash' && (quoteDown || (k !== 'account' && noTax));"));
ok('review: a sale on the card reader holds the take step (the ticket empties when it is rung up)', page.includes("if ((step === 'pay' || step === 'take') && empty && !onReader) setStep(null);"));
ok('review: Sales and Close out show what a refund, void, resend or receipt did', page.includes("{view !== 'register' && (error || note) && ("));
ok('review: while a sale is on the reader the header shows that sale\'s amount, not the (emptied) ticket', page.includes("onReader ? `Charge ${usd(onReader.sale.totalCents)}` : chargeLabel"));
ok('review: "Card reader" on an unpaid reader sale in Sales opens it on the register', page.includes("setPay('reader'); setStep('take'); setView('register');"));

const close = readFileSync('src/components/dashboard/RegisterClose.tsx', 'utf8');
ok('POS-5: the close-out opens straight to the count, still BLIND until saved', close.includes('useEffect(() => { if (page) load(); }, [page, load]);') && close.includes("Count first; the day&apos;s cash shows after.") && close.includes('{revealed && ('));
ok('POS-5: bills & coins add up to the same counted total that is saved', close.includes("useEffect(() => { if (by === 'notes') setCounted(notesTyped ? (notesCents / 100).toFixed(2) : ''); }, [by, notesCents, notesTyped]);") && close.includes('countedCashCents: toCents(counted)'));

const stock = readFileSync('src/components/dashboard/StockTab.tsx', 'utf8');
ok('POS-6: Stock has the photo, item editor, add many, and per-row deliveries / reorder / cost', stock.includes('<ItemPhoto item={open}') && stock.includes('<ItemEditor key={open.id}') && stock.includes('<BulkAdd') && stock.includes("action: 'receive'") && stock.includes("action: 'reorder'") && stock.includes("action: 'cost'"));
ok('POS-6 review: a reload that fails after a save shows the error, never "saved" over old rows', stock.includes("setNote((await load()) ? msg : '');") && stock.includes('{loadError && <div className="mt-3"><LoadError'));
ok('POS-6: cost only for the owner (the route decides)', stock.includes('const canCost = !!stock?.canCost;') && stock.includes('{canCost && <th'));
ok('POS-6: Settings no longer edits items or packs', !readFileSync('src/app/dashboard/settings/page.tsx', 'utf8').includes('<ShopCatalog') && !readFileSync('src/app/dashboard/settings/page.tsx', 'utf8').includes('<RoundPacks'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
