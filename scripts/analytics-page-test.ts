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
ok('the ledger is read from the Revenue page’s own route, money.payments only', page.includes("const seesMoney = access.can('money.payments');") && page.includes('if (access.loaded && seesMoney) loadLedger(range); else setLedger(null);') && page.includes('`/api/operator/money/sales?from=${r.from}&to=${r.to}`') && page.includes('setLedger(res.data.all ?? null)'));
ok('the Revenue tile exists only with the ledger', parts['Head.tsx'].includes("if (ledger) {") && parts['Head.tsx'].includes("tiles.push({ key: 'rev', label: 'Revenue', value: usd(ledger.grossCents)"));
ok('no computeAnalytics money sum anywhere on the page', !/collectedCents|expectedCents|impactCents|spendCents|cancellations\.lostCents|outstandingCents|greenCents|perRoundCents/.test(code));
ok('…the one value that is not money moved (unsold spots at posted prices) is on the Tee sheet tab only, for money logins', (code.match(/unfilled\.lostCents/g) || []).length === 1 && parts['Tabs.tsx'].includes("money && { label: 'Value of unsold spots'"));
ok('Build’s no-show and projected money only for money logins, whatever the route sends', parts['Tabs.tsx'].includes('m = money ? n.money : undefined') && parts['Tabs.tsx'].includes('late = money ? c.late : undefined') && parts['Tabs.tsx'].includes('const ch = money ? n.byChannel : undefined;') && parts['Tabs.tsx'].includes('const showRev = money && P.revenueCents != null;') && page.includes('<TeeSheetTab d={d} money={seesMoney} />') && page.includes('<NoShowsTab d={d} money={seesMoney} />'));
ok('a new range never shows the last range’s money', page.includes('setLedger(null); setLedgerError(\'\');'));
ok('shop revenue is the ledger’s Shop and Food & beverage', parts['ShopTab.tsx'].includes('const shopCents = ledger ? ledger.segments.shopCents + ledger.segments.fnbCents : null;'));
ok('Where they paid and Card or cash only with the ledger', parts['Tabs.tsx'].includes('{P && <Block title="Where they paid">') && parts['Tabs.tsx'].includes('{P && <Block title="Card or cash">'));
ok('lost is red with a minus, recovered green with a plus', parts['data.ts'].includes('export const lost = (c: number) => `−$') && parts['data.ts'].includes('export const gained = (c: number) => `+$') && parts['parts.tsx'].includes("lost: 'text-bad', gained: 'text-ok'"));

// Build's data: hidden until sent, never filled in.
const T = parts['Tabs.tsx'];
ok('projections only when sent; else the next 7 days against usual', T.includes('const P = d.projection;\n  if (P) {') && T.includes('<Block title="Projections · next 30 days">') && T.includes('<Block title="Next 7 days">'));
ok('no-shows by how they booked only when sent', T.includes('{ch && ch.length > 0 && (') && T.includes('m && { label: \'Lost to no-shows\''));
ok('spots filled again and late cancels only when sent', T.includes('{(R || late) && (') && T.includes('{R && (') && T.includes('{late && ('));
ok('twilight and standard spots sold only when sent', T.includes("b.spotsSold && { label: 'Twilight spots sold'"));
ok('members by membership only when sent', T.includes('{M && M.length > 0 && ('));
ok('the written report and its PDF only when sent', T.includes('if (r.report) return (') && T.includes('{r.pdfUrl && <a href={r.pdfUrl}'));
ok('stock value and transactions only when sent', parts['ShopTab.tsx'].includes('{S && (') && parts['ShopTab.tsx'].includes('t.transactions != null && {'));
ok('no Filter button until the route can filter', !/label="Filter"|Icon\.filter/.test(all));
ok('removed by Cam: first-timers who came back, missed more than once', !/came back|Missed more than once|noShows\.repeat/.test(code));

// Look: both themes come from tokens.
ok('no typed hex colours (Charcoal and Light both follow the tokens)', !/#[0-9A-Fa-f]{6}\b/.test(all));
ok('header icons are bare, the tabs slide', page.includes('<IconButton label="Export this tab as a CSV"') && page.includes('<SlidingTabs value={tab}'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
