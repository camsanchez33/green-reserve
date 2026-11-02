// Counter friction, part B (Cam 2026-11-02 night run; the Oct 28 audit, re-checked Nov 1):
// each pin fails on the code before the fix. Pure. Run: npx tsx scripts/counter-b-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
const sheet = read('src/app/dashboard/page.tsx'), shop = read('src/app/dashboard/shop/page.tsx'), home = read('src/app/dashboard/home/page.tsx'), search = read('src/lib/operator-search.ts');

// Tee 16
check('on a wide screen the sheet narrows beside the open card instead of being covered', sheet.includes("${panelSlot ? 'xl:pr-[536px]' : ''}") && sheet.includes('md:w-[min(520px,calc(100vw-2rem))]'));
// Home → card
check('the sheet opens ?tt=<tee time> as that time’s card once loaded', sheet.includes("const tt = searchParams.get('tt');") && sheet.includes('if (tt && teeTimes.some(t => t.id === tt)) { pendingTtRef.current = null; setPanelId(tt); }'));
check('Home: each coming-up time and a single late group open their card', home.includes('href={`/dashboard?tt=${s.id}`}') && home.includes('`/dashboard?tt=${home.late[0].teeTimeId}`'));
// Members 22
check('a member search result opens their golfer record', search.includes('`/dashboard/golfers/${encodeURIComponent(`e:${email}`)}`') && search.includes('`/dashboard/golfers/${encodeURIComponent(`a:${m.golferId}`)}`'));
// Shop 16
check('a failed tax quote never blocks cash', shop.includes("const cashNoQuote = pay === 'cash' && !itemsEmpty && !priced && !!quoteError;") && shop.includes('|| cashNoQuote;'));
check('…and nothing is rung up against a total the screen never showed (no tendered, no expected total)', shop.includes("cashTenderedCents: pay === 'cash' && tenderedCents && !cashNoQuote ? tenderedCents : undefined") && shop.includes("expectedItemsCents: (pay === 'cash' || pay === 'account') && !itemsEmpty && priced ? priced.totalCents : undefined"));

// Final review 2026-11-02: no pre-tax figure on the button when the total isn't known; the result says what to collect.
check('without a quote the cash button names no amount, and the result says what to collect', shop.includes("pay === 'cash' ? (cashNoQuote ? 'Take cash' : `Take ${usd(due)} cash`)") && shop.includes('Collect {usd(justPaid.totalCents)}.') && shop.includes('setJustNoQuote(cashNoQuote)'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
