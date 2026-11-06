// CHECKOUT-1/2 (Cam 2026-11-06, the tee sheet's group card: "clean, more POS like" — after Square's Charge screen;
// "it shouldn't have a pay separately button when they can adjust how many people are paying"): one "Paying now"
// stepper — who isn't paying now stays booked as their own group, paid next (Cam 2026-11-06: no choice for them, "no need
// for this"); a receipt and the total; ONE
// Charge button that opens the payment screen — the amount, a Cash row with one-tap amounts (exact, the next $20 /
// $50 / $100, Custom) and one row per other way to pay. Every way keeps exactly its old permission and condition,
// and charges exactly cardDue / cashDue, the figures the server charges.
// Run: npx tsx scripts/checkout-card-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
const route = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
const sales = readFileSync('src/lib/shop-sales.ts', 'utf8');

ok('one "Paying now" stepper; Pay separately is gone', page.includes('<span className="text-[13px] font-medium text-ink">Paying now</span>') && !page.includes('>Pay separately</button>') && !page.includes('>Showed up</span>'));
ok('short of the group: no choice for the rest — they stay booked (only a group that can\'t split is told they won\'t be charged)', !page.includes('Pays on their own now') && !page.includes('restMode') && page.includes('{rest > 0 && !restSplit && <p className="text-[12.5px] text-warn">The other {rest} won’t be charged.</p>}'));
ok('Charge opens the payment screen; the server splits the rest off as it charges (PARTIAL-1)', page.includes('const charge = () => setPaySheet(b.id);'));
ok('one Charge button with the card total', page.includes("`Charge${showMoney ? ` $${(cardDue / 100).toFixed(2)}` : ''}`"));
ok('the ways keep their old permissions', page.includes("const cardOk = b.status !== 'completed' && b.status !== 'cancelled' && b.paymentStatus !== 'manual' && access.can('sheet.checkin');")
  && page.includes("const cashOk = canCash || (b.status === 'confirmed' && b.paymentStatus === 'manual' && access.can('sheet.counter_payment'));")
  && page.includes('{canReader && <Link href={`/dashboard/shop?round=${b.id}`}') && page.includes('{canTextLink && <button') && page.includes('{canEmailLink && <button') && page.includes('{canAccount && ('));
ok('the payment screen: the amount, then a row per way to pay', page.includes('How are they paying?') && page.includes('>Card on file</span>') && page.includes('Text a pay link') && page.includes('Email a pay link'));
ok('cash: one tap for exact or the next $20 / $50 / $100, or Custom', page.includes('[2000, 5000, 10000].map(u => Math.ceil((cashDue + 1) / u) * u)') && page.includes('onClick={() => takeCash()}') && page.includes('onClick={() => takeCash(c)}') && page.includes('>Custom</button>'));
ok('the cash handed over goes to the register sale; the server checks it covers the total', page.includes('{ tenderedCents: tendered && tendered > cashDue ? tendered : undefined }') && page.includes('...(cash?.tenderedCents ? { cashTenderedCents: cash.tenderedCents } : {})')
  && route.includes('cashTenderedCents, soldBy: session.email, actor: staff,') && sales.includes('has to cover the'));
ok('custom cash: short or garbled cannot be taken', page.includes('disabled={rowBusy === b.id || garbled || givenCents < cashDue}') && page.includes('const garbled = !Number.isFinite(givenRaw);'));
ok('cash shows its own price once, never beside a second figure for the same person', page.includes('cashDue !== cardDue ? <span className="text-ink-muted"> · ${(cashDue / 100).toFixed(2)}, no booking fee</span>'));
ok("the change toast uses the sale's own total and tender", page.includes('r.data.cashTenderedCents - r.data.totalCents'));
ok("no browser pop-up from the card's cash", page.includes('if (!cash && !confirm(`Take $'));
ok('the reader says when it charges the whole group (the register has no headcount)', page.includes('charges the whole group'));
ok('Move / Change group size / Cancel sit under More', page.includes("{moreFor === b.id ? 'Less' : 'More'}") && page.includes('moreFor === b.id && canSizeGroup && (') && page.includes("moreFor === b.id && b.status === 'confirmed' && !teedOff && access.can('sheet.cancel') && ("));
ok('no-show and running late stay in sight', page.includes("{noShowReady && access.can('sheet.no_show') && (") && page.includes('Running late</button>'));
ok("the time's header names the round once", page.includes('{roundName(panelSlot)} · ${panelSlot.greenFee.toFixed(2)} a player'));
ok('"Pays in store" stands alone', page.includes("b.paymentStatus !== 'manual' && <span className=\"text-ink-muted\"> · {bStatus.sublabel}</span>"));
ok('no reader: owners get the link, staff are told', page.includes('>Connect a card reader</Link>') && page.includes('No card reader connected'));

ok('no split happens in the browser before a charge (nothing to half-finish)', !page.includes('async function splitOff('));
ok('review: the payment screen only for a group that still pays, and closes with the card', page.includes('const sheetOpen = paySheet === b.id && anyWay && unpaid && !prepaid;') && page.includes('useEffect(() => { setPaySheet(null); setMoreFor(null); }, [panelId]);'));
ok('review: no ruled box inside the card', page.includes('<div className="mt-3 rounded-[7px] bg-paper/70">') && !page.includes('rounded-[10px] border border-line bg-white'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
