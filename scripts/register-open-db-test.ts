// POS-7 (Cam 2026-11-09: "input a starting cash at the beginning of the day … an actual set starting amount of cash
// that locks after it is confirmed"; "any staff member at the register … they can allow to set permissions for it").
// Opening the register locks today's starting cash; changing it after needs shop.open_fix and a reason, and keeps
// the first amount; the close-out counts from the locked amount, never a typed one; two at once can't both open.
// Needs a database. Run: npx tsx scripts/register-open-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { openRegister, registerOpenFor } from '../src/lib/register-open';
import { closeDay } from '../src/lib/register-close';
import { PERMISSIONS, PRESETS, normalizePermissions } from '../src/lib/staff-permissions';
import { WIPED_TABLES } from '../src/lib/data-reset';

const TAG = 'registeropendbtest';
let failed = 0;
const ok = (l: string, c: boolean, d: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : ' — ' + JSON.stringify(d)}`); if (!c) failed++; };

async function cleanup() {
  const ids = (await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } })).map(c => c.id);
  await prisma.registerOpen.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.registerClose.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
}

(async () => {
  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string) => prisma.course.create({ data: { name: `Open ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1', city: 'X', state: 'NJ', zipCode: '9', holes: 18, timezone: 'UTC' } });
  const c = await mk('a'), other = await mk('b');

  ok('not open yet', (await registerOpenFor(c.id)).ok && !(await registerOpenFor(c.id) as { value: { current: unknown } }).value.current);
  ok('a fix before opening is refused', !(await openRegister(c.id, { startingCashCents: 100, reason: 'x' }, 'a', 'fix')).ok);
  ok('a bad amount is refused', !(await openRegister(c.id, { startingCashCents: -5 }, 'a', 'open')).ok && !(await openRegister(c.id, { startingCashCents: 'ten' }, 'a', 'open')).ok);
  const both = await Promise.all([openRegister(c.id, { startingCashCents: 10000 }, 'a', 'open'), openRegister(c.id, { startingCashCents: 20000 }, 'b', 'open')]);
  ok('two opening at once: exactly one wins', both.filter(r => r.ok).length === 1, both);
  const v = await registerOpenFor(c.id);
  const first = v.ok ? v.value.current?.startingCashCents : null;
  ok('…and it is locked: opening again is refused', !(await openRegister(c.id, { startingCashCents: 5000 }, 'c', 'open')).ok);
  ok('a change needs a reason', !(await openRegister(c.id, { startingCashCents: 15000, reason: '  ' }, 'm', 'fix')).ok);
  const fx = await openRegister(c.id, { startingCashCents: 15000, reason: 'Miscounted the fives' }, 'm', 'fix');
  ok('a change with a reason stands, and the first amount stays on record', fx.ok && fx.value.current?.startingCashCents === 15000 && fx.value.history.length === 2 && fx.value.history[0].startingCashCents === first && fx.value.current.reason === 'Miscounted the fives', fx);
  ok('another course is untouched', !(await registerOpenFor(other.id) as { value: { current: unknown } }).value.current);

  const close = await closeDay(c.id, { openingFloatCents: 99999, countedCashCents: 15000 }, 'z');
  ok('the close-out counts from the locked $150, never the typed amount', close.ok && close.value.openingFloatCents === 15000 && close.value.expectedCashCents === 15000 && close.value.differenceCents === 0, close);
  const close2 = await closeDay(other.id, { openingFloatCents: 5000, countedCashCents: 5000 }, 'z');
  ok('a day never opened still takes the typed starting cash', close2.ok && close2.value.openingFloatCents === 5000, close2);

  // Permissions and wiring.
  const keys = PERMISSIONS.map(p => p.key);
  ok('Open the register and Change the starting cash are permissions, in that order of need', keys.includes('shop.open') && keys.includes('shop.open_fix') && normalizePermissions(['shop.open_fix']).includes('shop.open') && normalizePermissions(['shop.open']).includes('shop.sell'));
  ok('Front desk opens the register but can\'t change it after', PRESETS.find(p => p.key === 'front_desk')!.keys.includes('shop.open') && !PRESETS.find(p => p.key === 'front_desk')!.keys.includes('shop.open_fix'));
  const route = readFileSync('src/app/api/operator/register-open/route.ts', 'utf8');
  ok('the route gates open and fix on their own permission', route.includes("requirePermission(session, mode === 'fix' ? 'shop.open_fix' : 'shop.open')") && route.includes("requirePermission(session, 'shop.sell')"));
  const home = readFileSync('src/app/dashboard/home/page.tsx', 'utf8'), shop = readFileSync('src/app/dashboard/shop/page.tsx', 'utf8');
  // DRAWER-1 (Cam 2026-11-09) reverses "never blocks a sale": nothing is charged at the register until it is open (scripts/drawer-cycle-db-test.ts).
  ok('Home and the Register ask until it is open', home.includes('<OpenRegister where="home" />') && shop.includes('<OpenRegister where="register" onStatus={setRegStatus} />'));
  ok('opens are cleared by the launch wipe and a test-course reset', WIPED_TABLES.includes('RegisterOpen') && readFileSync('src/lib/data-reset.ts', 'utf8').includes('prisma.registerOpen.deleteMany({ where: { courseId } })'));

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('register-open-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
