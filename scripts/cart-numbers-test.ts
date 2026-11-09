// CART-4 (Cam 2026-11-09): cart numbers, the cart ticket and the starter's day sheet. Pure + string pins.
import { readFileSync, existsSync } from 'fs';
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
ok('every receipt with a cart shows the cart line (no separate cart ticket)', read('src/app/api/receipt/[bookingId]/route.ts').includes('cartTicket: booking.cartSelected ? { riders: booking.cartRiders ?? booking.players } : null'));
// CART-5 (Cam 2026-11-09): "on the receipt it should just say that they paid for a cart … the starter will write the
// cart number onto their sheet": no cart number on the receipt or the printed slip; the sheet keeps a line to write on.
ok('the receipt says the cart is paid, never a cart number', !read('src/app/api/receipt/[bookingId]/route.ts').includes('numbers: booking.cartNumbers') && read('src/app/receipt/[bookingId]/page.tsx').includes('{cartState} · {data.cartTicket.riders} of {data.players} riding') && read('src/app/receipt/[bookingId]/page.tsx').includes("isCompleted ? 'Paid' : isCancelled ? 'Cancelled' : 'Due at course'") && !read('src/app/receipt/[bookingId]/page.tsx').includes('Cart numbers'));
ok('no printed cart ticket: no page, no link, no setting', !existsSync('src/app/dashboard/cart-ticket/page.tsx') && !read('src/components/dashboard/CheckoutExtras.tsx').includes('cart-ticket') && !read('src/app/dashboard/settings/page.tsx').includes('label="Cart ticket"'));
ok('the starter sheet gives an empty cart cell a line to write on', read('src/app/dashboard/starter/page.tsx').includes('data-write-in="cart"'));
ok('the starter writes them in: the column is left blank', read('src/app/dashboard/starter/page.tsx').includes("case 'carts': return mode === 'starter' ? '' : (b.cartNumbers ?? '');"));
ok('phone on the starter sheet comes from the sheet route, blank without sheet.golfer_contact', read('src/app/api/operator/tee-times/route.ts').includes("...(contact ? {} : { golferEmail: '', golferPhone: '' })"));

console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
