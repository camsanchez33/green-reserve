// Launch walk batch 2 (Cam 2026-10-31): sheet prices that aren't built are listed, the cash
// drawer adds up, and emails to courses in the pipeline never fail out of sight.
// No database needed. Run: npx tsx scripts/launch-batch2-test.ts
import { readFileSync } from 'fs';
import { sheetPricesNotBuilt } from '../src/lib/setup-sheet-recap';
import { emailFailedNotice } from '../src/lib/email-failed-notice';

let failed = 0;
const check = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

// 1. Setup sheet prices the build doesn't make a schedule for.
const sheet = { holes: '18', twilightFee: '30', nineHoleSupport: 'yes', nineHoleWhich: 'both', nineHoleFee: '25' };
const rows = sheetPricesNotBuilt(sheet, [{ holes: 18 }]);
check('twilight and 9 holes from the sheet are listed when no schedule covers them', rows.length === 2 && rows[0].label === 'Twilight' && rows[0].value.startsWith('$30') && rows[1].label === '9 holes' && rows[1].value.includes('$25') && rows[1].value.includes('either nine'), rows);
check('…a 9-hole schedule covers 9 holes, not twilight (review)', JSON.stringify(sheetPricesNotBuilt(sheet, [{ holes: 18 }, { holes: 9 }]).map(r => r.label)) === '["Twilight"]');
check('…and nothing once a second 18-hole window and a 9-hole schedule exist, or the sheet didn\'t give them', sheetPricesNotBuilt(sheet, [{ holes: 18 }, { holes: 18 }, { holes: 9 }]).length === 0 && sheetPricesNotBuilt({ holes: '18' }, [{ holes: 18 }]).length === 0 && sheetPricesNotBuilt({ holes: '9', nineHoleSupport: 'yes', nineHoleFee: '20' }, [{ holes: 9 }]).length === 0);
check('…in the build notes and on the onboarding price review', read('src/app/api/admin/inquiries/route.ts').includes('sheetPricesNotBuilt(d, [{ holes }])') && read('src/lib/page-review.ts').includes('(on your setup sheet, not on your page yet)'));

// 2. The cash drawer adds up, and a short can be traced.
const sales = read('src/components/dashboard/money/SalesPanel.tsx');
check('Money\'s drawer shows the dues and events cash its Expected includes', sales.includes('d.otherCashCents !== 0 && <Row label="Dues and events"'));
const close = read('src/lib/register-close.ts');
check('the close-out lists each cash movement from the money ledger', close.includes("prisma.moneyMove.findMany({ where: { courseId, method: 'cash', at: inDay }") && read('src/components/dashboard/RegisterClose.tsx').includes('summary.cashMoves!.map('));

// 3. Emails to courses in the pipeline never fail out of sight.
const adm = read('src/app/api/admin/inquiries/route.ts');
check('the setup sheet email is awaited and a failure returned with the link', adm.includes('await sendDetailsRequestEmail({') && adm.includes('emailSent: !emailError') && !adm.includes('after(sendDetailsRequestEmail'));
check('the go-live email is awaited and a failure returned', adm.includes('await goLiveFn({') && !adm.includes('after(goLiveFn('));
check('the admin page says so, with the sheet link to send by hand', emailFailedNotice({ emailError: 'Resend down', detailsLink: 'https://x/s' }, 'a@b.c').includes('Send them the sheet link yourself: https://x/s') && emailFailedNotice({}, 'a@b.c').includes('Email a@b.c yourself') && read('src/app/admin/inquiries/[id]/page.tsx').includes('setActionError(emailFailedNotice(d,'));
check('bulk "send sheet" doesn\'t count an unsent email as done', read('src/app/admin/inquiries/page.tsx').includes('.emailSent !== false)) { ok++; continue; }'));
check('the inquiry confirmation and the sheet copy log a failure on the inquiry\'s timeline', read('src/app/api/inquiries/route.ts').includes("noteEmailFailed(inquiry.id, 'inquiry confirmation and call invite', err)") && read('src/app/api/inquiries/details/route.ts').includes("noteEmailFailed(inquiry.id, 'copy of their setup sheet', err)"));

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log('\nALL PASS');
