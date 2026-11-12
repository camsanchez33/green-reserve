// CART-2 (Cam 2026-11-06): carts charged per player (as before) or per cart of two riders, rounded up.
// Pure rules (lib/cart-pricing) + every path that prices a cart calls them.
// Run: npx tsx scripts/cart-pricing-test.ts
import { readFileSync } from 'fs';
import { cartsFor, cartCharge, resizeCart, splitRiders, cartRuleOf, cartPriceWords } from '../src/lib/cart-pricing';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

// ── the rule ──
ok('riders round up to carts: 1→1, 2→1, 3→2, 4→2, 0→0', [1, 2, 3, 4, 0].map(cartsFor).join() === '1,1,2,2,0');
ok('anything but per_cart is per player', cartRuleOf('per_cart') === 'per_cart' && cartRuleOf('x') === 'per_player' && cartRuleOf(undefined) === 'per_player');
const pp = cartCharge({ rule: 'per_player', cart: true, players: 3, unitCents: 2000, perPlayerTotal: 5400 });
ok('per player: the per-player rules\' total, unchanged, nothing copied', pp.cartFeeTotal === 5400 && pp.cartUnitCents === null && pp.cartRiders === null);
const pc = cartCharge({ rule: 'per_cart', cart: true, players: 3, unitCents: 3000, perPlayerTotal: 9000 });
ok('per cart: 3 riders = 2 carts at the cart price; price and riders kept on the booking', pc.cartFeeTotal === 6000 && pc.cartUnitCents === 3000 && pc.cartRiders === 3);
ok('per cart, pack seats that include the cart leave the count (4 players, 1 covered = 2 carts)', cartCharge({ rule: 'per_cart', cart: true, players: 4, coveredSeats: 1, unitCents: 3000, perPlayerTotal: 0 }).cartFeeTotal === 6000);
ok('per cart, every seat covered = no cart charge', cartCharge({ rule: 'per_cart', cart: true, players: 2, coveredSeats: 2, unitCents: 3000, perPlayerTotal: 0 }).cartFeeTotal === 0);
ok('no cart = nothing, under either rule', cartCharge({ rule: 'per_cart', cart: false, players: 4, unitCents: 3000, perPlayerTotal: 0 }).cartFeeTotal === 0 && cartCharge({ rule: 'per_player', cart: false, players: 4, unitCents: 3000, perPlayerTotal: 99 }).cartFeeTotal === 0);

// ── a group changing size ──
ok('a per-player booking is left to its own rules', resizeCart({ players: 4, cartSelected: true, cartUnitCents: null, cartRiders: null }, 3) === null);
const down = resizeCart({ players: 4, cartSelected: true, cartUnitCents: 3000, cartRiders: 4 }, 3);
ok('per cart, 4 → 3: still 2 carts at the booked price', !!down && down.cartFeeTotal === 6000 && down.cartRiders === 3);
const two = resizeCart({ players: 3, cartSelected: true, cartUnitCents: 3000, cartRiders: 3 }, 2);
ok('per cart, 3 → 2: one cart', !!two && two.cartFeeTotal === 3000 && two.cartRiders === 2);
const up = resizeCart({ players: 2, cartSelected: true, cartUnitCents: 3000, cartRiders: 1 }, 3);
ok('per cart with a covered seat, 2 → 3: riders 1 → 2, one cart', !!up && up.cartRiders === 2 && up.cartFeeTotal === 3000);
ok('never more riders than players', resizeCart({ players: 4, cartSelected: true, cartUnitCents: 3000, cartRiders: 4 }, 1)!.cartRiders === 1);

// ── a split ──
ok('a per-player booking has no riders to split', splitRiders({ players: 4, cartUnitCents: null, cartRiders: null }, 1).leave === null);
const sp = splitRiders({ players: 4, cartUnitCents: 3000, cartRiders: 3 }, 2);
ok('per cart: who leaves takes their riders; the covered seat stays with the booker', sp.leave === 2 && sp.keep === 1);

ok('the words: a cart (2 riders) or a player', cartPriceWords('per_cart', 3000) === '$30.00 a cart (2 riders)' && cartPriceWords('per_player', 2000) === '$20.00 a player');

