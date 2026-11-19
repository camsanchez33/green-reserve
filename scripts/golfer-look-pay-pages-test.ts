// BOOKING-LOOK-1, second set: the event pay link, the shop pay link, the shop receipt, the statement and the event
// sign-up wear the course look (visual only), with the course photo and logo on their headers (PERS-1).
// Run: npx tsx scripts/golfer-look-pay-pages-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};
const read = (f: string) => readFileSync(f, 'utf8');
const code = (f: string) => read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const PAGES = {
  eventPay: 'src/app/pay/event/[id]/page.tsx',
  shopPay: 'src/app/pay/shop/[id]/page.tsx',
  shopReceipt: 'src/app/receipt/shop/[id]/page.tsx',
  statement: 'src/app/statement/[id]/page.tsx',
  signup: 'src/app/events/[id]/page.tsx',
};
const form = 'src/app/events/[id]/SignupForm.tsx';

for (const [name, f] of Object.entries(PAGES)) {
  const c = code(f);
  check(`${name}: the root wears lookSiteVars (no look = today's light page)`, /style=\{(lookSiteVars\(lc\)|vars)\}/.test(c) && c.includes('lookSiteVars('));
  check(`${name}: the header band is the look's (lookBandHex), never brandColor directly`, c.includes('accent={lookBandHex(lc)}') && !/accent=\{[a-z.]*brandColor\}/i.test(c));
  check(`${name}: the course logo and photo on the header (PERS-1)`, /<CourseHeaderBar[^>]*logoUrl=\{[^}]+\}[^>]*photoUrl=\{[^}]+\}/.test(c));
  check(`${name}: cards read the look's card colour, never white`, !/<Card[\s>]/.test(c) && !/(^|[\s"'`])bg-white\b/.test(c) && c.includes("'bg-card rounded-lg shadow-card'"));
  check(`${name}: sets the Dark page background`, /useLookBackground\(|<LookBackground /.test(c));
}
for (const f of [PAGES.eventPay, PAGES.shopPay, PAGES.statement]) {
  const c = code(f);
  check(`${f}: Pay is on the accent, its text the look's on-accent colour`, c.includes("style={{ backgroundColor: 'var(--g-acc)', color: 'var(--g-on-acc)' }}") && !c.includes("backgroundColor: pay.brandColor") && !c.includes("backgroundColor: sale.brandColor") && !c.includes("backgroundColor: info.brandColor"));
  check(`${f}: the Stripe card field takes the look's text colours`, c.includes('<CardElement options={cardStyleFor(look)} />') && c.includes('const t = lookText(look);'));
  check(`${f}: the footer wears the look (LookFooter)`, c.includes('<LookFooter vars={lookVars} />'));
}
for (const f of [PAGES.eventPay, PAGES.shopPay]) {
  check(`${f}: the wallet button flips to light on Dark`, code(f).includes("theme: look === 'dark' ? 'light' : 'dark'"));
}
check('shop receipt: prints black on white (the band\'s colour and the logo dropped), footer hidden', read(PAGES.shopReceipt).includes('@media print') && read(PAGES.shopReceipt).includes('.shop-receipt * { color: #000 !important; background: transparent !important;') && read(PAGES.shopReceipt).includes('.shop-receipt img { display: none !important; }') && read(PAGES.shopReceipt).includes('print:bg-white'));
check('shop receipt: the footer wears the look only when the course picked one', code(PAGES.shopReceipt).includes('<LookFooter vars={lc && lookPicked(lc) ? vars : undefined} />'));

// The sign-up form
const fc = code(form);
check('sign-up form: cards on the look\'s card colour, Add a player not white', !/<Card[\s>]/.test(fc) && !/(^|[\s"'`])bg-white\b/.test(fc) && fc.includes('bg-card border border-line'));
check('sign-up form: the accent comes from the look (no brandColor prop)', !/\baccent\b(?!Color)/.test(fc.replace(/accentColor/g, '')) && fc.includes("style={{ accentColor: 'var(--g-acc)' }}") && fc.includes("style={{ backgroundColor: 'var(--g-acc)', color: 'var(--g-on-acc)' }}"));

check('the terms and save-card boxes keep the browser\'s own tick (no accent added: no-look parity)', !/type="checkbox"[^>]*accentColor/.test(read(PAGES.shopPay)) && !/type="checkbox"[^>]*accentColor/.test(read(PAGES.statement)));

// Visual only: every request and its body is as it was.
const sameCalls: Array<[string, string[]]> = [
  [PAGES.eventPay, ['fetch(`/api/event-payment/${paymentId}`', 'body: JSON.stringify({ token, paymentMethodId, expectedTotalCents: totalRef.current })', 'fetch(`/api/event-payment/${id}?token=${encodeURIComponent(token)}`)']],
  [PAGES.shopPay, ['fetch(`/api/shop-sale/${id}?token=${encodeURIComponent(token)}`)']],
  [PAGES.statement, ["body: JSON.stringify({ token, paymentMethodId: paymentMethod.id, expectedTotalCents: info.totalCents, saveCard, agree: saveCard })", "body: JSON.stringify({ token, action: 'stop_card' })"]],
  [form, ['body: JSON.stringify({ players, smsConsent: smsOk && players[0].phone.replace(/\\D/g, \'\').length >= 10 })']],
  [PAGES.shopReceipt, ["publicShopReceipt(id, typeof token === 'string' ? token : '')"]],
];
for (const [f, calls] of sameCalls) check(`${f}: requests unchanged`, calls.every(x => read(f).includes(x)), calls.filter(x => !read(f).includes(x)));

// The site footer steps aside only where the page carries its own
const footer = read('src/components/Footer.tsx');
const fnSrc = footer.slice(footer.indexOf('function wearsCourseLook'), footer.indexOf('/** The booking-mode footer lockup')).replace('(pathname: string): boolean', '(pathname)');
const wears = new Function(`${fnSrc}; return wearsCourseLook;`)() as (p: string) => boolean;
check('the site footer skips the look pages', ['/pay/event/abc', '/pay/shop/abc', '/receipt/shop/abc', '/statement/abc', '/manage/abc', '/checkin/abc', '/receipt/abc'].every(wears));
check('…and nowhere else (the event sign-up keeps the site\'s footer for now)', !['/receipt/shop', '/pay/event', '/statement', '/events/abc', '/pay/event/a/b', '/', '/book'].some(wears));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
