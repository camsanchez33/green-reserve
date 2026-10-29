// Revamp 3 audit fixes (Cam 2026-10-29: "the 12 fixes first"). Source checks for
// the small ones; the money ones have their own database tests
// (member-rates-db-test and friends).
// Run: npx tsx scripts/revamp3-fixes-test.ts
import { readFileSync } from 'fs';
import { stockWords, skuHits, bySku, type FlatItem } from '../src/lib/shop-tree';

let failed = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed++; };
const src = (f: string) => readFileSync(f, 'utf8');

// Fix 4: an unsigned Operator Agreement never locks staff out of the tee sheet.
const sheet = src('src/app/dashboard/page.tsx');
ok('fix 4: staff see one line, not the full-screen prompt', sheet.includes('!courseArchived && access.isStaff && (') && sheet.includes('The course owner needs to sign the updated Operator Agreement.'));
ok('fix 4: the full-screen prompt is for the owner only, and has a Later', sheet.includes('!access.isStaff && !agreementLater && (') && sheet.includes('onClick={() => setAgreementLater(true)}'));

// Fix 5: a price change reaches every bookable day, and the open spots of booked times.
const engine = src('src/lib/tee-sheet-engine.ts');
ok('fix 5: a schedule save rebuilds the whole booking window, not 8 days', engine.includes('const n = days ?? await regenerationDays(courseId);') && engine.includes('Math.max(8, generationHorizonDays(c, c.membershipTiers))'));
ok('fix 5: the save preview covers the same days', src('src/lib/schedule-preview.ts').includes('length: await regenerationDays(courseId)'));
ok('fix 5: a booked time still to come takes the new price for its open spots', engine.includes('if (changed && at && at.getTime() > nowMs)'));

// Fix 9: an oversold count says so; a code on two items is named at the register, never a silent nothing.
const item = (id: string, sku: string) => ({ id, sku, active: true, parentId: null, name: id, category: '', priceCents: 100, stockCount: null, optionLabel: null, sortOrder: 0, taxCategory: 'general' }) as unknown as FlatItem;
ok('fix 9: below zero reads as oversold', stockWords(-2) === '2 oversold' && stockWords(0) === 'none left' && stockWords(3) === '3 left');
ok('fix 9: two items with one code are both found (the register names it)', skuHits([item('a', 'X1'), item('b', 'x1')], 'X1').length === 2 && bySku([item('a', 'X1'), item('b', 'x1')], 'X1') === null);
ok('fix 9: the register reports a shared code', src('src/app/dashboard/shop/page.tsx').includes('skuHits(items ?? [], code).length > 1'));

if (failed) { console.error(`revamp3-fixes: ${failed} failed`); process.exit(1); }
console.log('revamp3-fixes: all passed');
