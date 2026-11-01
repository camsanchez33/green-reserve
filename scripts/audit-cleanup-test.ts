// Money audit, last cleanups (Cam 2026-11-01): Return items retries only returns by item; the ledger
// takes the fee Stripe took on statements and renewals; admin actions say what happened.
// No database needed. Run: npx tsx scripts/audit-cleanup-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

const route = read('src/app/api/operator/shop-sales/route.ts');
const retry = route.slice(route.indexOf("if (body.action === 'refund_retry')"), route.indexOf("if (body.action === 'refund_retry')") + 900);
check('a retry is checked against the refund it names: Return items only for a return by item', retry.includes('select: { id: true, returnedLines: true }') && retry.includes("const denied = owned.returnedLines != null && can(g.session, 'shop.return') ? null : requirePermission(g.session, 'money.refund');") && retry.indexOf('const owned') < retry.indexOf('const denied'));

check('a renewal\'s ledger row takes the fee Stripe took', read('src/lib/membership-autorenew.ts').includes('platformFeeCents: pi.application_fee_amount ?? r.feeCents'));
check('a statement\'s ledger rows take the fee Stripe took', (read('src/lib/member-statements.ts').match(/platformFeeCents: pi\.application_fee_amount \?\? st\.feeCents/g) ?? []).length === 2);
check('the ledger guard counts the charger passed in', read('scripts/money-ledger-test.ts').includes("for (const f of ['src/lib/member-statements.ts', 'src/lib/membership-autorenew.ts'])"));

const acct = read('src/components/dashboard/MemberAccount.tsx');
check('the account panel says what worked: emailed, marked paid, credited, moved', acct.includes("'Statement emailed.'") && acct.includes('Marked paid by ${method}.') && acct.includes('Credited ${usd(cents)}.') && acct.includes('onDone={m => { setNote(m);'));
check('…and a panel that failed to load offers Try again', acct.includes('{!view && <> <button onClick={() => load()}'));
check('the register says when it couldn\'t check member accounts', read('src/app/dashboard/shop/page.tsx').includes('if (!r.ok) setError(r.error);'));
const promo = read('src/components/dashboard/PromoCodes.tsx');
check('promo Turn on / off shows Saving… and can\'t be pressed twice', promo.includes('if (toggling) return;') && promo.includes("toggling === c.id ? 'Saving…'"));
check('the golfer record\'s numbers are a card, not a ruled box', read('src/app/dashboard/golfers/[key]/page.tsx').includes('<Card className="flex flex-wrap overflow-hidden w-fit max-w-full divide-x divide-line-soft">'));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
