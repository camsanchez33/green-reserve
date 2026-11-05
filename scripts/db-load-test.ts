// AUDIT-1 (database audit 2026-11-05): what keeps the database steady as the platform grows.
//  1. The hourly and daily crons read only tee dates that can still be due — not every booking ever made.
//  2. Stripe-id lookups (webhook, refunds, hold shares) and the rate-limit sweep have indexes.
//  3. The tee sheet's money strip re-asks only when a group's money changed (or every 5 minutes), not on every 30s re-read.
// Run: npx tsx scripts/db-load-test.ts
import { readFileSync } from 'fs';
import { teeDateWindow, FEE_DATES, CHECKIN_DATES } from '../src/lib/cron-windows';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const now = new Date('2026-11-05T12:00:00Z');
const w = teeDateWindow(now, FEE_DATES);
ok('fee bookings: two days back (a hold is never charged a day after the round) to 16 ahead (a 14-day window + its warning)', w.gte === '2026-11-03' && w.lte === '2026-11-21', w);
const c = teeDateWindow(now, CHECKIN_DATES);
ok('check-in links: a day back to three ahead (at most 48 hours before the round)', c.gte === '2026-11-04' && c.lte === '2026-11-08', c);
const val = readFileSync('src/lib/settings-validation.ts', 'utf8');
ok('…and those windows still cover the longest settings allowed', val.includes('export const CANCELLATION_HOURS_MAX = 24 * 14;') && val.includes('cancellationHours: [0, CANCELLATION_HOURS_MAX]') && val.includes('checkInWindowHours: [0, 48]'));
ok('…at every writer: the admin course settings and a course built from an enquiry are held to the same limit',
  readFileSync('src/app/api/admin/course-settings/route.ts', 'utf8').includes('h > CANCELLATION_HOURS_MAX') && readFileSync('src/app/api/admin/inquiries/route.ts', 'utf8').includes('Math.min(CANCELLATION_HOURS_MAX,'));
const hourly = readFileSync('src/app/api/cron/hourly/route.ts', 'utf8');
ok('the hourly cron bounds both booking reads by tee date', hourly.includes('teeTime: { date: teeDateWindow(now, FEE_DATES) }') && hourly.includes('teeTime: { date: teeDateWindow(now, CHECKIN_DATES) }'));
ok('…and so does the daily safety net', readFileSync('src/app/api/cron/cancellation-cutoff/route.ts', 'utf8').includes('teeTime: { date: teeDateWindow(now, FEE_DATES) }'));
const schema = readFileSync('prisma/schema.prisma', 'utf8');
const model = (m: string) => schema.slice(schema.indexOf(`model ${m} {`), schema.indexOf('\n}', schema.indexOf(`model ${m} {`)));
ok('bookings are indexed by every Stripe id the webhook and refunds look up', ['roundPaymentIntentId', 'cancellationFeeChargeId', 'stripePaymentIntentId', 'feePaymentIntentId'].every(f => model('Booking').includes(`@@index([${f}])`)));
ok('payment events by Stripe id; rate limits by window age', model('PaymentEvent').includes('@@index([stripeId])') && model('RateLimit').includes('@@index([windowStart])'));
ok('the hourly sweep clears rate-limit rows past the longest window', readFileSync('src/lib/security-events.ts', 'utf8').includes('{ windowStart: { lt: new Date(now.getTime() - 31 * 24 * HOUR) } }'));
const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
ok('the sheet’s money strip re-asks on a money change (a no-show too) or every 5 minutes, not every re-read', page.includes('}, [canSeeMoney, selectedDate, moneyKey]);') && page.includes('Math.floor(Date.now() / 300_000)') && page.includes("${b.noShowAt ?? ''}"));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
