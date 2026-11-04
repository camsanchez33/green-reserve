// Cam 2026-11-04: booking failed with "prisma.golferAccount.update() … Record to update not found".
// A golfer cookie can outlive its account (test-data reset, a removed golfer). Pins: such a session
// reads as signed out and its cookie is cleared; the card-setup route never throws on a missing
// account and never shows a golfer a raw error. Pure. Run: npx tsx scripts/golfer-stale-session-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const auth = readFileSync('src/lib/auth.ts', 'utf8');
const fn = auth.slice(auth.indexOf('export async function getGolferSession'), auth.indexOf('// ── Member invite'));
const setup = readFileSync('src/app/api/bookings/setup-intent/route.ts', 'utf8');

ok('getGolferSession looks the account up before trusting the token', fn.includes("prisma.golferAccount.findUnique({ where: { id: p.golferId }, select: { id: true } })"));
ok('a missing account is no session, and its cookie is cleared', /if \(account === null\) \{[\s\S]*cookieStore\.delete\('gr_golfer'\)[\s\S]*return null;/.test(fn));
ok('a database hiccup does not sign the golfer out (only a definite "not found" does)', fn.includes('.catch(() => undefined)') && fn.includes('account === null'));
ok('the lookup comes before the token is renewed', fn.indexOf('account === null') < fn.indexOf('Sliding renewal'));
ok('card setup never throws on a missing account', setup.includes('prisma.golferAccount.updateMany({ where: { id: golferSession.golferId }') && !setup.includes('prisma.golferAccount.update({'));
ok('card setup never shows a raw error message', !/error: msg/.test(setup) && !setup.includes('e.message'));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
