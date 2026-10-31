// Launch walk batch 3 (Cam 2026-10-31): Front desk can take items back without the wider refund
// power, and the card-course terms no longer promise a counter fee nothing charges.
// No database needed. Run: npx tsx scripts/launch-batch3-test.ts
import { readFileSync } from 'fs';
import { PRESETS, PERMISSIONS, LEGACY_KEYS, normalizePermissions } from '../src/lib/staff-permissions';

let failed = 0;
const check = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const def = PERMISSIONS.find(p => p.key === 'shop.return');
check('"Return items" is its own key: needs selling, moves money', !!def && def.requires?.includes('shop.sell') === true && def.movesMoney === true, def);
const fd = PRESETS.find(p => p.key === 'front_desk')!;
check('Front desk has it, and still not Issue refunds', fd.keys.includes('shop.return') && !fd.keys.includes('money.refund'));
check('giving it gives selling too', normalizePermissions(['shop.return']).includes('shop.sell'));
check('Legacy staff (never set) don\'t get it', !LEGACY_KEYS.includes('shop.return'));

const route = read('src/app/api/operator/shop-sales/route.ts');
check('the route: a return by item takes Return items or Issue refunds; a typed amount needs Issue refunds', route.includes("const denied = byItem && can(g.session, 'shop.return') ? null : requirePermission(g.session, 'money.refund');") && route.includes('const byItem = Array.isArray(body.lines) && body.lines.length > 0;'));
const page = read('src/app/dashboard/shop/page.tsx');
check('the register shows the item list without the amount to a returns-only login', page.includes("const canReturn = canRefund || access.can('shop.return');") && page.includes('{canRefund && <label className="block"><span className="block text-[12.5px] font-medium text-ink mb-1">Amount</span>') && page.includes('disabled={!byItem && (!canRefund || !toCents(refund.amount))}'));

const book = read('src/app/book/BookClient.tsx');
check('the card-course terms no longer say paying at the counter charges the booking fee', !book.includes('or if you pay at the counter instead of checking in') && book.includes('When a fee above is charged, the $'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
