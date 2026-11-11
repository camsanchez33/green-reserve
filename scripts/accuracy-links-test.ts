// ACC-1 (Cam 2026-11-08: "make sure these completely link throughout the site so any booking or payment correlates
// so it is accurate"; picked "Paid on the round's day + rename the Ledger"). Pins the shared definitions:
//   paid       = what the payment says (paid · paid_offline · on_account), checked in or not — the same rule as Money →
//                Payments, so admin "Collect payment" (a round charged, not checked in) counts as paid everywhere
//   played     = checked in (status completed)
//   not paid   = owed + today's groups still to play, the same on the tee sheet, Home and Money's strip, and the
//                list Money's "See them" opens shows that same set
//   refunded   = shown beside Paid on the sheet, never silently gone
//   players of spots = ONE rule (lib/day-fill) on the sheet, Home, Home's week ahead, the Calendar and Analytics
//   the Ledger's card is "Money in" (the day the money moved), never "Paid"
// Run: npx tsx scripts/accuracy-links-test.ts
import { readFileSync } from 'fs';
import { fillOf, timeSpots, livePlayers } from '../src/lib/day-fill';
import { paymentStatus } from '../src/components/dashboard/money/PaymentsPanel';
import { EARNED_TITLE } from '../src/lib/earned-terms';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

// players of spots
ok('a time offers its open seats', timeSpots({ status: 'available', playersAvailable: 4 }, 2) === 4);
ok('a blocked time counts only the group already on it', timeSpots({ status: 'blocked', playersAvailable: 4 }, 2) === 2 && timeSpots({ status: 'blocked', playersAvailable: 4 }, 0) === 0);
ok('a time is never more than full', timeSpots({ status: 'full', playersAvailable: 2 }, 3) === 3);
ok('cancelled players are not booked', livePlayers([{ status: 'confirmed', players: 2 }, { status: 'cancelled', players: 4 }, { status: 'completed', players: 1 }]) === 3);
const day = fillOf([{ status: 'available', playersAvailable: 4, players: 2 }, { status: 'blocked', playersAvailable: 4, players: 3 }, { status: 'blocked', playersAvailable: 4, players: 0 }]);
ok('a day: 5 players of 7 spots, 71%', day.players === 5 && day.spots === 7 && day.pct === 71);
const sheet = read('src/app/dashboard/page.tsx'), home = read('src/lib/operator-home.ts'), board = read('src/lib/home-board.ts'), cal = read('src/app/api/operator/tee-times/route.ts'), an = read('src/lib/analytics.ts');
ok('the sheet, Home, the week ahead, the Calendar and Analytics all use it', sheet.includes('timeSpots(t, livePlayersOf(t.bookings))') && home.includes('offered += timeSpots(t, n);') && board.includes('c.offered += timeSpots(t, n);') && cal.includes('d.spots += timeSpots(t, n);') && an.includes('const spots = timeSpots(t, booked);'));

// paid / played / not paid
ok('paid is the payment status, checked in or not', an.includes("const collectedB = live.filter(b => b.paymentStatus === 'paid' || b.paymentStatus === 'paid_offline' || b.paymentStatus === 'on_account');"));
ok('rounds played need a check-in', an.includes("const roundsPlayed = collectedB.filter(b => b.status === 'completed')") && an.includes("if (b.status === 'completed') r.rounds +="));
ok('Money\'s Not paid yet is the sheet\'s and Home\'s: lib/analytics notPaid (STRESS-1110 #15)', read('src/app/api/operator/money/overview/route.ts').includes('notPaidCents: a.revenue.notPaidCents,') && read('src/app/api/operator/sheet-money/route.ts').includes('outstandingCents: a.revenue.notPaidCents,') && read('src/lib/operator-home.ts').includes('outstandingCents: day.revenue.notPaidCents,') && read('src/app/api/operator/money/sales/route.ts').includes('outstandingCents: r.notPaidCents'));
const base = { id: 'b', golferName: 'A', golferEmail: '', golferPhone: '', players: 2, appliedRate: 'standard', greenFeeTotal: 10000, cartFeeTotal: 0, cartSelected: false, rangeBallsTotal: 0, accessFeeTotal: 300, totalAmount: 10300, cancellationFeeTotal: 0, cancellationFeeChargedAt: null, cancelledAt: null, checkedInAt: null, noShowAt: null, paymentStatus: 'card_on_file', status: 'confirmed', createdAt: '2026-11-01T00:00:00Z', teeTime: { date: '2026-11-08', time: '15:00', holes: 18 } } as never as Parameters<typeof paymentStatus>[0];
ok('"See them" lists a group later today that hasn\'t paid', paymentStatus(base, '2026-11-08', '12:00').group === 'unpaid');
ok('…but a future day stays on the tee sheet', paymentStatus({ ...base, teeTime: { date: '2026-11-09', time: '08:00', holes: 18 } }, '2026-11-08', '12:00').group === 'upcoming');
ok('a round charged but not checked in reads Paid on Payments too', paymentStatus({ ...base, paymentStatus: 'paid' }, '2026-11-08', '12:00').group === 'paid');
ok('a refunded group shows beside Paid on the sheet', an.includes('refundedBookings: live.filter(refunded).length,') && sheet.includes("{dayMoney.refundedGroups ? ` · ${dayMoney.refundedGroups} refunded` : ''}"));

// the Ledger is money moved
ok('the Ledger\'s card says Money in', EARNED_TITLE === 'Money in');

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
