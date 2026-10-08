// SHEET-2 (Cam 2026-10-08: "green if its paid yellow if its booked"): the board
// square's money colour. Pins groupTone() against every booking state the tee
// sheet can show. Pure — no database.
// Run: npx tsx scripts/board-tone-test.ts
import { groupTone, type BoardGroup } from '../src/components/dashboard/TeeSheetBoard';

let failed = 0;
const check = (label: string, ok: boolean, detail?: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failed++; };
const g = (o: Partial<BoardGroup>): BoardGroup => ({ id: 'b', golferName: 'G', golferEmail: 'g@example.com', players: 2, status: 'confirmed', paymentStatus: 'card_on_file', ...o });
const is = (label: string, grp: BoardGroup, want: string) => { const got = groupTone(grp); check(`${label} → ${want}`, got === want, got); };

is('checked in and charged', g({ status: 'completed', paymentStatus: 'paid' }), 'ok');
is('checked in, paid at the counter', g({ status: 'completed', paymentStatus: 'paid_offline' }), 'ok');
is('paid ahead through the pay link, not yet arrived', g({ paymentStatus: 'paid' }), 'ok');
for (const ps of ['card_on_file', 'no_payment_method', 'manual', 'awaiting_checkin', 'cancellation_fee_charged']) is(`booked, ${ps}`, g({ paymentStatus: ps }), 'warn');
is('marked no-show', g({ noShowAt: '2026-10-08T15:00:00Z' }), 'bad');
is('card declined at check-in', g({ checkInFailReason: 'Your card was declined.' }), 'bad');
is('checked in after a no-show mark', g({ status: 'completed', paymentStatus: 'paid', noShowAt: '2026-10-08T15:00:00Z' }), 'ok');
is('checked in after a decline', g({ status: 'completed', paymentStatus: 'paid', checkInFailReason: 'old' }), 'ok');

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
