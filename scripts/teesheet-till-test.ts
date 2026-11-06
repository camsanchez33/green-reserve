// DASH-D till (Cam 2026-11-01, "more POS like"): the tee time card's ticket and pay buttons.
//  1. the ticket's lines add up to what the card is charged — the same total the check-in confirm quotes
//     (partRound for part of a group, the booking's own total for all of it), discounts shown as a line;
//  2. the card's buttons keep every condition they had (only the layout changed);
//  3. after a check-in the card says who and how, and offers the next group.
// Pure. Run: npx tsx scripts/teesheet-till-test.ts
import { readFileSync } from 'fs';
import { ticketLines } from '../src/components/dashboard/GroupTicket';
import { partyFees } from '../src/lib/member-rates';

let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const sum = (t: ReturnType<typeof ticketLines>) => t.lines.reduce((s, l) => s + l.cents, 0);

// The sheet's own partRound (dashboard/page.tsx), copied so the two can't drift silently.
const partRound = (b: Parameters<typeof ticketLines>[0], n: number) => {
  if (b.greenFeeTotal == null) return Math.round(b.totalAmount * n / b.players);
  const f = partyFees({ players: b.players, greenFeeTotal: b.greenFeeTotal, cartFeeTotal: b.cartFeeTotal ?? 0, residentPlayers: b.residentPlayers ?? 0, residentRateCents: b.residentRateCents ?? null, memberRateCents: b.memberRateCents ?? null, memberCartCents: b.memberCartCents ?? null }, n, { greenFeeCents: 0, cartFeeCents: 0 });
  return f.greenFeeTotal + f.cartFeeTotal + (b.rangeBallsTotal ?? 0) + Math.round((b.accessFeeTotal ?? 0) * n / b.players);
};

const four = { players: 4, totalAmount: 4 * 4500 + 2 * 2000 + 600, accessFeeTotal: 600, greenFeeTotal: 18000, cartFeeTotal: 4000, rangeBallsTotal: 0 };
const all = ticketLines(four, 4);
ok('whole group: lines = green, cart, booking fee', all.lines.map(l => l.label).join(',') === 'Green fee,Cart,Booking fee', all.lines);
ok('whole group: total is the booking total and the lines add up to it', all.roundCents === four.totalAmount && sum(all) === four.totalAmount);
const three = ticketLines(four, 3);
ok('3 of 4: total is partRound (what the check-in charges)', three.roundCents === partRound(four, 3) && sum(three) === three.roundCents, three);

const promo = { ...four, totalAmount: four.totalAmount - 1000 };
const p = ticketLines(promo, 4);
ok('a promo code the pieces don\'t carry shows as a Discount line; lines still add up', p.lines.some(l => l.label === 'Discount' && l.cents === -1000) && sum(p) === promo.totalAmount);

const res = { players: 3, totalAmount: 4500 + 3200 * 2 + 450, accessFeeTotal: 450, greenFeeTotal: 4500 + 6400, cartFeeTotal: 0, residentPlayers: 2, residentRateCents: 3200 };
const r2 = ticketLines(res, 2);
ok('residents: part of the group priced as the server does', r2.roundCents === partRound(res, 2) && sum(r2) === r2.roundCents, r2);
const mem = { players: 2, totalAmount: 2000 + 4500 + 300, accessFeeTotal: 300, greenFeeTotal: 6500, cartFeeTotal: 0, memberRateCents: 2000 };
const m1 = ticketLines(mem, 1);
ok('member: one of two here is the member\'s own rate', m1.roundCents === partRound(mem, 1) && m1.lines[0].cents === 2000, m1);
const legacy = { players: 3, totalAmount: 9301, accessFeeTotal: 451 }; // odd cents: rounding must not split the lines from the charge
const l1 = ticketLines(legacy, 1);
ok('a booking without its parts: one Round line, prorated like the sheet', l1.lines[0].label === 'Round' && l1.roundCents === partRound(legacy, 1) && sum(l1) === l1.roundCents, l1);

const page = readFileSync('src/app/dashboard/page.tsx', 'utf8');
ok('card total = the confirm\'s amount (partRound for part, total for all, plus shop)', page.includes('const cardDue = (restSplit ? restSplit.keep.totalAmount : herePlayers < b.players ? partRound(b, herePlayers, true) : b.totalAmount) + shopExtra(b);') && page.includes('const amount = cardCents ?? (partial ? partRound(b, partial, true) : b.totalAmount) + shopExtra(b);') && page.includes('checkInBooking(b, cardDue)'));
ok('cash = the take-cash confirm\'s amount (no booking fee)', page.includes("const cashDue = (restSplit ? restSplit.keep.totalAmount - restSplit.keep.accessFeeTotal : herePlayers < b.players ? partRound(b, herePlayers, false) : b.totalAmount - (b.accessFeeTotal ?? 0)) + (b.shopTotalCents ?? 0) + (b.shopTaxCents ?? 0);")
  && page.includes("bookingLifecycle(b, 'take_cash', cashDue, ") && page.includes("const owed = cashCents ?? (who < b.players ? partRound(b, who, false) : b.totalAmount - (b.accessFeeTotal ?? 0)) + (b.shopTotalCents ?? 0) + (b.shopTaxCents ?? 0);"));
ok('the "Here now" pick is the headcount the charge uses', page.includes('setHere(h => ({ ...h, [b.id]: Math.max(1, herePlayers - 1) }))') && page.includes('const n = here[b.id] ?? b.players;'));
ok('pay buttons keep their permissions', page.includes("const cardOk = b.status !== 'completed' && b.status !== 'cancelled' && access.can('sheet.checkin');") && page.includes("const canCash = b.status === 'confirmed' && b.paymentStatus !== 'manual' && b.paymentStatus !== 'paid' && b.paymentStatus !== 'paid_offline' && access.can('sheet.counter_payment');")
  && page.includes("access.can('sheet.checkin') && access.can('shop.sell');") && page.includes('hasAccounts && access.can(\'sheet.counter_payment\')'));
ok('amounts on buttons only for logins that see money', page.includes("`Charge${showMoney ? ` $${(cardDue / 100).toFixed(2)}` : ''}`") && page.includes("{showMoney ? `$${(cardDue / 100).toFixed(2)}` : 'Charge'}") && page.includes("const showTicket = showMoney && unpaid && !b.noShowAt;"));
ok('after a check-in: who, how, and the next group', page.includes('{justDone.name} · {justDone.players} checked in') && page.includes('Next: {nextGroup.golferName}') && (page.match(/setJustDone\(\{ bookingId: b\.id/g) || []).length === 3);

console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
