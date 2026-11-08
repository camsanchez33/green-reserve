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

ok('CHECKIN-1: check-in goes in order — who\'s here, add to order, payment (Cam 2026-11-08)', page.includes("const STEPS = ['Who’s here', 'Add to order', 'Payment'];") && page.includes('How many are here?') && page.includes('Anything to add?') && !page.includes('>Pay separately</button>'));
ok('short of the group: the rest stay booked (a group that can\'t split is told they won\'t be charged)', !page.includes('Pays on their own now') && page.includes("{restSplit ? `The other ${rest} stay booked.` : `The other ${rest} won’t be charged.`}"));
ok('one Check in button: who\'s here first for a group (declined too), then payment; paid ahead checks in whole (review 2026-11-08)', page.includes("const start = () => prepaid ? checkInBooking(b, cardDue) : go(b.players > 1 ? 1 : b.checkInFailReason ? 3 : 2);") && page.includes("onClick={() => go(b.checkInFailReason ? 3 : 2)}") && page.includes("const inFlow = flow?.id === b.id && b.status === 'confirmed' && unpaid && !prepaid;"));
ok('the round is shown without the booking fee; card rows say the card total with it', page.includes('<GroupTicket booking={b} here={herePlayers} withFee={false} />') && page.includes('with booking fee</span>'));
ok('one price for the round on the payment step (cash), the card total only on the card rows', page.includes("{showMoney && <div className=\"text-[34px] font-semibold tracking-[-0.02em] text-ink tabular-nums\">${(cashDue / 100).toFixed(2)}</div>}"));
ok('type a card for every unpaid group (Cam 2026-11-06), counter bookings too', page.includes("const cardOk = b.status !== 'completed' && b.status !== 'cancelled' && access.can('sheet.checkin');") && page.includes("{b.checkInFailReason ? 'Type a new card' : 'Type a card'}"));
ok('the ways keep their old permissions', page.includes("const cardOk = b.status !== 'completed' && b.status !== 'cancelled' && access.can('sheet.checkin');")
  && page.includes("const cashOk = canCash || (b.status === 'confirmed' && b.paymentStatus === 'manual' && access.can('sheet.counter_payment'));")
  && page.includes('{canReader && onReader?.bookingId !== b.id && (') && page.includes('{canTextLink && <button') && page.includes('{canEmailLink && <button') && page.includes('{canAccount && ('));
ok('the payment screen: the amount, then a row per way to pay', page.includes('How are they paying?') && page.includes('>Card on file</span>') && page.includes('Text a pay link') && page.includes('Email a pay link'));
ok('cash: one tap for exact or the next $20 / $50 / $100, or Custom', page.includes('[2000, 5000, 10000].map(u => Math.ceil((cashDue + 1) / u) * u)') && page.includes('onClick={() => takeCash()}') && page.includes('onClick={() => takeCash(c)}') && page.includes('>Other</button>'));
ok('the cash handed over goes to the register sale; the server checks it covers the total', page.includes('{ tenderedCents: tendered && tendered > cashDue ? tendered : undefined }') && page.includes('...(cash?.tenderedCents ? { cashTenderedCents: cash.tenderedCents } : {})')
  && route.includes('cashTenderedCents, soldBy: session.email, actor: staff,') && sales.includes('has to cover the'));
ok('custom cash: short or garbled cannot be taken', page.includes('disabled={rowBusy === b.id || garbled || givenCents < cashDue}') && page.includes('const garbled = !Number.isFinite(givenRaw);'));
ok('cash shows its own price once — the round total — never a second figure', page.includes('<span className="text-[14px] text-ink mr-auto">Cash</span>') && !page.includes(', no booking fee</span>'));
ok("the change toast uses the sale's own total and tender", page.includes('r.data.cashTenderedCents - r.data.totalCents'));
ok("no browser pop-up from the card's cash", page.includes('if (!cash && !confirm(`Take $'));
ok('the reader says when it charges the whole group (the register has no headcount)', page.includes('charges the whole group'));
ok('Move / number of players / residents / cancel sit under one Edit group menu (Cam 2026-11-08)', page.includes('>Edit group</button>') && page.includes('<span>Move to another time</span>') && page.includes('{canResidents && (') && page.includes("const canCancel = b.status === 'confirmed' && !teedOff && access.can('sheet.cancel');"));
ok('no-show and running late stay in sight', page.includes("{noShowReady && access.can('sheet.no_show') && (") && page.includes('Running late</button>'));
ok("the time's header names the round once", page.includes('{roundName(panelSlot)} · ${panelSlot.greenFee.toFixed(2)} a player'));
ok('an unpaid group says how it booked and whether a card is saved (Cam 2026-11-08), not a status sentence', page.includes("{b.source === 'phone' ? 'Phone booking' : b.source === 'walk_in' ? 'Walk-in' : 'Booked online'} · {b.hasCard ? 'card saved' : 'no card saved'}") && !page.includes('{bStatus.sublabel}'));
ok('no reader: owners get the link, staff are told', page.includes('<span className="text-ink-soft">Connect a card reader</span>') && page.includes('No card reader connected'));

ok('no split happens in the browser before a charge (nothing to half-finish)', !page.includes('async function splitOff('));
ok('review: the steps only for a group that still has something to do, and close with the card', page.includes("const inFlow = flow?.id === b.id && b.status === 'confirmed' && unpaid && !prepaid;") && page.includes('useEffect(() => { setFlow(null); setMoreFor(null); }, [panelId]);'));
ok('review: no ruled box inside the card', page.includes('<div className="mt-3 rounded-[7px] bg-paper/70 px-4 pt-3 pb-4">') && !page.includes('rounded-[10px] border border-line bg-white'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
