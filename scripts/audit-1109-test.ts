// The security and no-silent-failures audits of the 2026-11-09 night's work (#346–#349): what they found is pinned here.
// Run: npx tsx scripts/audit-1109-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');
const GATE = "const closed = await requireRegisterOpen(g.session.courseId); if (closed) return NextResponse.json({ error: closed, registerClosed: true }, { status: 409 });";

// Security (DRAWER-1): nothing goes through a closed register.
const sales = read('src/app/api/operator/shop-sales/route.ts');
const readerAt = sales.indexOf("if (body.action === 'reader_start') {");
ok('a walk-up sale on the card reader is refused while the register is closed', readerAt > 0 && sales.indexOf(GATE, readerAt) > readerAt && sales.indexOf(GATE, readerAt) < sales.indexOf('startReaderPayment(', readerAt));
const refundAt = sales.indexOf("if (body.action === 'refund') {");
ok('a cash refund is refused while the register is closed (card and account refunds are not)', refundAt > 0 && sales.indexOf("status: 'paid_cash' }", refundAt) > refundAt && sales.indexOf(GATE, refundAt) < sales.indexOf('refundSale(', refundAt));

// No silent failures.
const df = read('src/lib/dashboard-fetch.ts');
ok('a register-closed refusal is announced to the page', df.includes("res.status === 409 && body?.registerClosed === true") && df.includes('new CustomEvent(REGISTER_CLOSED_EVENT'));
ok('the tee sheet keeps a notice with the way to open the register', read('src/app/dashboard/page.tsx').includes('<RegisterClosedNotice />') && read('src/components/dashboard/RegisterClosedNotice.tsx').includes('href="/dashboard/shop"'));
ok('the Pro shop reads the register again on a refusal', read('src/app/dashboard/shop/page.tsx').includes('<RegisterClosedNotice onRefused={regRefused} /><OpenRegister key={regKey}'));
ok('Home says when it could not check the register', !read('src/components/dashboard/OpenRegister.tsx').includes("if (loadError) return where === 'home' ? null"));
const dl = read('src/components/dashboard/DeclinedCardList.tsx');
ok('Remove says Removing…, then that they still owe; a card with no email says so on the row', dl.includes("'Removing…'") && dl.includes('Still owed under Payments') && dl.includes('No email on file'));
ok('a receipt send result shows where the user is', read('src/app/dashboard/shop/page.tsx').includes("toast(`Receipt ${receipt.via === 'sms' ? 'texted' : 'emailed'}.`, 'ok')"));
ok('Support does not say "No chats yet" when it could not check', read('src/app/dashboard/support/page.tsx').includes("{listError && <LoadError message={`Couldn't load your chats — ${listError}`}") && read('src/app/dashboard/support/page.tsx').includes('{chats && chats.length === 0 &&'));
ok('the last starter-sheet column cannot be unticked (it used to do nothing)', read('src/app/dashboard/settings/page.tsx').includes("'At least one column'"));
const cx = read('src/components/dashboard/CheckoutExtras.tsx');
ok('cart numbers say Saving… / Saved, and Next follows what is typed', cx.includes("numsBusy ? 'Saving…' : 'Saved'") && cx.includes("!nums.trim();") && cx.includes('Cart numbers not saved'));
const es = read('src/components/dashboard/events/EventSetup.tsx');
ok('an event hold that could not be worked out says why, with Try again', es.includes('setPreviewError(r.error)') && es.includes('Couldn&apos;t work out the hold'));

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('audit-1109: all passed');
