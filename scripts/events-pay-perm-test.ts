// Events audit 23 (Oct 28, re-checked Nov 1): saying an event was paid another way (a check, cash,
// a card elsewhere) moves money on the books, so it needs "Mark paid at the counter" — "Run events"
// alone used to be enough. Each pin fails on the code before the fix. Pure.
// Run: npx tsx scripts/events-pay-perm-test.ts
import { readFileSync } from 'fs';

let failed = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const route = readFileSync('src/app/api/operator/events/[id]/payments/route.ts', 'utf8');
const ui = readFileSync('src/components/dashboard/events/EventMoney.tsx', 'utf8');
const rec = route.slice(route.indexOf("case 'record': {"), route.indexOf('recordCoursePayment(courseId'));
const other = route.slice(route.indexOf("case 'void': case 'paid_other': {"), route.indexOf('settleOpenPayment(courseId, own.id'));

check('recording a payment checks sheet.counter_payment before it records', rec.includes("requirePermission(session, 'sheet.counter_payment')"));
check('"paid another way" checks it too (cancelling a link does not)', other.includes("if (body.action === 'paid_other') { const denied = requirePermission(session, 'sheet.counter_payment')"));
check('the buttons hide for a login without it', ui.includes("const canRecord = useDashboardAccess().can('sheet.counter_payment');") && ui.includes('{canRecord && <button onClick={() => { setMode(mode') && ui.includes('{canRecord && <button onClick={() => setPaidOther('));

const detail = readFileSync('src/components/dashboard/events/EventDetail.tsx', 'utf8');
check('the player list and day-of view hide "Paid at the course" / "Take payment" too', detail.includes("const canRecord = useDashboardAccess().can('sheet.counter_payment');") && detail.includes('{canRecord && <button disabled={!!busy} onClick={() => setPaidHere(') && detail.includes('onTakePayment={canRecord ? p =>'));

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
