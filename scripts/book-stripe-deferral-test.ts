// PERF (Cam 2026-10-26): on /book Stripe.js (~600ms of main-thread time) loads
// only at a card course AND only once the golfer starts on the booking form.
// Plus G13-a: the "booking changed" email route is rate limited and reports a
// failed send. Run: npx tsx scripts/book-stripe-deferral-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };

const book = readFileSync('src/app/book/BookClient.tsx', 'utf8');
ok('Stripe is imported from the /pure entry (no script on import)', book.includes("from '@stripe/stripe-js/pure'") && !/from '@stripe\/stripe-js';/.test(book.replace("import type { Stripe } from '@stripe/stripe-js';", '').replace("import type { PaymentRequest } from '@stripe/stripe-js';", '')));
ok('Elements gets Stripe only at a card course once the golfer has started on the form', book.includes('stripe={terms.cardAtBooking && stripeWanted ? getStripePromise() : null}'));
ok('…a first touch or a tab into the form is what asks for it', /onPointerDown=\{\(\) => setStripeWanted\(true\)\} onFocusCapture=\{\(\) => setStripeWanted\(true\)\}/.test(book));
ok('getStripePromise is called nowhere else on the page', (book.match(/getStripePromise\(\)/g) ?? []).length === 2); // its definition + the Elements prop

const mail = readFileSync('src/app/api/manage/[bookingId]/send-modified-email/route.ts', 'utf8');
ok('G13-a: the modified-booking email is rate limited per address and per booking, before any work', mail.indexOf("rateLimit('manage:modified-email:'") > 0 && mail.indexOf("rateLimit('manage:modified-email:b:'") > 0 && mail.indexOf('rateLimit(') < mail.indexOf('prisma.booking.findUnique'));
ok('…its send is awaited and a failure is reported, not swallowed', mail.includes('await sendBookingModifiedEmail(') && !mail.includes('.catch(console.error)') && mail.includes('status: 502'));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('book-stripe-deferral: all passed');
