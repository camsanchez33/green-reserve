// The tee sheet and Home stress tests (2026-11-10): the clear bugs they found are pinned here.
// Run: npx tsx scripts/stress-1110-test.ts
import { readFileSync } from 'fs';
import { getBookingStatus } from '../src/lib/booking-status';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

// Home.
const home = read('src/app/dashboard/home/page.tsx');
ok('the Next tee times scroller holds its screen-reader text (no sideways page scroll on a phone)', home.includes('<div className="relative flex overflow-x-auto px-2 pb-2 pt-1">'));
ok('Home re-reads itself each minute and when the tab comes back, quietly, never while typing', home.includes('setInterval(tick, 60_000)') && home.includes("addEventListener('visibilitychange', tick)") && home.includes('load(true)') && home.includes("el.tagName === 'INPUT'"));
ok('a quiet re-read that fails keeps what is on screen', home.includes("if (!quiet) setError(r.ok ? 'Nothing came back — try again.' : r.error)"));
ok('no stray "None." in Action needed: the declined list shows only when there are declined cards', home.includes('{home.declinedTotal > 0 && <DeclinedCardList'));
ok('removing a declined card re-reads the counts', home.includes('onRemoved={() => load(true)}') && read('src/components/dashboard/DeclinedCardList.tsx').includes('onRemoved?.();'));
ok('the three board cards never share a React key', home.includes("key={'notes:' +") && home.includes("key={'cond:' +") && home.includes("key={'goals:' +"));
ok('rain shows on a tee time only from 20%, and the time never wraps', home.includes('(h.rainPct ?? 0) >= 20') && home.includes('flex items-baseline gap-2 whitespace-nowrap'));
ok('a login without Messages sees no unread tile and never asks for the count', home.includes("access.can('messages.use') ? [{ label: 'Unread messages'") && read('src/components/OperatorSidebar.tsx').includes("const seesMessages = access.loaded && access.can('messages.use');"));
const oh = read('src/lib/operator-home.ts');
ok('a blocked time that still holds a group stays on Home (late, no-shows, next), with no open seats', oh.includes("OR: [{ status: { not: 'blocked' } }, { bookings: { some: LIVE } }]") && oh.includes("open: s.status === 'blocked' ? 0 :"));

// Tee sheet.
const page = read('src/app/dashboard/page.tsx');
const loud = page.split('\n').filter(l => l.includes('loadTimes(selectedDate)'));
ok('after an action the sheet re-reads quietly (no spinner); only the day change, Retry, Refresh, a failed weather run and a new time show it', loud.length === 5);
ok('the background re-read keeps running while the check-in steps are open (a pay link sent from them shows paid)', page.includes('busyRef.current = !!(checkingInId || rowBusy || cardModalBooking || moveTarget);'));
ok('the golfer\'s pay page offers a new card after a definite decline; after a charge that may have gone through it keeps only the saved card', read('src/app/api/checkin/[bookingId]/route.ts').includes('hasCard: !!booking.stripePaymentMethodId && !(booking.checkInFailReason && !booking.shopLockedAt),'));
ok('Home\'s Retry re-reads loudly and a good read clears the error', home.includes('onRetry={() => load()}') && !home.includes('onRetry={load}') && home.includes("setHome(r.data); setError('');"));
ok('a declined card can be texted or emailed a pay link', page.includes("const canTextLink = b.status === 'confirmed' && (b.hasCard === false || !!b.checkInFailReason) &&") && page.includes("const canEmailLink = b.status === 'confirmed' && (b.hasCard === false || !!b.checkInFailReason) &&"));
ok('the change due stays in the checked-in box', page.includes("how: change > 0 ? `Cash · change $${(change / 100).toFixed(2)}` : 'Cash'"));
ok('cash tenders are real buttons, 40px tall', (page.match(/onClick=\{\(\) => takeCash\(c?\)\} className="min-h-\[40px\]/g) ?? []).length === 2);
ok('"The other 1 stays booked"', page.includes("${rest === 1 ? 'stays' : 'stay'} booked."));
ok('the cancel confirm names the button the card shows', read('src/lib/cancel-confirm.ts').includes('Use “Cancel, waive the fee”') && page.includes('<span>Cancel, waive the fee</span>'));
ok('a group paid online, not yet here, reads "Paid online" (not "Card on File")', getBookingStatus('confirmed', 'paid').label === 'Paid online' && getBookingStatus('confirmed', 'card_on_file').label === 'Card on File');

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
