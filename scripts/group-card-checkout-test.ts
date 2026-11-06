// Cam 2026-11-04 on the tee-sheet group card: the booked size lives behind "Edit group", the card
// reader is always on the card for a group that still pays (or says why not), and shop items are
// added the register's way. Unit tests of the line grouping + source pins. Pure.
// Run: npx tsx scripts/group-card-checkout-test.ts
import { readFileSync } from 'fs';
import { groupLines } from '../src/lib/shop-lines';
import { getBookingStatus } from '../src/lib/booking-status';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

// ── groupLines ──
const lines = [
  { id: 'a', name: 'Sleeve of balls', unitPriceCents: 1200, quantity: 1 },
  { id: 'b', name: 'Water', unitPriceCents: 300, quantity: 2 },
  { id: 'c', name: 'Sleeve of balls', unitPriceCents: 1200, quantity: 1 },
  { id: 'd', name: 'Sleeve of balls', unitPriceCents: 1500, quantity: 1 },
];
const g = groupLines(lines);
const sleeve = g.find(x => x.key === 'Sleeve of balls|1200')!;
ok('same item at the same price is one row with the count', g.length === 3 && sleeve.quantity === 2 && sleeve.ids.join() === 'a,c', g);
ok('a repriced item stays its own row', g.some(x => x.key === 'Sleeve of balls|1500' && x.quantity === 1));
ok('the newest line is what − takes off, with its own quantity', sleeve.lastId === 'c' && sleeve.lastQty === 1 && g.find(x => x.name === 'Water')!.lastQty === 2);
ok('grouping never changes the total', g.reduce((s, x) => s + x.unitPriceCents * x.quantity, 0) === lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0));
ok('no lines, no rows', groupLines([]).length === 0);

// ── status line ──
ok('"Pays in store" no longer promises ways to pay the card may not offer', getBookingStatus('confirmed', 'manual').sublabel === 'Walk-in or phone booking — pays at the counter');

// ── the card ──
const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
const shop = readFileSync('src/components/dashboard/ShopItemsForGroup.tsx', 'utf8');
ok('the booked size is behind Edit group, not in the checkout', page.includes('>Change group size</button>') && page.includes('canSizeGroup && editGroupId === b.id') && page.includes('Booked for') && !/\n\s*Players\n\s*<select value=\{b\.players\}/.test(page));
ok('the reader says why not: none connected, or not its day; never on a past day', page.includes("selectedDate < today() ? null : !hasReader ? 'none' : 'day'"));
ok('owners get the link to connect a reader; staff are told there is none', page.includes("readerWhyNot === 'none' && !access.isStaff && <Link href=\"/dashboard/settings?section=Pro+shop\"") && page.includes("readerWhyNot === 'none' && access.isStaff"));
ok('the reader runs on the card itself (Cam 2026-11-06): send, wait for the tap, cancel, paid', page.includes("dfetch<{ status: string; dueCents?: number; message?: string }>('/api/operator/reader-rounds', { method: 'POST', body: JSON.stringify({ bookingId: b.id, readerId }) })") && page.includes("action: 'status'") && page.includes("readerAct('cancel')") && page.includes('Waiting for the card on '));
ok('simulated taps only with test keys', page.includes("{readerTest && onReader.state === 'waiting' && <>"));
ok('+ loads the shop on first use instead of opening the picker', shop.includes('async function more(g: ShopLineGroup)') && shop.includes('const list = await loadCatalog();'));
ok('− on a line saved several at once says how many it removes', shop.includes('g.lastQty > 1 ? `Remove ${g.lastQty} ${g.name}`'));
ok('a scanned SKU is added even when its text matches other items too', shop.includes("shown.find(i => (i.sku || '').toLowerCase() === term)"));
ok('each tile adds one', shop.includes('quantity: 1 })'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
