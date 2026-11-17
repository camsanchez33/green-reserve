// Settings data (Cam 2026-11-17): the confirmation email parts, the sales-tax
// default from the course's address, and Test reader — against a real database
// with Stripe stubbed. Run: npx tsx scripts/settings-data-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { stripe } from '../src/lib/stripe';
import { confirmationPartsOf, confirmationLines, DEFAULT_ARRIVAL } from '../src/lib/confirmation-parts';
import { setUpTax, taxStatus, stateCode } from '../src/lib/sales-tax';
import { testReader } from '../src/lib/card-reader';
import { validateSettingsPatch } from '../src/lib/settings-validation';

const TAG = 'settingsdata';
let failed = 0;
const ok = (l: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c || !i ? '' : ' — ' + (typeof i === 'string' ? i : JSON.stringify(i))}`); if (!c) failed++; };
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// ── Stripe stubs ────────────────────────────────────────────────────────────
type Rdr = { id: string; location: string; status: string; device_type: string; label: string; serial_number: string; action: null | { type: string; status: string } };
const readers = new Map<string, Rdr>();
const calls: string[] = [];
let startPaymentDuringTest = false;
const terminal = stripe.terminal as unknown as Record<string, Record<string, unknown>>;
terminal.readers.retrieve = async (id: string) => { const r = readers.get(id); if (!r) throw new Error('no such reader'); return { ...r, action: r.action && { ...r.action } }; };
terminal.readers.setReaderDisplay = async (id: string, p: { cart: { total: number } }) => {
  calls.push(`display:${id}:${p.cart.total}`);
  const r = readers.get(id)!; r.action = { type: 'set_reader_display', status: 'succeeded' };
  if (startPaymentDuringTest) r.action = { type: 'process_payment_intent', status: 'in_progress' };
  return { ...r };
};
terminal.readers.cancelAction = async (id: string) => { calls.push(`cancel:${id}`); readers.get(id)!.action = null; return { ...readers.get(id)! }; };
const regs: { state: string; account: string }[] = [];
const tax = stripe.tax as unknown as Record<string, Record<string, unknown>>;
tax.settings.update = async () => ({});
tax.settings.retrieve = async () => ({ status: 'active', status_details: {} });
tax.registrations.list = async (_p: unknown, o: { stripeAccount: string }) => ({ data: regs.filter(r => r.account === o.stripeAccount).map(r => ({ country: 'US', country_options: { us: { type: 'state_sales_tax', state: r.state } } })) });
tax.registrations.create = async (p: { country_options: { us: { state: string } } }, o: { stripeAccount: string }) => { regs.push({ state: p.country_options.us.state, account: o.stripeAccount }); return {}; };

async function cleanup() {
  await prisma.course.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.courseOperator.deleteMany({ where: { email: `${TAG}@t.local` } });
}

(async () => {
  // Parts and the lines the email shows.
  const blank = confirmationPartsOf({});
  ok('a course that wrote nothing gets today’s arrival line only', JSON.stringify(confirmationLines(blank)) === JSON.stringify([{ label: 'Arrival', text: DEFAULT_ARRIVAL }]));
  ok('a course that only wrote a note keeps today’s email (the note, no default line)', JSON.stringify(confirmationLines(confirmationPartsOf({ confirmationNote: 'Carts path-only' }))) === JSON.stringify([{ label: '', text: 'Carts path-only' }]));
  const full = confirmationPartsOf({ confirmationArrival: ' Check in 15 min early ', dresscode: ['Collared shirts', '', 'No denim'], confirmationParking: 'Lot behind', confirmationNote: 'Path only', confirmationContact: 'Call us' });
  ok('every part shows in order with its label', confirmationLines(full).map(l => `${l.label}|${l.text}`).join(';') === 'Arrival|Check in 15 min early;Dress code|Collared shirts, No denim;Parking|Lot behind;|Path only;|Call us');
  ok('the policy is never a course-written part', !Object.keys(full).some(k => /polic|cancel|fee/i.test(k)));
  const v = validateSettingsPatch({ confirmationArrival: 'x'.repeat(301) }, ['confirmationArrival']);
  ok('a part over 300 characters is refused', !v.ok);
  ok('a part within bounds is accepted', validateSettingsPatch({ confirmationParking: 'Lot behind the clubhouse' }, ['confirmationParking']).ok);

  // Static: the routes' gates.
  const email = readFileSync('src/app/api/operator/settings/confirmation-email/route.ts', 'utf8');
  ok('preview and test send each require settings.edit', (email.match(/requirePermission\(session, 'settings\.edit'\)/g) ?? []).length === 2);
  ok('the test goes to the signed-in person’s own row, never an address from the request', !/req\.json|request\.json/.test(email) && /courseOperator\.findUnique|courseStaff\.findUnique/.test(email));
  ok('the test is rate limited', email.includes('rateLimit('));
  const rt = readFileSync('src/app/api/operator/card-readers/test/route.ts', 'utf8');
  ok('reader test is owner only', rt.includes('session.isStaff') && rt.includes('STAFF_FORBIDDEN'));
  const settings = readFileSync('src/app/api/operator/settings/route.ts', 'utf8');
  ok('the parts save through the settings PATCH (requirePermission settings.edit)', ["'confirmationArrival'", "'confirmationParking'", "'confirmationContact'"].every(k => settings.includes(k)) && settings.includes("requirePermission(session, 'settings.edit')"));

  await cleanup();
  const op = await prisma.courseOperator.create({ data: { name: 'x', email: `${TAG}@t.local`, password: 'x' } });
  const mk = (n: string, state: string, acct: string | null, loc = '') => prisma.course.create({ data: { name: `Settings ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Main', city: 'X', state, zipCode: '07001', holes: 18, timezone: 'UTC', stripeAccountId: acct ?? undefined, stripeAccountActive: !!acct, terminalLocationId: loc } });

  // Sales tax: the address's state is the default; given states override.
  ok('state codes are recognised; anything else is blank', stateCode(' ny ') === 'NY' && stateCode('New York') === '' && stateCode(null) === '');
  const ny = await mk('ny', 'NY', 'acct_ny');
  ok('status names the address’s state', (await taxStatus(ny.id)).addressState === 'NY');
  const r1 = await setUpTax(ny.id, []);
  ok('set-up with no states registers the address’s state', r1.ok && regs.filter(r => r.account === 'acct_ny').map(r => r.state).join() === 'NY', r1);
  const pa = await mk('pa', 'NJ', 'acct_pa');
  const r2 = await setUpTax(pa.id, ['PA']);
  ok('given states override the default', r2.ok && regs.filter(r => r.account === 'acct_pa').map(r => r.state).join() === 'PA', r2);
  const bad = await mk('bad', 'Nowhere', 'acct_bad');
  const r3 = await setUpTax(bad.id, []);
  ok('no usable address state and none given: asks for one', !r3.ok);

  // Test reader.
  const shop = await mk('shop', 'NJ', 'acct_shop', 'tml_shop');
  readers.set('tmr_on', { id: 'tmr_on', location: 'tml_shop', status: 'online', device_type: 'bbpos_wisepos_e', label: 'Front', serial_number: '1', action: null });
  readers.set('tmr_off', { id: 'tmr_off', location: 'tml_shop', status: 'offline', device_type: 'bbpos_wisepos_e', label: 'Hut', serial_number: '2', action: null });
  readers.set('tmr_busy', { id: 'tmr_busy', location: 'tml_shop', status: 'online', device_type: 'bbpos_wisepos_e', label: 'Busy', serial_number: '3', action: { type: 'process_payment_intent', status: 'in_progress' } });
  readers.set('tmr_other', { id: 'tmr_other', location: 'tml_elsewhere', status: 'online', device_type: 'bbpos_wisepos_e', label: 'Other', serial_number: '4', action: null });

  const t1 = await testReader(shop.id, 'tmr_on');
  ok('an online reader passes: a $0.00 display, then cleared', t1.ok && t1.value.passed && calls.join() === 'display:tmr_on:0,cancel:tmr_on', { t1, calls });
  calls.length = 0;
  const t2 = await testReader(shop.id, 'tmr_off');
  ok('an offline reader fails with what to do, and nothing is sent to it', t2.ok && !t2.value.passed && !t2.value.online && /Wi-Fi/.test(t2.value.message) && calls.length === 0);
  const t3 = await testReader(shop.id, 'tmr_busy');
  ok('a reader taking a payment is refused, untouched', !t3.ok && t3.status === 409 && calls.length === 0);
  const t4 = await testReader(shop.id, 'tmr_other');
  ok('another course’s reader is not found', !t4.ok && t4.status === 404 && calls.length === 0);
  startPaymentDuringTest = true;
  const t5 = await testReader(shop.id, 'tmr_on');
  ok('a payment started during the test is never cancelled by it', t5.ok && t5.value.passed && !calls.some(c => c.startsWith('cancel')) && readers.get('tmr_on')!.action?.type === 'process_payment_intent', calls);

  await cleanup(); await prisma.$disconnect();
  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log('settings-data-db: all passed');
})().catch(async e => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
