// CHECKOUT-1 (Cam 2026-11-06, the tee sheet's group card — "a couple of the buttons on the bottom look a little
// confusing, they don't explain what they are doing"; "the take cash thing … should ask how much cash was
// given"; "make this [Showed up] look better"): "How are they paying?" lists only the ways this group can
// pay (the same permissions and rules as before), then ONE button that says what happens; cash asks for the
// cash given and shows the change, and the server checks it covers the total; Showed up is a − / + stepper.
// Run: npx tsx scripts/checkout-card-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
const route = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
const sales = readFileSync('src/lib/shop-sales.ts', 'utf8');

ok('one "How are they paying?" choice, only the ways that apply', page.includes('aria-label="How are they paying?"') && page.includes("...(cashOk ? [['cash', 'Cash']") && page.includes("...(canAccount ? [['account', 'On account']") && page.includes("...(canTextLink ? [['text', 'Text pay link']"));
ok('the ways keep their old permissions', page.includes("const cardOk = b.status !== 'completed' && b.status !== 'cancelled' && b.paymentStatus !== 'manual' && access.can('sheet.checkin');")
  && page.includes("const cashOk = canCash || (b.status === 'confirmed' && b.paymentStatus === 'manual' && access.can('sheet.counter_payment'));"));
ok('a pays-in-store group starts on Cash', page.includes("(b.paymentStatus === 'manual' && cashOk ? 'cash' : ways[0]?.[0])"));
ok('the button says what it does, with the headcount', page.includes('`Charge card on file${money(cardDue)} · check in${who}`') && page.includes('cash · check in${who}`'));
ok('cash asks what was handed over and shows the change', page.includes('>Cash given</label>') && page.includes('Change <b>${(change / 100).toFixed(2)}</b>') && page.includes('`Short $${((cashDue - givenCents) / 100).toFixed(2)}`'));
ok('short cash cannot be taken; the cash handed over goes to the register sale', page.includes('disabled={rowBusy === b.id || short}') && page.includes('...(cash?.tenderedCents ? { cashTenderedCents: cash.tenderedCents } : {})')
  && route.includes('cashTenderedCents, soldBy: session.email, actor: staff,') && sales.includes('has to cover the'));
ok('Exact sends no tendered amount (the server total is the one charged)', page.includes('{ tenderedCents: givenCents > cashDue ? givenCents : undefined }'));
ok("no browser pop-up from the card's cash step", page.includes('if (!cash && !confirm(`Take $'));
ok('Showed up is a − / + stepper', page.includes('aria-label="One fewer"') && page.includes('aria-label="One more"') && page.includes('<b>{herePlayers}</b> of {b.players}'));
ok("the time's header names the round once", page.includes('{roundName(panelSlot)} · ${panelSlot.greenFee.toFixed(2)} a player') && !page.includes("panelSlot.product?.label ? `${panelSlot.product.label} · ` : ''}{panelSlot.holes} holes"));
ok('"Pays in store" stands alone (its sublabel repeated the line above)', page.includes("b.paymentStatus !== 'manual' && <span className=\"text-ink-muted\"> · {bStatus.sublabel}</span>"));
ok('Edit group says what it does', page.includes('>Change group size</button>'));
ok('no reader: owners get the link, staff are told', page.includes('>Connect a card reader</Link>') && page.includes('No card reader connected'));

ok('quick amounts are the next $20, $50 and $100 above what is owed', page.includes('[2000, 5000, 10000].map(u => Math.ceil((cashDue + 1) / u) * u)'));

ok('review: the reader quotes only what the register charges (the whole group)', page.includes("herePlayers === b.players ? money(b.totalAmount + shopExtra(b))") && !page.includes('Send{money(cardDue)'));
ok("review: the change toast uses the sale's own total and tender", page.includes('r.data.cashTenderedCents - r.data.totalCents'));
ok('review: a garbled amount is never taken as exact', page.includes('const garbled = !Number.isFinite(givenRaw);') && page.includes('const short = garbled ||'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
