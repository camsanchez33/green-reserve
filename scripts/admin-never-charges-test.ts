// Cam 2026-11-12: "we cant be able to just charge people … it is not allowed or in our responsibility to retry
// the payment". GreenReserve's admin never charges, retries or cancels a golfer's booking: the round is the
// course's sale on the course's Stripe account. Refunds stay (they give money back). Reads the sources.
// Run: npx tsx scripts/admin-never-charges-test.ts
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

let failed = 0;
const check = (label: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };
const walk = (d: string): string[] => existsSync(d) ? readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []; }) : [];

check('the retry-charge route is gone', !existsSync('src/app/api/admin/retry-charge'));

// Anything that takes money from a golfer's card, or cancels (which can charge a late fee).
const CHARGERS = /@\/lib\/checkin-booking|@\/lib\/cancel-booking|performCancellation\(|chargeOnConnectedAccount|chargeOneIntent|paymentIntents\.create|chargeNoShow|chargeAccessFeeSeparately|collectPayment\(|performCheckIn\(/;
for (const f of [...walk('src/app/api/admin'), ...walk('src/app/api/cam')]) {
  // Comments may name a charger (to explain a figure); only code counts.
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
  const hit = src.match(CHARGERS);
  // Closing or archiving a course cancels its future bookings with waiveFee: true (no charge); that path lives in
  // src/lib/course-closure-style helpers, not in these routes. Any direct hit here is a door to charging a golfer.
  check(`${f} never charges or cancels a golfer`, !hit, hit?.[0]);
}

for (const f of ['src/app/admin/revenue/page.tsx', 'src/app/admin/courses/[id]/_parts/MoneyTab.tsx', 'src/app/admin/courses/[id]/_parts/OperateTab.tsx', 'src/app/admin/golfers/page.tsx', 'src/app/admin/courses/[id]/_parts/useCourseDetail.tsx']) {
  const src = readFileSync(f, 'utf8');
  check(`${f} offers no retry`, !/Retry charge|Retrying|retry-charge/.test(src));
  check(`${f} offers no cancel for a golfer`, !/cancel_booking|action: 'cancel'|Cancel for them/.test(src));
}

const errs = readFileSync('src/lib/stripe-errors.ts', 'utf8');
check('failed-charge labels never tell anyone to retry', !/\bretry\b/i.test(errs.slice(errs.indexOf('const PATTERNS'))));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
