// ANALYTICS-5 (Cam 2026-11-17, "analytics is good to go"; lanes/dashboard.md "Next" 5): the Analytics page built to
// the approved mockup. Pins: every money figure is the ledger's (the Revenue page's own /money/sales `all`), read only
// by logins that see money; no computeAnalytics money sum on the page; every part that needs Build's new data stays
// hidden until the route sends it (never a made-up number); no Filter button until the route can filter; the snapshot
// dates. Pure + source guards. Run: npx tsx scripts/analytics-page-test.ts
import { readFileSync, readdirSync } from 'fs';
import { change, lastMonth, pastMonths, periodText } from '../src/components/dashboard/analytics/data';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (f: string) => readFileSync(f, 'utf8');
const page = read('src/app/dashboard/analytics/page.tsx');
const dir = 'src/components/dashboard/analytics';
const parts = Object.fromEntries(readdirSync(dir).map(f => [f, read(`${dir}/${f}`)]));
const all = page + Object.values(parts).join('\n');
// What renders: the .tsx files without their comments (data.ts holds the route's types, which name every field).
const code = [page, ...Object.entries(parts).filter(([f]) => f.endsWith('.tsx')).map(([, s]) => s)].join('\n').split('\n').filter(l => !/^\s*(\/\/|\{\/\*)/.test(l)).join('\n');

// The dates: the last 30 whole days, ending yesterday; the last three calendar months.
ok('the snapshot is the 30 days ending yesterday', JSON.stringify(lastMonth('2026-11-17')) === '{"from":"2026-10-18","to":"2026-11-16"}', lastMonth('2026-11-17'));
ok('…across a month and year end', JSON.stringify(lastMonth('2027-01-01')) === '{"from":"2026-12-02","to":"2026-12-31"}', lastMonth('2027-01-01'));
const pm = pastMonths('2026-01-10');
ok('the last three months, newest first, across a year end', pm.map(m => m.label).join('|') === 'December 2025|November 2025|October 2025' && pm[0].range.from === '2025-12-01' && pm[0].range.to === '2025-12-31' && pm[1].range.to === '2025-11-30', pm);
ok('the period beside the title', periodText({ from: '2026-10-18', to: '2026-11-16' }) === 'Oct 18 – Nov 16');

// The change against the 30 days before.
ok('a % change, signed', change(112, 100, 'pct')?.text === '+12%' && change(88, 100, 'pct')?.text === '−12%' && change(88, 100, 'pct')?.up === false);
ok('points for a share', change(64, 60, 'pts')?.text === '+4 pts' && change(59, 60, 'pts')?.text === '−1 pt');
ok('no change from nothing (never "+Infinity%")', change(5, 0, 'pct') === null && change(5, null, 'pct') === null && change(null, 5, 'pts') === null);

// Money: the ledger's only, and only for logins that see money.
ok('the ledger is Build’s block on the analytics reply; money/sales only stands in until it carries `paid`', page.includes('const built = !!data?.ledger?.paid;') && page.includes('if (access.loaded && seesMoney && data && !built) loadLedger(data.range); else setLedger(null);') && page.includes('`/api/operator/money/sales?from=${r.from}&to=${r.to}`'));
ok('no ledger at all without money.payments', page.includes("const seesMoney = access.can('money.payments');") && page.includes('const ledger: Ledger | null = !seesMoney ? null : data?.ledger ?'));
ok('the Revenue tile exists only with the ledger', parts['Head.tsx'].includes("if (ledger) {") && parts['Head.tsx'].includes("tiles.push({ key: 'rev', label: 'Revenue', value: usd(ledger.grossCents)"));
ok('no computeAnalytics money sum anywhere on the page', !/collectedCents|expectedCents|impactCents|spendCents|cancellations\.lostCents|outstandingCents|greenCents|perRoundCents/.test(code));
ok('…the one value that is not money moved (unsold spots at posted prices) is on the Tee sheet tab only, for money logins', (code.match(/unfilled\.lostCents/g) || []).length === 1 && parts['Tabs.tsx'].includes("money && { label: 'Value of unsold spots'"));
ok('shop revenue is the report’s ledger figure, money logins only', parts['ShopTab.tsx'].includes('const shopCents = money && r.ledgerSalesCents != null ? r.ledgerSalesCents : null;'));
ok('Where they paid and Card or cash only with the ledger’s paid split', parts['Tabs.tsx'].includes('{P && <Block title="Where they paid">') && parts['Tabs.tsx'].includes('{P && <Block title="Card or cash">'));
ok('lost is red with a minus, recovered green with a plus; no-show money is "value lost", never revenue', parts['data.ts'].includes('export const lost = (c: number) => `−$') && parts['data.ts'].includes('export const gained = (c: number) => `+$') && parts['parts.tsx'].includes("lost: 'text-bad', gained: 'text-ok'") && parts['Tabs.tsx'].includes("label: 'Value lost to no-shows'"));

// Build's routes: hidden until they answer (a 404 is "not there yet"; any other failure shows Retry).
const T = parts['Tabs.tsx'];
ok('an optional route: 404 hides, other failures say so', parts['parts.tsx'].includes('else if (res.status === 404 || (res.ok && !res.data)) setState({ data: null, missing: true') && parts['parts.tsx'].includes("else setState({ data: null, missing: false, error: res.ok ? '' : res.error"));
ok('projections from their route; else the next 7 days against usual', T.includes('useOptional<Projections>(`/api/operator/analytics/projections?from=${range.from}&to=${range.to}`)') && T.includes('<Block title="Projections · next 30 days">') && T.includes('<Block title="Next 7 days">'));
ok('projected revenue reads "about", money logins only', T.includes('const showRev = money && p.next.revenueCents != null;') && T.includes('value: `about ${usd(p.next.revenueCents!)}`'));
ok('no-shows from their route; every dollar there for money logins only', T.includes('useOptional<NoShowReport>(`/api/operator/analytics/no-shows?from=${range.from}&to=${range.to}`)') && T.includes("money && t && { label: 'Value lost to no-shows'") && T.includes("...(money ? ['Value lost', 'Recovered', 'Net'] : [])") && T.includes('{money && r.lateCancels.spots > 0 && ('));
ok('every way of booking in plain words', ['online_card_fee', 'online_card_no_fee', 'online_no_card', 'counter_card', 'counter_no_card'].every(k => T.includes(`${k}: '`)));
ok('twilight and standard spots sold only when sent', T.includes("b.spotsSold && { label: 'Twilight spots sold'"));
ok('members by membership only when sent', T.includes('{M && M.length > 0 && ('));
ok('reports: no Forecast, recommendations as "What to try", By area only when stored, PDF only once its route answers', !code.includes('Forecast') && T.includes('<List title="What to try" items={r.review.recommendations} />') && T.includes('{A && A.length > 0 && (') && T.includes("method: 'HEAD'") && T.includes('{pdf && <a href={pdfUrl(r.month)}'));
ok('stock and transactions only when sent', parts['ShopTab.tsx'].includes('{S && (') && parts['ShopTab.tsx'].includes('t.transactions != null && {'));
ok('no Filter button until the route can filter', !/label="Filter"|Icon\.filter/.test(all));
ok('removed by Cam: first-timers who came back, missed more than once', !/came back|Missed more than once|noShows\.repeat/.test(code));

// Look: both themes come from tokens.
ok('no typed hex colours (Charcoal and Light both follow the tokens)', !/#[0-9A-Fa-f]{6}\b/.test(all));
ok('header icons are bare, the tabs slide', page.includes('<IconButton label="Export this tab as a CSV"') && page.includes('<SlidingTabs value={tab}'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
