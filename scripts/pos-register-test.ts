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

ok('tabs: Register · Sales · Stock · Close out, each gated as before (POS-5; POS-6 took Round packs off)', page.includes("tabs={[['register', 'Register'], ['sales', 'Sales'],") && page.includes("[['stock', 'Stock'] as const]") && !page.includes("'Round packs'") && page.includes("[['close', 'Close out'] as const]") && page.includes("{view === 'close' && access.can('shop.close') && <RegisterClose page />}"));
ok('POS-6: Stock is where items are added and changed; the register re-reads them after', page.includes('<StockTab refreshKey={loads} onChanged={load} />') && page.includes("onClick={() => setView('stock')}") && !page.includes('Add them in Settings'));
const slide = readFileSync('src/components/dashboard/SlidingTabs.tsx', 'utf8');
ok('POS-5/7: the tab highlight slides (shared SlidingTabs), and not with reduced motion', page.includes('<SlidingTabs look="line" label="Pro shop"') && slide.includes('transition-[left,top,width,height] duration-200 ease-out motion-reduce:transition-none') && slide.includes('document.fonts?.ready.then(place)'));
ok('one flat list of tiles filtered by the chip — no category headings', page.includes('const shown = useMemo(() => tree') && !page.includes('<h2 className="text-[13px] font-semibold text-ink mb-2">{group}</h2>'));
ok('no Custom amount (Cam 2026-11-09: "what is this … doing here") and no round pack on the register (POS-6)', !page.includes('>Custom amount</button>') && !page.includes('placeholder="What it is"') && !page.includes('>Round pack</button>') && !page.includes('PackPicker') && !page.includes('roundPackId'));
ok('POS-6: a tile says how many are "in sale" and its stock on its own line', page.includes('{n} in sale</span>') && page.includes('const stockN = stockOf(it);'));
ok('POS-6: the ticket is only as tall as the sale', !page.includes('lg:min-h-[calc(100vh-9rem)]'));
// Cam 2026-11-12 (approved Sales): one Filter — how paid (cash / reader / pay link / account), where it stands (paid /
// waiting / to fix / refunded / voided) and the order — a calendar icon, the sale number on each row and its own panel.
ok('POS-6/8: Sales filter (how paid, where it stands, to fix), the order, a calendar icon (no Today / Yesterday), the sale number on each row', page.includes("const SALES_HOW: [SalesShow, string][] = [['all', 'All'], ['cash', 'Cash'], ['reader', 'Card reader'], ['link', 'Pay link'], ['account', 'On account']];") && page.includes("const SALES_STATE: [SalesShow, string][] = [['paid', 'Paid'], ['waiting', 'Waiting'], ['fix', 'To fix'], ['refunded', 'Refunded'], ['voided', 'Voided']];") && page.includes("salesSort === 'big' ? b.totalCents - a.totalCents") && page.includes('aria-label="Pick a day"') && !page.includes('>Yesterday</button>') && page.includes("['big', 'Largest first']") && page.includes("const saleNo = (s: Pick<Sale, 'id' | 'number'>) => (s.number != null ? `#${s.number}` : `#${s.id.slice(-8).toUpperCase()}`);") && page.includes("if (s.refunds.some(r => r.status === 'pending')) out.push('fix');") && readFileSync('src/lib/shop-sales.ts', 'utf8').includes("{ id: { endsWith: q.replace(/^#/, '').toLowerCase() } },"));
// Cam 2026-11-12 (approved Register): Charge → "How are they paying?" — cash with its amounts, then a row per other way.
ok('one Charge button opens the steps', page.includes("onClick={() => { setError(''); setNote(''); setStep('pay'); }}") && page.includes('<h3 className="text-[15px] font-semibold text-ink">How are they paying?</h3>') && page.includes("{payChoices.includes('cash') && (") && page.includes("{payChoices.filter(k => k !== 'cash').map(k => {"));
ok('the money calls are the ones the register always made', page.includes("dfetch<{ sale: Sale; sent?: boolean; sendError?: string; readerError?: string; skipped?: string[]; notes?: string[] }>('/api/operator/shop-sales', {") && page.includes("action: 'reader_status'") && page.includes("action: 'receipt'"));
ok('no tee times on the register: no rounds list, no walk-ins, no round on the reader', !page.includes('/api/operator/shop-sales/rounds') && !page.includes('/api/operator/reader-rounds') && !page.includes('bookingIds:') && !page.includes('walkIns:'));
ok('the receipt step: Text · Email · No receipt as big choices, then New sale', page.includes(">No receipt</button>") && page.includes('function newSale()'));
ok('"taken" is shop sales only (paid less refunds; voided and waiting left out) — cash green fees from the tee sheet are left out', page.includes("const takenOf = (list: Sale[], today: boolean) => { const paid = list.filter(s => isPaid(s) && (!today || paidToday(s.paidAt)) && s.totalCents - (s.roundsCents ?? 0) > 0); return { count: paid.length, cents: paid.reduce((t, s) => t + s.totalCents - (s.roundsCents ?? 0) - s.refundedCents, 0) }; };"));
ok('cash never waits on the tax quote, whatever the last sale used', page.includes('const quoteDown = !itemsEmpty && !priced && !!quoteError;') && page.includes('disabled={empty || (!priced && !(quoteDown && canCash)) || payChoices.length === 0}') && page.includes("{payChoices.filter(k => k !== 'cash').map(k => {\n                              const off = quoteDown || (k !== 'account' && noTax);"));
ok('review: a sale on the card reader holds the take step (the ticket empties when it is rung up)', page.includes("if ((step === 'pay' || step === 'take') && empty && !onReader) setStep(null);"));
ok('review: Sales and Close out show what a refund, void, resend or receipt did', page.includes("{view !== 'register' && (error || note) && ("));
ok('review: while a sale is on the reader the header shows that sale\'s amount, not the (emptied) ticket', page.includes("onReader ? `Charge ${usd(onReader.sale.totalCents)}` : chargeLabel"));
ok('review: "Card reader" on an unpaid reader sale in Sales opens it on the register', page.includes("setPay('reader'); setStep('take'); setView('register');"));

