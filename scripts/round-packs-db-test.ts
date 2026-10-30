// PRICE-3 (Cam 2026-10-30: "Round packs" — cart and guests "course decides per pack"): a pack
// sold at the register is the customer's rounds; a counter booking uses them; rounds come back
// on a cancel before the cutoff and for players taken off before it; a pack with rounds used
// can't be voided or returned. Needs a database. Run: npx tsx scripts/round-packs-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { readPack, holdingsFor, takeRounds, packPrice, packSeats, PackError, packLeft, endPacksRefundedOutside, giveBack, buyPackOnline } from '../src/lib/round-packs';
import { performCheckIn } from '../src/lib/checkin-booking';
import { createSale, refundSale, voidCashSale, settleOpenSale } from '../src/lib/shop-sales';
import { dealSeat } from '../src/lib/last-minute';
import { createCounterBooking } from '../src/lib/counter-pay';
import { changePartySize } from '../src/lib/change-party';
import { performCancellation } from '../src/lib/cancel-booking';
import { moveBooking } from '../src/lib/move-booking';
import { setBookingResidents } from '../src/lib/booking-residents';
import { partyFees } from '../src/lib/member-rates';
import { ringUpCash } from '../src/lib/register';
import { addDaysStr, todayIn } from '../src/lib/course-time';
import { WIPED_TABLES } from '../src/lib/data-reset';

const TAG = 'roundpacksdbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };
const STAFF = { type: 'staff' as const, id: null };
const EMAIL = `${TAG}+pat@t.local`;

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.moneyMove.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.bookingEvent.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.shopSale.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.roundPack.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}
const line = (id: string) => prisma.shopSaleLine.findUniqueOrThrow({ where: { id } });
const bk = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } });

