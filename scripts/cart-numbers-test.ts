// CART-4 (Cam 2026-11-09): cart numbers, the cart ticket and the starter's day sheet. Pure + string pins.
import { readFileSync } from 'fs';
import { starterColumns, DEFAULT_STARTER_COLUMNS, tidyCartNumbers, cartNumberMode, cartTicketMode, ticketPrinted, ticketOnReceipt } from '../src/lib/starter-sheet';
import { validateSettingsPatch } from '../src/lib/settings-validation';

let failed = 0;
const ok = (name: string, cond: boolean, extra?: unknown) => { if (cond) console.log('PASS ', name); else { failed++; console.log('FAIL ', name, extra ?? ''); } };
const read = (p: string) => readFileSync(p, 'utf8');

ok('no columns picked = the default set', JSON.stringify(starterColumns([])) === JSON.stringify(DEFAULT_STARTER_COLUMNS));
ok('columns keep the catalog order and drop unknown keys', JSON.stringify(starterColumns(['paid', 'nope', 'time'])) === '["time","paid"]');
ok('cart numbers are tidied', tidyCartNumbers(' 12,14 , 9 ') === '12, 14, 9' && tidyCartNumbers('') === '' && tidyCartNumbers('1 2 3 4 5 6 7 8 9').split(', ').length === 8);
ok('unknown modes read as off', cartNumberMode('x') === 'off' && cartTicketMode(null) === 'off' && cartNumberMode('starter') === 'starter');
ok('ticket modes', ticketPrinted('both') && ticketPrinted('printed') && !ticketPrinted('receipt') && ticketOnReceipt('both') && ticketOnReceipt('receipt') && !ticketOnReceipt('printed'));

const v = validateSettingsPatch({ cartNumbers: 'required', cartTicket: 'both', starterColumns: ['notes', 'time', 'bogus'] }, ['cartNumbers', 'cartTicket', 'starterColumns']);
ok('settings accept the three', v.ok && v.data.cartNumbers === 'required' && v.data.cartTicket === 'both' && JSON.stringify(v.data.starterColumns) === '["time","notes"]', v);
ok('settings refuse a made-up mode', !validateSettingsPatch({ cartNumbers: 'always' }, ['cartNumbers']).ok);
ok('the settings route allows them', read('src/app/api/operator/settings/route.ts').includes("'cartNumbers','cartTicket','starterColumns',"));

const route = read('src/app/api/operator/cart-numbers/route.ts');
ok('cart numbers: sheet.checkin to write, sheet.view to read', route.includes("requirePermission(session, 'sheet.checkin')") && route.includes("requirePermission(session, 'sheet.view')"));
ok('cart numbers: only this course, never a cancelled booking', route.includes("where: { id, courseId: session.courseId, status: { not: 'cancelled' } }"));
ok('the receipt shows cart numbers only when the course picked it', read('src/app/api/receipt/[bookingId]/route.ts').includes('ticketOnReceipt(booking.course.cartTicket) && booking.cartSelected'));
ok('the starter writes them in: the column is left blank', read('src/app/dashboard/starter/page.tsx').includes("case 'carts': return mode === 'starter' ? '' : (b.cartNumbers ?? '');"));
ok('phone on the starter sheet comes from the sheet route, blank without sheet.golfer_contact', read('src/app/api/operator/tee-times/route.ts').includes("...(contact ? {} : { golferEmail: '', golferPhone: '' })"));

console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