const close = readFileSync('src/components/dashboard/RegisterClose.tsx', 'utf8');
ok('POS-5: the close-out opens straight to the count, still BLIND until saved', close.includes('useEffect(() => { if (page) load(); }, [page, load]);') && close.includes("const show = (c: number) => (revealed ? usd(c) : '—');") && close.includes('{!revealed && <p className="mt-1 text-[12.5px] text-ink-muted">Shows once the count is saved.</p>}') && close.includes("{revealed && diff !== null ?"));
// Cam 2026-11-12 (approved Close out): tap-only — the steppers' sum is the counted total that is saved; no tap, no count.
ok('POS-5: bills & coins add up to the same counted total that is saved', close.includes('const notesCents = NOTES.reduce((s, [v]) => s + (notes[v] ?? 0) * v, 0);') && close.includes('const countedCents = touched ? notesCents : null;') && close.includes('countedCashCents: countedCents') && !close.includes("'Bills & coins'"));

const stock = readFileSync('src/components/dashboard/StockTab.tsx', 'utf8');
const form = readFileSync('src/components/dashboard/ItemForm.tsx', 'utf8'), many = readFileSync('src/components/dashboard/UploadMany.tsx', 'utf8');
ok('POS-8: one form adds and edits — photo, name and price, category, stock (delivery, reorder, cost), barcode, sizes, one Save', form.includes("action: 'receive'") && form.includes("action: 'reorder'") && form.includes("action: 'cost'") && form.includes(">+ Log a delivery</button>") && (form.match(/type="submit"/g) ?? []).length === 1 && stock.includes('<ItemForm') && stock.includes('<UploadMany'));
ok('POS-8 review: an On hand left as shown (or under a delivery) is KEPT by the server — an oversold item saves, a sale while the form is open isn\'t written over', form.includes("const kept = (id: string, touched: boolean) => !!id && ((!!delivery && delivery.optId === id) || !touched);") && form.includes('setOnHandTouched(true)') && form.includes('{ keepStock: true }') && readFileSync('src/lib/shop-catalog.ts', 'utf8').includes('...(keepItem && !it.options.length ? {} : { stockCount: it.stockCount }),'));
ok('POS-8 review: what didn\'t save is shown by the page (a reload can\'t wipe it)', form.includes("await onSaved('', `${name.trim()} saved, but not all of it:") && stock.includes("const done = async (msg: string, failed?: string) => { setError(failed ?? '');"));
ok('POS-8: add many is ONE upload — CSV read exactly, PDF / photo to the AI reader; no Quick add', many.includes('const r = parseImport(await file.text());') && many.includes("{ file: { type: 'application/pdf', data: await toBase64(file) } }") && !stock.includes('STARTERS') && !stock.includes('Quick add'));
// Cam 2026-11-12 (approved Stock): one Filter menu (Sold out / Low / Hidden, then the categories) and "+ Add" for one or many.
ok('POS-8: the Stock list is lean, with Sold out / Low / Hidden in one Filter and deliveries behind a link', stock.includes("{ key: 'out', label: 'Sold out', count: counts.out") && stock.includes("{ key: 'hidden', label: 'Hidden', count: counts.hidden") && stock.includes("{ key: 'many', label: 'Many at once'") && stock.includes('Recent deliveries'));
ok('POS-6 review: a reload that fails after a save shows the error, never "saved" over old rows', stock.includes("const ok = await load(); setNote(ok ? msg : '');") && stock.includes('{loadError && <div className="mt-3"><LoadError'));
ok('POS-6: cost only for the owner (the route decides)', stock.includes('const canCost = !!stock?.canCost;') && form.includes('{canCost && <label><span className={LBL}>Cost</span>'));
ok('POS-8: a sold-out item asks "Sell anyway?" on tap or scan — never "oversold"', page.includes('— none left by the count. Sell anyway?') && page.includes('if (hit) { setQ(\'\'); setError(\'\'); if (tryAdd(hit.id))') && !page.includes('stockWords('));
ok('POS-6: Settings no longer edits items or packs', !readFileSync('src/app/dashboard/settings/page.tsx', 'utf8').includes('<ShopCatalog') && !readFileSync('src/app/dashboard/settings/page.tsx', 'utf8').includes('<RoundPacks'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
