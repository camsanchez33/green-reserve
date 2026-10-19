// TT-CARD (Cam 2026-10-19, OPERATOR_REWORK_SPEC "do your idea"): the tee
// time's card. On a laptop it sits beside the sheet with no backdrop (staff
// still see who's next and can drag); on a phone it is a full sheet that
// slides up. It carries the price line, each group's money, and every action
// the old side panel had. The homepage demo mirrors it. Source-level. Pure.
// Run: npx tsx scripts/tt-card-test.ts
import { readFileSync } from 'fs';
let failed = 0;
const check = (label: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
const card = page.slice(page.indexOf('TT-CARD (Cam 2026-10-19'), page.indexOf('ACT-1: move a group to another time'));

check('on a laptop the card has no backdrop over the sheet', /md:inset-auto md:top-28 md:right-4/.test(card) && /bg-ink\/20 md:hidden/.test(card));
check('on a phone it is a full sheet from the bottom', /absolute inset-x-0 bottom-0 top-12 md:static/.test(card));
check('the slide respects reduced motion', /prefers-reduced-motion: no-preference[\s\S]*tt-card-up/.test(readFileSync('src/app/globals.css', 'utf8')));
check('the price line is in the card', card.includes('a player{panelSlot.cartFee > 0'));
check('each group shows what it owes, to logins that see payments', page.includes("access.can('money.payments') && <span className=\"shrink-0 text-[14px] font-semibold text-ink tabular-nums\">${(due / 100).toFixed(2)}"));
for (const a of ["checkInBooking(b)", "bookingLifecycle(b, 'paid_offline')", "sendPayLink(b, 'sms')", "sendPayLink(b)", 'setMoveTarget(', "bookingLifecycle(b, 'still_coming')", "bookingLifecycle(b, 'no_show')", 'cancelGroup(b, false)', 'cancelGroup(b, true)', 'setResidents(b,', '<ShopItemsForGroup', 'setWalkInSlot(panelSlot)', 'toggleBlock(panelSlot)', 'deleteTime(panelSlot)']) {
  check(`the card keeps ${a}`, page.includes(a));
}
check('cancel sits last, apart from the other actions', /ml-auto flex items-center gap-x-4[\s\S]{0,700}Cancel booking/.test(page));
check('no box inside the card: groups are rows with hairlines', card.includes('divide-y divide-line-soft') && !page.includes('bg-paper/60 rounded-md px-3 py-2'));
const demo = readFileSync('src/components/home/TeeSheetDemo.tsx', 'utf8');
check('the homepage demo mirrors: price line, money per group, walk-in wording', demo.includes('a player</span>') && demo.includes('money(roundTotal(d, g.n))') && demo.includes('Add a walk-in or phone booking'));
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
