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
const CHARGERS = /@\/lib\/checkin-booking|@\/lib\/cancel-booking|performCancellation\(|chargeOnConnectedAccount|chargeOneIntent|paymentIntents\.create|chargeNoShow|chargeAccessFeeSeparately|collectPayment\(|performCheckIn\(|chargeCutoffHold|chargeBookingFee|chargeSale|chargeEventPayment|chargeRenewal|chargeStatement/;
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
  check(`${f} offers no cancel for a golfer`, !/cancel_booking|action: 'cancel'|Cancel for them|cancelBooking\(|Cancelling or refunding/.test(src));
}

// Platform activity (Cam 2026-11-15): "Re-run job" runs a cron's own handler, so the scan above can't see what that
// handler charges. The jobs that charge or retry (CHARGING_JOBS) must never be reachable from it.
{
  const rerun = readFileSync('src/app/api/admin/system/rerun-job/route.ts', 'utf8');
  for (const job of ['hourly', 'cancellation-cutoff', 'send-reminders']) {
    check(`Re-run job cannot reach the charging job ${job}`, !rerun.includes(`cron/${job}/route`));
  }
  // An allowlist, not a name check: every cron the route imports is one of the three that move no money.
  const imported = [...rerun.matchAll(/cron\/([a-z-]+)\/route/g)].map(m => m[1]);
  check('Re-run job imports only generate-tee-times, chase-onboarding and monthly-review', imported.length === 3 && imported.every(j => ['generate-tee-times', 'chase-onboarding', 'monthly-review'].includes(j)), imported.join(', '));
  check('…and the board offers exactly those (RERUN_JOBS)', /RERUN_JOBS = new Set\(\['generate-tee-times', 'chase-onboarding', 'monthly-review'\]\)/.test(readFileSync('src/lib/platform-status.ts', 'utf8')));
  // Access: manager+ and the Company area, before anything runs; refused while a run is going.
  const body = rerun.replace(/^\s*\/\/.*$/gm, '');
  check('Re-run job is manager+ only', /if \(!requireRole\(session, MANAGER_PLUS\)\) return/.test(body));
  check('Re-run job checks the Company area', /areaGate\(session, 'company'\)/.test(body));
  check('Re-run job refuses while a run of the same job is going (409)', /finishedAt: null/.test(body) && /status: 409/.test(body));
  check('Re-run job gates before it runs anything', body.indexOf('MANAGER_PLUS)') < body.indexOf('await handler('));
  const ps = readFileSync('src/lib/platform-status.ts', 'utf8');
  check('the board marks the charging jobs as not re-runnable', /CHARGING_JOBS = new Set\(\['hourly', 'cancellation-cutoff', 'send-reminders'\]\)/.test(ps));
  for (const f of walk('src/app/api/cron')) {
    const job = f.split('/').slice(-2)[0];
    const charges = CHARGERS.test(readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '')) || /chargeOneIntent|chargeRenewal|autoChargeStatement|chargeNoShow|chargeCutoffHold/.test(readFileSync(f, 'utf8'));
    if (charges) check(`${job} charges, so it is listed as a charging job`, ['hourly', 'cancellation-cutoff', 'send-reminders'].includes(job));
  }
}

const errs = readFileSync('src/lib/stripe-errors.ts', 'utf8');
check('failed-charge labels never tell anyone to retry', !/\bretry\b/i.test(errs.slice(errs.indexOf('const PATTERNS'))));

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
