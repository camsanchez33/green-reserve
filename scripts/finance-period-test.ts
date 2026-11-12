// ADMIN-REDO Financial analytics: the month windows (lib/finance-period) on the platform clock,
// their prior windows and the revenue source buckets. Pure + source guards.
// Run: npx tsx scripts/finance-period-test.ts
import { readFileSync } from 'fs';
import { resolveFinancePeriod, parseFinancePeriod, revenueSource } from '../src/lib/finance-period';
let failed = 0;
const check = (label: string, ok: boolean, info: unknown = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !info ? '' : ' — ' + JSON.stringify(info)}`); if (!ok) failed++; };
const iso = (d: Date) => d.toISOString();

const nov12 = new Date('2026-11-12T19:30:00Z'); // 2:30pm EST
{
  const p = resolveFinancePeriod('y12', nov12);
  check('y12: Dec 2025 … Nov 2026, the last one partial', p.months.length === 12 && p.months[0].month === '2025-12' && p.months[11].month === '2026-11' && p.months[11].partial && !p.months[10].partial, p.months.map(m => m.month));
  check('…months start at Eastern midnight on the 1st (Dec: EST 05:00Z; Jun: EDT 04:00Z)', iso(p.months[0].start) === '2025-12-01T05:00:00.000Z' && iso(p.months[6].start) === '2026-06-01T04:00:00.000Z');
  check('…each month ends where the next starts; the last ends now', p.months.every((m, i) => i === 11 ? m.end.getTime() === nov12.getTime() : m.end.getTime() === p.months[i + 1].start.getTime()));
  check('…from/to are platform days', p.from === '2025-12-01' && p.to === '2026-11-12', [p.from, p.to]);
  check('prior: Dec 2024 to Nov 12 2025 at the same time (EST 19:30Z)', iso(p.prior.start) === '2024-12-01T05:00:00.000Z' && iso(p.prior.end) === '2025-11-12T19:30:00.000Z' && p.priorFrom === '2024-12-01' && p.priorTo === '2025-11-12', [iso(p.prior.start), iso(p.prior.end)]);
  check('month before: Nov 2025, whole', p.monthBefore.month === '2025-11' && p.monthBefore.end.getTime() === p.months[0].start.getTime());
}
{
  const p = resolveFinancePeriod('m3', nov12);
  check('m3: Sep, Oct, Nov', p.months.map(m => m.month).join() === '2026-09,2026-10,2026-11');
  check('…prior: Jun to Aug 12 at the same time (EDT 18:30Z)', iso(p.prior.start) === '2026-06-01T04:00:00.000Z' && iso(p.prior.end) === '2026-08-12T18:30:00.000Z', [iso(p.prior.start), iso(p.prior.end)]);
  check('…month before: Aug', p.monthBefore.month === '2026-08');
}
{
  const p = resolveFinancePeriod('m6', nov12);
  check('m6: Jun … Nov', p.months.map(m => m.month).join() === '2026-06,2026-07,2026-08,2026-09,2026-10,2026-11');
  check('…prior: Dec 2025 to May 12 2026', p.priorFrom === '2025-12-01' && p.priorTo === '2026-05-12', [p.priorFrom, p.priorTo]);
}
{
  const p = resolveFinancePeriod('ytd', nov12);
  check('ytd: Jan … Nov', p.months.length === 11 && p.months[0].month === '2026-01');
  check('…prior: last year to date (Jan 1 2025 – Nov 12 2025)', p.priorFrom === '2025-01-01' && p.priorTo === '2025-11-12' && iso(p.prior.end) === '2025-11-12T19:30:00.000Z', [p.priorFrom, p.priorTo]);
  check('…month before: Dec 2025', p.monthBefore.month === '2025-12');
  const jan = resolveFinancePeriod('ytd', new Date('2027-01-01T06:00:00Z'));
  check('ytd on Jan 1 (1am Eastern): one partial month; prior is Jan 1 2026 to 1am', jan.months.length === 1 && jan.months[0].partial && iso(jan.prior.end) === '2026-01-01T06:00:00.000Z', iso(jan.prior.end));
}
{
  // Mar 31: February has no 31st — the prior window clamps to the end of Feb 28.
  const p = resolveFinancePeriod('m3', new Date('2026-05-31T16:00:00Z'));
  check('May 31 (m3, prior ends Feb 28 at the same time, not Mar 3)', p.priorTo === '2026-02-28', p.priorTo);
  // DST: 11pm EST on Nov 1 (the fall-back day) is still Nov 1.
  const d = resolveFinancePeriod('m3', new Date('2026-11-02T04:00:00Z'));
  check('11pm on the DST day is still that day', d.to === '2026-11-01' && d.priorTo === '2026-08-01', [d.to, d.priorTo]);
}
check('unknown period → y12', parseFinancePeriod('week') === 'y12' && parseFinancePeriod('ytd') === 'ytd');
check('sources: round, booking fee, hold → service fees', ['round', 'booking_fee', 'hold'].every(w => revenueSource(w) === 'serviceFees'));
check('sources: no-show and late fees together', revenueSource('no_show_fee') === 'noShowLateFees' && revenueSource('late_fee') === 'noShowLateFees');
check('sources: dues and member account → membership dues', revenueSource('dues') === 'membershipDues' && revenueSource('account') === 'membershipDues');
check('sources: shop and event → other (so the parts add up to the total)', revenueSource('shop') === 'other' && revenueSource('event') === 'other');

const route = readFileSync('src/app/api/admin/finance/route.ts', 'utf8');
check('route: owner only', /if \(!requireOwner\(session\)\) return/.test(route));
check('route: every money and booking query leaves test courses out', (route.match(/c\."isTest" = false/g) ?? []).length === 4 && /course: \{ isTest: false \}/.test(route));
check('route: a past month\'s live-course count is not reconstructed', /liveCourses: m\.partial \? liveNow : null/.test(route));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
