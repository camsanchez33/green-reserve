// POS-6 (Cam 2026-11-09, round packs: "get rid of that … something different that will be worked out in the
// membership tab"): round packs are turned off everywhere — no pack is sold (register, online Buy, quotes) and no
// booking uses one (online or counter). A pack already held can still come back, be voided or given back on a cancel.
// Run: npx tsx scripts/round-packs-off-test.ts
import { readFileSync } from 'fs';
import { ROUND_PACKS_ON, PACKS_OFF } from '../src/lib/round-packs-switch';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const read = (p: string) => readFileSync(p, 'utf8');

// The selling tests (round-packs-db-test, pack-open-links-db-test) were retired with the switch — they sell packs,
// which is now refused. Turning packs back on means restoring them from git history (POS-6) first.
ok('the switch is off (turning it on = restore round-packs-db-test and pack-open-links-db-test from git first)', ROUND_PACKS_ON === false && PACKS_OFF.length > 0);
ok('no sale prices a pack (register, online Buy, quotes all go through priceLines)', read('src/lib/shop-sales.ts').includes('if (wantedPacks.size && !ROUND_PACKS_ON) return fail(410, PACKS_OFF);'));
ok('an online booking refuses a pack', read('src/app/api/bookings/route.ts').includes("if (usePack && !ROUND_PACKS_ON) return NextResponse.json({ error: PACKS_OFF, code: 'pack' }, { status: 410 });"));
ok('a counter booking refuses a pack', read('src/lib/counter-pay.ts').includes("if (rate.startsWith('pack:') && !ROUND_PACKS_ON) return { ok: false, status: 410, error: PACKS_OFF };"));
ok('the booking page lists no packs to use', read('src/app/api/bookings/resident-rate/route.ts').includes('const packs = ROUND_PACKS_ON && golfer?.email ?'));
ok('the course page sells none', read('src/lib/public-course.ts').includes('const sellsPacks = ROUND_PACKS_ON &&') && read('src/app/api/courses/[slug]/packs/route.ts').includes('ROUND_PACKS_ON && course.stripeAccountActive'));
ok('the tee sheet\'s rate list has no Round pack', read('src/app/dashboard/page.tsx').includes('...(ROUND_PACKS_ON ? [PACK_RATE] : [])'));
ok('a pack sale left unpaid from before is never paid: pay link, Took cash, card reader', read('src/lib/shop-sales.ts').includes("if (to === 'paid_cash') { const off = await packSaleOff(saleId, courseId); if (off) return fail(410, off); }") && read('src/lib/shop-sales.ts').includes('if (await packSaleOff(saleId)) return fail(410,') && read('src/lib/card-reader.ts').includes('const off = await packSaleOff(saleId); if (off) return fail(410, off);'));
ok('a held pack can still be returned or voided (those paths are untouched)', read('src/lib/shop-sales.ts').includes("return it by item, so its rounds end with the refund.") && read('src/lib/round-packs.ts').includes('export async function giveBack('));

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
