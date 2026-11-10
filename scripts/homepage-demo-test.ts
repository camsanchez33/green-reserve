// The homepage demo copies the real tee sheet label for label (HOME-2, "it needs to actually be accurate").
// Each label below must be in the real source AND in the demo, so a change to one fails here until the other
// follows. Source-level. Pure. Run: npx tsx scripts/homepage-demo-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
const rows = readFileSync('src/components/dashboard/TeeSheetRows.tsx', 'utf8');
const rail = readFileSync('src/components/OperatorSidebar.tsx', 'utf8');
const demo = readFileSync('src/components/home/TeeSheetDemo.tsx', 'utf8');
const css = readFileSync('src/app/home.module.css', 'utf8');
const globals = readFileSync('src/app/globals.css', 'utf8');

const both = (label: string, real: string, inDemo = label) => check(`"${label}" on the sheet and in the demo`, real.includes(label) && demo.includes(inDemo));
// The strip (SHEET-3, ONCOURSE-1).
for (const l of ['Players', 'On the course', 'Groups booked', 'Checked in', 'Paid', 'Not paid yet']) both(l, page, `<small>${l}</small>`);
both('spots booked', page);
// The bar, the key and the card.
for (const l of ['All on time', 'Edit group', 'Cancel booking', 'Add players', 'Open seats', 'Closed · reopen this time', 'Close a seat', 'Reopen a seat', 'Booked online', 'Phone booking', 'no card saved', 'Next up', 'Nobody is booked yet.']) both(l, page);
check('"Closed" seat cells on the sheet and in the demo', rows.includes('>Closed</span>') && demo.includes('>Closed</span>'));
for (const l of ['Grid', 'List', 'Calendar']) check(`the ${l} view on the sheet and in the demo`, page.includes(`'${l}'`) || page.includes(`>${l}<`) ? demo.includes(`>${l}<`) : false);
// The rail (DASH-D): its groups and tabs, in order.
for (const l of ['Today', 'Business', 'Home', 'Tee sheet', 'Pro shop', 'Messages', 'Money', 'Members', 'Events', 'Schedule', 'Analytics', 'Settings']) both(l, rail, `'${l}'`);
// Colours: the fills and the rail are the real tokens.
for (const [tok, cls] of [['--color-paid-fill:   #CFE8D6', '.seatPaid { background: #CFE8D6; }'], ['--color-owes-fill:   #F7E1B5', '.kWarn { background: #F7E1B5; }'], ['--color-bad-fill:    #F4CFC6', '.kBad { background: #F4CFC6; }'], ['--color-rail:        #E3E6DE', 'background: #E3E6DE;']] as const) {
  check(`${cls} matches ${tok}`, globals.includes(tok) && css.includes(cls));
}
// Money: the strip is the course's own (no booking fee); the card shows the fee only on a paid online group.
check('the strip sums green fees only', demo.includes('courseShare(d, paid)') && demo.includes('courseShare(d, owes)') && demo.includes('v + g.n * d.rate'));
check('the card leaves the booking fee off unpaid and counter-paid groups', demo.includes("g.done && g.src === 'online' ? roundTotal(d, g.n) : g.n * d.rate"));
check('the header says closed before Full, as the real card', page.includes("`${panelSlot.seatsClosed} closed`") && demo.includes('closed > 0 ? `${closed} closed`'));
// Labels the product no longer has stay out of the demo.
for (const gone of ['Take cash · check in', 'Close to new bookings', 'Open to anyone', 'tee times</span>', 'No Card Required']) check(`the demo no longer says "${gone}"`, !demo.includes(gone));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