(async () => {
  await cleanup();
  ok('a pack is checked', !readPack({ name: '', rounds: 10, priceCents: 40000 }).ok && !readPack({ name: 'Ten', rounds: 0, priceCents: 40000 }).ok && readPack({ name: 'Ten', rounds: 10, priceCents: 40000, validDays: '' }).ok);
  ok('holder only: one seat; guests: every player, only while rounds cover them', (packSeats({ guests: false, left: 1 }, 4) as { seats: number }).seats === 1 && (packSeats({ guests: true, left: 4 }, 3) as { seats: number }).seats === 3 && !packSeats({ guests: true, left: 2 }, 3).ok);
  const hp = packPrice({ players: 2, seats: 1, guests: false, coversCart: true, publicGreen: 5000, cartFee: 2000, cart: true });
  ok('holder + a guest, cart covered: $50 green, $20 cart, the holder\'s spot stored at $0', hp.greenFeeTotal === 5000 && hp.cartFeeTotal === 2000 && hp.memberRateCents === 0 && hp.memberCartCents === 0, hp);

  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Packs ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC', cancellationHours: 24 } });
  const c = await mk('a'), other = await mk('b');
  const day = addDaysStr(todayIn('UTC'), 3);
  const slot = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '10:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 40, residentRateCents: 3000 } });
  const slot2 = await prisma.teeTime.create({ data: { courseId: c.id, date: day, time: '14:00', holes: 18, greenFeeCents: 6000, cartFeeCents: 2000, playersAvailable: 40 } });
  const ten = await prisma.roundPack.create({ data: { courseId: c.id, name: '10-round pass', rounds: 10, priceCents: 40000, coversCart: true } });
  const four = await prisma.roundPack.create({ data: { courseId: c.id, name: 'Foursome pack', rounds: 4, priceCents: 18000, guests: true } });

  // Selling.
  ok('a pack needs the customer\'s email', !(await createSale({ courseId: c.id, lines: [{ roundPackId: ten.id, quantity: 1 }], pay: 'cash', soldBy: 't' })).ok);
  ok('…and can\'t be discounted', !(await createSale({ courseId: c.id, lines: [{ roundPackId: ten.id, quantity: 1 }], pay: 'cash', soldBy: 't', customerEmail: EMAIL, discount: { percent: 10 } })).ok);
  ok('another course\'s pack isn\'t sold here', !(await createSale({ courseId: other.id, lines: [{ roundPackId: ten.id, quantity: 1 }], pay: 'cash', soldBy: 't', customerEmail: EMAIL })).ok);
  const sold = await createSale({ courseId: c.id, lines: [{ roundPackId: ten.id, quantity: 1 }, { roundPackId: four.id, quantity: 1 }], pay: 'cash', soldBy: 't', customerName: 'Pat', customerEmail: EMAIL });
  if (!sold.ok) throw new Error(JSON.stringify(sold));
  ok('sold for cash: $580, no tax, two pack lines', sold.value.totalCents === 58000 && sold.value.taxCents === 0, sold.value);
  const tenLine = sold.value.lines.find(l => l.name === '10-round pass')!.id, fourLine = sold.value.lines.find(l => l.name === 'Foursome pack')!.id;
  const held = await holdingsFor(c.id, EMAIL.toUpperCase());
  ok('the holder (any case of email) has 10 + 4 rounds', held.length === 2 && held.some(h => h.left === 10) && held.some(h => h.left === 4 && h.guests), held);
  ok('the cash is on the ledger', !!(await prisma.moneyMove.findFirst({ where: { saleId: sold.value.id, what: 'shop', amountCents: 58000 } })));

  // Holder only, cart covered.
  const b1 = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Pat', players: 2, cartSelected: true, rate: `pack:${tenLine}` }, STAFF);
  const r1 = b1.ok ? await bk(b1.id) : null;
  ok('holder + guest at the counter: $50 green + $20 cart, one round taken', r1?.greenFeeTotal === 5000 && r1.cartFeeTotal === 2000 && r1.appliedRate === 'pack' && r1.packRounds === 1 && r1.memberRateCents === 0 && (await line(tenLine)).packRoundsUsed === 1, { b1, r1 });
  ok('…the holder alone checking in pays nothing', !!r1 && partyFees(r1, 1, { greenFeeCents: 5000, cartFeeCents: 2000 }).greenFeeTotal === 0 && partyFees(r1, 1, { greenFeeCents: 5000, cartFeeCents: 2000 }).cartFeeTotal === 0);
  if (b1.ok) await changePartySize(b1.id, 3, { by: 'staff', courseId: c.id, actor: STAFF });
  ok('…a third player pays the public price', (await bk(r1!.id)).greenFeeTotal === 10000);
  ok('a promo code doesn\'t combine with a pack', !(await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Pat', players: 1, rate: `pack:${tenLine}`, promoCode: 'ANY' }, STAFF)).ok);
  ok('residents don\'t combine with a pack', !(await setBookingResidents(c.id, r1!.id, 1, STAFF)).ok);
  await moveBooking({ bookingId: r1!.id, newTeeTimeId: slot2.id, courseId: c.id, pricing: 'new_slot', actor: STAFF });
  const m1 = await bk(r1!.id);
  ok('moved to a $60 time: the holder still free, two guests at $60', m1.greenFeeTotal === 12000 && m1.appliedRate === 'pack' && m1.memberRateCents === 0, m1);
  await performCancellation(r1!.id, STAFF);
  ok('cancelled before the cutoff: the round comes back', (await line(tenLine)).packRoundsUsed === 0);

  // Guests too: every player on the pack.
  const g = await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Pat', players: 3, rate: `pack:${fourLine}` }, STAFF);
  const gr = g.ok ? await bk(g.id) : null;
  ok('three on a guests pack: $0, three rounds', gr?.greenFeeTotal === 0 && gr.packRounds === 3 && (await line(fourLine)).packRoundsUsed === 3, { g, gr });
  let grew = '';
  try { await changePartySize(gr!.id, 4, { by: 'staff', courseId: c.id, actor: STAFF }); } catch (e) { grew = (e as { msg?: string }).msg ?? 'threw'; }
  ok('…the group can\'t grow on the pack', /book the extra players/.test(grew), grew);
  await changePartySize(gr!.id, 2, { by: 'staff', courseId: c.id, actor: STAFF });
  ok('…one taken off before the cutoff gets the round back', (await bk(gr!.id)).packRounds === 2 && (await line(fourLine)).packRoundsUsed === 2);
  ok('…three more won\'t fit on the 2 left', !(await createCounterBooking(c.id, { teeTimeId: slot.id, golferName: 'Pat', players: 3, rate: `pack:${fourLine}` }, STAFF)).ok);

  // $0 at the counter settles as a $0 cash sale.
  const cash = await ringUpCash(c.id, { lines: [], bookingIds: [gr!.id], walkIns: [], soldBy: 't', actor: STAFF });
  ok('a group fully on the pack is settled at $0 at the register', cash.ok && (await bk(gr!.id)).status === 'completed', cash);

  // A late cancel uses the rounds.
  const soon = new Date(Date.now() + 2 * 3_600_000);
  const late = await prisma.teeTime.create({ data: { courseId: c.id, date: soon.toISOString().slice(0, 10), time: soon.toISOString().slice(11, 16), holes: 18, greenFeeCents: 5000, cartFeeCents: 2000, playersAvailable: 4 } });
  const lb = await createCounterBooking(c.id, { teeTimeId: late.id, golferName: 'Pat', players: 1, rate: `pack:${tenLine}` }, STAFF);
  if (lb.ok) await performCancellation(lb.id, STAFF);
  ok('cancelled inside the cutoff: the round is used', lb.ok && (await line(tenLine)).packRoundsUsed === 1, lb);

  // Void and return.
  ok('a pack with rounds used can\'t be voided', !(await voidCashSale(c.id, sold.value.id)).ok);
  ok('…nor refunded by amount', !(await refundSale(c.id, sold.value.id, { amountCents: 100, reason: 'x' }, 't')).ok);
  const ret = await refundSale(c.id, sold.value.id, { lines: [{ lineId: tenLine, quantity: 1 }], reason: 'x' }, 't');
  ok('…nor returned by item once a round is used', !ret.ok, ret);
  const spare = await createSale({ courseId: c.id, lines: [{ roundPackId: ten.id, quantity: 1 }], pay: 'cash', soldBy: 't', customerEmail: `${TAG}+lee@t.local` });
  if (!spare.ok) throw new Error('spare');
  const v = await voidCashSale(c.id, spare.value.id);
  ok('an unused pack voided the same day: its rounds are gone', v.ok && (await holdingsFor(c.id, `${TAG}+lee@t.local`)).length === 0, v);

  // Ends; never over the count, even at once.
  const old = await createSale({ courseId: c.id, lines: [{ roundPackId: four.id, quantity: 1 }], pay: 'cash', soldBy: 't', customerEmail: `${TAG}+old@t.local` });
  if (!old.ok) throw new Error('old');
  await prisma.shopSaleLine.updateMany({ where: { saleId: old.value.id }, data: { packValidDays: 1 } });
  await prisma.shopSale.update({ where: { id: old.value.id }, data: { paidAt: new Date(Date.now() - 2 * 86_400_000) } });
  const oldLine = old.value.lines[0].id;
  let ended = '';
  try { await prisma.$transaction(tx => takeRounds(tx, c.id, oldLine, 1)); } catch (e) { ended = e instanceof PackError ? e.message : 'other'; }
  ok('a pack past its days has ended', /ended/.test(ended) && (await holdingsFor(c.id, `${TAG}+old@t.local`)).length === 0, ended);
  await prisma.shopSaleLine.updateMany({ where: { saleId: old.value.id }, data: { packValidDays: null } });
  const got = await Promise.allSettled([1, 2, 3, 4, 5, 6].map(() => prisma.$transaction(tx => takeRounds(tx, c.id, oldLine, 1))));
  const l = await line(oldLine);
  ok('six at once on a 4-round pack: exactly four get one', got.filter(x => x.status === 'fulfilled').length === 4 && l.packRoundsUsed === 4 && packLeft(l) === 0, got.map(x => x.status));
  ok('another course can\'t use this course\'s pack', !(await createCounterBooking(other.id, { teeTimeId: slot.id, golferName: 'X', players: 1, rate: `pack:${tenLine}` }, STAFF)).ok);

  // Review BLOCK 1: a pack sale refunded in the Stripe dashboard ends its packs.
  const card = await createSale({ courseId: c.id, lines: [{ roundPackId: four.id, quantity: 1 }], pay: 'cash', soldBy: 't', customerEmail: `${TAG}+card@t.local` });
  if (!card.ok) throw new Error('card');
  await prisma.shopSale.update({ where: { id: card.value.id }, data: { status: 'paid_card', paymentIntentId: `pi_${TAG}` } });
  ok('a card pack before the refund: 4 rounds', (await holdingsFor(c.id, `${TAG}+card@t.local`))[0]?.left === 4);
  await endPacksRefundedOutside(`pi_${TAG}`);
  ok('…refunded in the Stripe dashboard: no rounds left', (await holdingsFor(c.id, `${TAG}+card@t.local`)).length === 0);
  await giveBack(prisma, card.value.lines[0].id, 2);
  ok('…and rounds a cancel gives back afterwards don\'t revive it', (await holdingsFor(c.id, `${TAG}+card@t.local`)).length === 0);
  const hook = readFileSync('src/app/api/stripe/webhook/route.ts', 'utf8');
  ok('…the webhook ends packs for refunds not made from the register', hook.includes('!r.metadata?.shopRefundId') && hook.includes('endPacksRefundedOutside('));

  // Review BLOCK 2: a group that owes nothing checks in with no card and no Stripe call.
  const zero = await createCounterBooking(c.id, { teeTimeId: slot2.id, golferName: 'Pat', players: 2, rate: `pack:${card.value.lines[0].id}` }, STAFF);
  if (!zero.ok) console.log('(zero booking not made — pack ended above, expected)');
  const z2sale = await createSale({ courseId: c.id, lines: [{ roundPackId: four.id, quantity: 1 }], pay: 'cash', soldBy: 't', customerEmail: `${TAG}+z@t.local` });
  if (!z2sale.ok) throw new Error('z2');
  const z = await createCounterBooking(c.id, { teeTimeId: slot2.id, golferName: 'Zed', players: 2, rate: `pack:${z2sale.value.lines[0].id}` }, STAFF);
  const ci = z.ok ? await performCheckIn(z.id, STAFF) : null;
  const zr = z.ok ? await bk(z.id) : null;
  ok('$0 group: checked in, paid, nothing charged', !!ci && !('error' in ci && ci.error) && zr?.status === 'completed' && zr.paymentStatus === 'paid' && !zr.roundPaymentIntentId, { ci, zr });
  const ops = readFileSync('src/app/api/operator/bookings/route.ts', 'utf8');
  ok('…and no $0 pay link is sent', ops.includes("if (roundChargeCents(b) === 0) return NextResponse.json({ error: 'This group owes nothing"));

  // PART B: online — the holder is the signed-in golfer's account email.
  const ob = await createSale({ courseId: c.id, lines: [{ roundPackId: four.id, quantity: 1 }], pay: 'cash', soldBy: 't', customerEmail: `${TAG}+ob@t.local` });
  if (!ob.ok) throw new Error('ob');
  let notYours = '';
  try { await prisma.$transaction(tx => takeRounds(tx, c.id, ob.value.lines[0].id, 1, { email: `${TAG}+someone@t.local` })); } catch (e) { notYours = e instanceof PackError ? e.message : 'other'; }
  ok('online: someone else\'s pack is refused', /someone else/.test(notYours), notYours);
  await prisma.$transaction(tx => takeRounds(tx, c.id, ob.value.lines[0].id, 1, { email: `${TAG}+OB@t.local` }));
  ok('…the holder\'s own (any case) is used', (await line(ob.value.lines[0].id)).packRoundsUsed === 1);
  // Buying online (review BLOCK: one open sale per golfer and pack, never a pile on the register).
  ok('a pack not sold online can\'t be bought online', !(await buyPackOnline(c.id, four.id, { email: `${TAG}+web@t.local`, name: 'Web', phone: '' })).ok);
  await prisma.roundPack.update({ where: { id: four.id }, data: { sellOnline: true } });
  ok('…nor another course\'s pack', !(await buyPackOnline(other.id, four.id, { email: `${TAG}+web@t.local`, name: 'Web', phone: '' })).ok);
  const b1o = await buyPackOnline(c.id, four.id, { email: `${TAG}+WEB@t.local`, name: 'Web', phone: '' });
  const so = b1o.ok ? await prisma.shopSale.findUniqueOrThrow({ where: { id: b1o.saleId }, include: { lines: true } }) : null;
  ok('bought online: an open link sale, the account email (lower case) the holder, the pack\'s price, no tax', !!so && so.status === 'open' && so.soldBy === 'online' && so.customerEmail === `${TAG}+web@t.local` && so.totalCents === 18000 && so.taxCents === 0 && so.lines[0].roundPackId === four.id && !!so.payToken, so);
  const b2o = await buyPackOnline(c.id, four.id, { email: `${TAG}+web@t.local`, name: 'Web', phone: '' });
  ok('…buying again while it\'s unpaid gives the same link', b1o.ok && b2o.ok && b1o.saleId === b2o.saleId && b1o.payToken === b2o.payToken);
  ok('…and no rounds until it\'s paid', (await holdingsFor(c.id, `${TAG}+web@t.local`)).length === 0);
  const tookCash = b1o.ok ? await settleOpenSale(c.id, b1o.saleId, 'paid_cash') : null;
  ok('…staff can\'t mark a golfer\'s online purchase paid in cash', !!tookCash && !tookCash.ok && /bought this online/.test(tookCash.error), tookCash);
  ok('…but can void it', b1o.ok && (await settleOpenSale(c.id, b1o.saleId, 'void')).ok);
  // The page and the server price a pack booking alike: the public seat at the deal price.
  const dp = packPrice({ players: 3, seats: 1, guests: false, coversCart: false, publicGreen: dealSeat(20, 5000), cartFee: 2000, cart: true });
  ok('holder + 2 guests in a 20% deal window: $80 green, $60 cart', dp.greenFeeTotal === 8000 && dp.cartFeeTotal === 6000, dp);

  const bookRoute = readFileSync('src/app/api/bookings/route.ts', 'utf8');
  ok('online booking: signed in, the holder\'s own pack, no code with it', bookRoute.includes("if (!golferSession?.email) return NextResponse.json({ error: 'Sign in to use your round pack.'") && bookRoute.includes('h.holderEmail.toLowerCase() !== golferSession.email.trim().toLowerCase()') && bookRoute.includes('PACK_NO_CODE'));
  ok('…rounds taken as the holder, and given back if the booking isn\'t made', bookRoute.includes('takeRounds(tx, teeTimeFull.courseId, use.lineId, use.seats, { email: golferSession!.email })') && (bookRoute.match(/if \(pack\) await giveBack\(prisma, pack\.lineId, pack\.seats\);/g) ?? []).length === 2);
  const buy = readFileSync('src/app/api/courses/[slug]/packs/route.ts', 'utf8');
  ok('buying online: signed in, rate limited, a live course that isn\'t archived, the account email the holder', buy.includes("if (!golfer?.email) return NextResponse.json({ error: 'Sign in to buy") && buy.includes('rateLimit(`pack-buy:') && buy.includes("liveStatus: 'live', archivedAt: null") && buy.includes('buyPackOnline(course.id, packId, { email: golfer.email'));
  const preview = readFileSync('src/app/api/bookings/resident-rate/route.ts', 'utf8');
  ok('the booking page sees only the signed-in golfer\'s packs', preview.includes('golfer?.email ? (await holdingsFor(tt.courseId, golfer.email))'));

  // Wiring.
  const route = readFileSync('src/app/api/operator/round-packs/route.ts', 'utf8');
  ok('changing packs needs shop.catalog and a current agreement; this course only', route.includes("requirePermission(session, 'shop.catalog')") && route.includes('requireAgreementCurrent') && route.includes('courseId: g.session.courseId'));
  ok('a holder\'s email only with golfer-contact permission', route.includes("can(session, 'sheet.golfer_contact')"));
  ok('packs are cleared by the launch wipe', WIPED_TABLES.includes('RoundPack'));
  const cancel = readFileSync('src/lib/cancel-booking.ts', 'utf8');
  ok('a cancel gives rounds back by the booking-fee rule', cancel.includes('if (!(!waiveFee && !opts.courseCalledOff && (isLate || !!noShowCharge))) await releaseBookingRounds(bookingId);'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('round-packs-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
