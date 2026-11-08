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

ok('three tabs: Register · Sales · Close out (Close out only with shop.close)', page.includes("[['register', 'Register'], ['sales', 'Sales'], ...(access.can('shop.close') ? [['close', 'Close out']] : [])]") && page.includes("{view === 'close' && access.can('shop.close') && <RegisterClose />}"));
ok('one flat list of tiles filtered by the chip — no category headings', page.includes('const shown = useMemo(() => tree') && !page.includes('<h2 className="text-[13px] font-semibold text-ink mb-2">{group}</h2>'));
ok('Custom amount and Round pack are tiles', page.includes('>Custom amount</button>') && page.includes('>Round pack</button>'));
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

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