// ── every pricing path uses it ──
const bookings = read('src/app/api/bookings/route.ts');
ok('online booking: the course rule, pack seats covered, price and riders copied, no member cart spot', bookings.includes('cartCharge({ rule: cartRule, cart: wantsCart, players, coveredSeats: pack?.coversCart ? pack.seats : 0, unitCents: teeTimeFull.cartFeeCents, perPlayerTotal: perPlayerCart })')
  && bookings.includes('cartFeeTotal, cartUnitCents: cart.cartUnitCents, cartRiders: cart.cartRiders,') && bookings.includes('...(cart.cartUnitCents != null ? { memberCartCents: null } : {}),'));
const counter = read('src/lib/counter-pay.ts');
ok('counter booking: the same', counter.includes('cartCharge({ rule: cartRuleOf(teeTime.course.cartPricing), cart, players, coveredSeats: packUse?.coversCart ? packUse.rounds : 0') && counter.includes('cartUnitCents: cartPriced.cartUnitCents, cartRiders: cartPriced.cartRiders,'));
ok('admin booking: the same', read('src/app/api/admin/tee-sheet/route.ts').includes('cartCharge({ rule: cartRuleOf(teeTime.course.cartPricing)'));
const move = read('src/lib/move-booking.ts');
ok('a move: a per-cart booking stays per cart; one taking a cart for the first time follows the course', move.includes("const cartRule = b.cartUnitCents != null ? 'per_cart' : !b.cartSelected ? cartRuleOf(b.course.cartPricing) : 'per_player';") && move.includes('data.cartUnitCents = cartPriced.cartUnitCents; data.cartRiders = cartPriced.cartRiders ?? ppRiders;'));
const party = read('src/lib/change-party.ts');
ok('a party change re-counts the carts', party.includes('const cartResized = resizeCart(booking, newPlayers);') && party.includes('...(cartResized ? { cartRiders: cartResized.cartRiders } : ridersAfter != null ? { cartRiders: ridersAfter } : {})'));
const split = read('src/lib/split-booking-db.ts');
ok('a split carries the riders and the cart price', split.includes('const riders = splitRiders(b, off.players);') && split.includes('cartUnitCents: b.cartUnitCents, cartRiders: riders.leave'));
ok('the booking page and checkout count carts the server\'s way', read('src/app/courses/[slug]/CourseBookingClient.tsx').includes('const cartsSel = perCartSel ? cartsFor(sp) : sp;') && read('src/app/book/BookClient.tsx').includes('perCart ? cartsN * teeTime.cart_fee'));
ok('the manage page previews the same', read('src/app/manage/[bookingId]/page.tsx').includes('resizeCart({ players: info.players') && read('src/app/manage/[bookingId]/page.tsx').includes('cartsFor(info.party.cartRiders ?? info.players)'));
const checkin = read('src/lib/checkin-booking.ts');
ok('"Add a cart today?" at check-in: per cart on a per-cart course, and the booking becomes per cart', checkin.includes("if (cartRuleOf(grace.cartPricing) === 'per_cart') return cartCharge({ rule: 'per_cart', cart: true, players: booking.players, unitCents: standard, perPlayerTotal: 0 }).cartFeeTotal;")
  && checkin.includes('totalAmount: booking.totalAmount + cartAddedCents, ...addedCartRule }') && checkin.includes('totalAmount: base + cartAddedCents, ...addedCartRule }'));
ok('the golfer page is told the rule', read('src/lib/normalize-course.ts').includes("cart_pricing:            c.cartPricing === 'per_cart' ? 'per_cart' : 'per_player',"));

// ── Settings ──
const settings = read('src/app/api/operator/settings/route.ts');
ok('Settings: owner only, and only the two values', settings.includes("if (session.isStaff && 'cartPricing' in body)") && read('src/lib/settings-validation.ts').includes("cartPricing: ['per_player', 'per_cart'],"));
ok('Settings page: the choice, read-only for staff', read('src/app/dashboard/settings/page.tsx').includes('<option value="per_cart">Per cart (2 riders)</option>') && read('src/app/dashboard/settings/page.tsx').includes("'counterMemberRate', 'cartPricing', 'timezone', 'type'];"));
ok('the schedule names its cart cell by the rule', read('src/app/dashboard/schedules/page.tsx').includes("perCart ? 'Cart, per cart (2 riders)' : 'Cart, per rider'"));
ok('the migration only adds', /ADD COLUMN "cartPricing" TEXT NOT NULL DEFAULT 'per_player'/.test(read('prisma/migrations/20261106010000_cart_pricing/migration.sql')) && !/DROP|ALTER COLUMN|UPDATE/.test(read('prisma/migrations/20261106010000_cart_pricing/migration.sql')));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
