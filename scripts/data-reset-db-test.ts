// TEST-1 — the launch wipe and resetting a test course, against a database.
// Every schema model is named in exactly one of WIPED_TABLES / KEPT_TABLES; a
// test course's activity is cleared while its setup and every other course
// are untouched; a course not marked as a test is refused; the launch wipe
// closes on Dec 1 and, run inside a transaction that is then rolled back,
// empties every wiped table and leaves the kept ones alone.
// Needs a database. Run: npx tsx scripts/data-reset-db-test.ts
import { readFileSync } from 'fs';
import { prisma } from '../src/lib/prisma';
import { applyHold } from '../src/lib/course-events';
import { WIPED_TABLES, KEPT_TABLES, WIPE_ALL_UNTIL, wipeAll, wipeAllOpen, resetTestCourse, previewCourseReset, clearTestInquiries, previewClearTestInquiries, OUTREACH_START } from '../src/lib/data-reset';

const TAG = 'resetdbtest';
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  if (!ok) failed++;
};

async function seedCourse(n: string, isTest: boolean) {
  const op = await prisma.courseOperator.create({ data: { name: `Op ${n}`, email: `${TAG}-${n}@test.local`, password: 'x' } });
  const course = await prisma.course.create({ data: {
    name: `Reset ${n}`, slug: `${TAG}-${n}`, operatorId: op.id, address: '1 Test Dr', city: 'T', state: 'CA', zipCode: '90210', holes: 18,
    liveStatus: 'live', active: true, timezone: 'UTC', cancellationHours: 24, isTest,
  } });
  const tt = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-06-10', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 2, status: 'available' } });
  const blocked = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-06-10', time: '08:10', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, status: 'blocked' } });
  const booking = await prisma.booking.create({ data: {
    teeTimeId: tt.id, courseId: course.id, golferName: 'T', golferEmail: `${TAG}-${n}@test.local`, players: 2,
    greenFeeTotal: 10000, cartFeeTotal: 0, accessFeeTotal: 300, totalAmount: 10300, status: 'completed', paymentStatus: 'paid', roundPaymentIntentId: 'pi_test',
  } });
  await prisma.paymentEvent.create({ data: { bookingId: booking.id, kind: 'charge', amountCents: 10300, detail: 'test' } });
  const tier = await prisma.membershipTier.create({ data: { courseId: course.id, name: 'Full' } });
  await prisma.courseMembership.create({ data: { courseId: course.id, tierId: tier.id, inviteEmail: `${TAG}-${n}-m@test.local`, inviteName: 'M' } });
  await prisma.courseResident.create({ data: { courseId: course.id, name: 'R' } });
  const item = await prisma.shopItem.create({ data: { courseId: course.id, name: 'Balls', priceCents: 500 } });
  await prisma.shopSale.create({ data: { courseId: course.id, totalCents: 500, status: 'paid_cash' } });
  const evTime = await prisma.teeTime.create({ data: { courseId: course.id, date: '2030-06-11', time: '08:00', holes: 18, greenFeeCents: 5000, cartFeeCents: 0, playersAvailable: 4, playersBooked: 0, status: 'available' } });
  const ev = await prisma.courseEvent.create({ data: { courseId: course.id, name: 'Outing', date: '2030-06-11', startTime: '08:00', holdFrom: '08:00', holdTo: '08:00' } });
  await applyHold(ev);
  return { course, tt, blocked, tier, item, evTime };
}

async function seedInquiry(n: string, extra: Record<string, unknown> = {}) {
  return prisma.courseInquiry.create({ data: {
    contactName: 'C', contactTitle: 'GM', email: `${TAG}-${n}@test.local`, phone: '5550000000', courseName: `${TAG} ${n}`,
    address: '1', city: 'T', state: 'CA', zipCode: '90210', courseType: 'public', lookingFor: [], ...extra,
  } });
}

async function main() {
  // Every model is decided.
  const models = [...readFileSync('prisma/schema.prisma', 'utf8').matchAll(/^model (\w+) \{/gm)].map(m => m[1]);
  const wiped = new Set<string>(WIPED_TABLES), kept = new Set<string>(KEPT_TABLES);
  const undecided = models.filter(m => !wiped.has(m) && !kept.has(m));
  const both = models.filter(m => wiped.has(m) && kept.has(m));
  const unknown = [...wiped, ...kept].filter(t => !models.includes(t));
  check('every table is either wiped or kept by the launch wipe (add a new model to one list in src/lib/data-reset.ts)', undecided.length === 0, undecided);
  check('no table is in both lists', both.length === 0, both);
  check('the lists name only real tables', unknown.length === 0, unknown);
  check('the company side is kept', ['AdminUser', 'OwnerSession', 'AdminAuditLog', 'Expense', 'AdminGoal', 'AgreementVersion'].every(t => kept.has(t)));
  // KEEP-OUTREACH (Cam 2026-11-18): the outreach pipeline is kept, and so is every table that hangs off an inquiry
  // (CourseContact from #462 included, whichever PR lands first).
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const onInquiry = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].filter(m => /\bCourseInquiry\??\s+@relation/.test(m[2])).map(m => m[1]);
  check('the outreach pipeline is kept', ['CourseInquiry', 'Call', 'InquiryStatusEvent', 'OutreachTouch'].every(t => kept.has(t)));
  check('every table that points at an inquiry is kept', onInquiry.length >= 4 && onInquiry.every(t => kept.has(t)), onInquiry.filter(t => !kept.has(t)));
  // TRUNCATE ... RESTRICT refuses when a kept table has a foreign key into a wiped one. wipeAll() handles Call → Course
  // itself; any other such key is a new link that needs the same thought.
  const fks = await prisma.$queryRawUnsafe<{ src: string; dst: string }[]>(
    `SELECT c.conrelid::regclass::text AS src, c.confrelid::regclass::text AS dst FROM pg_constraint c WHERE c.contype = 'f'`);
  const unq = (x: string) => x.replace(/"/g, '');
  const crossing = fks.filter(f => kept.has(unq(f.src)) && wiped.has(unq(f.dst))).map(f => `${unq(f.src)} -> ${unq(f.dst)}`);
  check('no kept table points into a wiped one, except Call -> Course (handled by wipeAll)', crossing.every(x => x === 'Call -> Course'), crossing);

  check('outreach starts at midnight Eastern on Nov 23', OUTREACH_START.toISOString() === '2026-11-23T05:00:00.000Z');
  // The wipe locks Call and CourseInquiry before anything else, so a call booked mid-wipe can't fall between the
  // copy and the TRUNCATE (final-reviewer reproduced that loss without the lock).
  const lib = readFileSync('src/lib/data-reset.ts', 'utf8');
  const body = lib.slice(lib.indexOf('export async function wipeAll'));
  const lockAt = body.indexOf('LOCK TABLE "Call", "CourseInquiry" IN ACCESS EXCLUSIVE MODE');
  check('the wipe locks Call and CourseInquiry first, before it reads or copies anything',
    lockAt > 0 && lockAt < body.indexOf('countTables(') && lockAt < body.indexOf('CREATE TEMP TABLE') && lockAt < body.indexOf('courseInquiry.'));
  // The clear's route keeps the launch wipe's gates.
  const iqRoute = readFileSync('src/app/api/admin/data-reset/inquiries/route.ts', 'utf8');
  const post = iqRoute.slice(iqRoute.indexOf('export async function POST'));
  const before = (x: string) => post.indexOf(x) > 0 && post.indexOf(x) < post.indexOf('clearTestInquiries(');
  check('the clear is owner only, with a fresh second step, a reason and the words typed, all before it deletes',
    before('requireOwner(session)') && before('stepUpRequired(session)') && before("needReason('inquiries_clear'") && before('CONFIRM_WORDS')
    && /requireOwner\(session\)/.test(iqRoute.slice(0, iqRoute.indexOf('export async function POST'))));
  const sys = readFileSync('src/app/admin/system/page.tsx', 'utf8');
  check('the wipe card counts the inquiries made before Nov 23 in what it deletes', /w\.testInquiries \?\? 0\)\.toLocaleString/.test(sys) && /reduce\(\(a, n\) => a \+ n, 0\) \+ \(w\.testInquiries \?\? 0\)/.test(sys));
  check('the wipe runs in its own transaction when the route calls it', /if \(!db\) return prisma\.\$transaction\(tx => wipeAll\(now, tx\)/.test(body)
    && /await wipeAll\(\)/.test(readFileSync('src/app/api/admin/data-reset/route.ts', 'utf8')));
  check('…and it is audited, and takes no date from the request', /auditAdmin\(session, \{ action: 'inquiries_clear'/.test(post) && !/body\??\.before/.test(post) && /clearTestInquiries\(\)/.test(post));

  // The launch wipe closes on Dec 1 (moved from Nov 1, Cam 2026-10-30).
  check('the launch wipe is open before Dec 1', wipeAllOpen(new Date('2026-10-31T23:00:00Z')));
  check('the launch wipe is closed from midnight Dec 1 Eastern, open the minute before', WIPE_ALL_UNTIL.toISOString() === '2026-12-01T05:00:00.000Z' && !wipeAllOpen(WIPE_ALL_UNTIL) && wipeAllOpen(new Date('2026-12-01T04:59:00Z')) && !wipeAllOpen(new Date('2027-01-01T00:00:00Z')));
  const t = await seedCourse('test', true);
  const r = await seedCourse('real', false);

  const late = await wipeAll(new Date(WIPE_ALL_UNTIL.getTime() + 86_400_000));
  check('a late launch wipe is refused and clears nothing', !late.ok && (await prisma.course.count({ where: { slug: { startsWith: TAG } } })) === 2);

  // A course that isn't marked as a test is refused.
  const refused = await resetTestCourse(r.course.id);
  check('a course not marked as a test cannot be reset', !refused.ok && refused.status === 400);
  check('…and nothing of it is touched', (await prisma.booking.count({ where: { courseId: r.course.id } })) === 1);

  const pre = await previewCourseReset(t.course.id);
  check('the preview counts the test course activity', !!pre && pre.activity.bookings === 1 && pre.activity.members === 1 && pre.activity.shopSales === 1 && pre.activity.events === 1 && pre.activity.eventHeldTimes === 1, pre?.activity);

  const res = await resetTestCourse(t.course.id);
  check('a test course resets', res.ok);
  const c = t.course.id;
  check('its bookings and their payment records are gone',
    (await prisma.booking.count({ where: { courseId: c } })) === 0 && (await prisma.paymentEvent.count({ where: { booking: { courseId: c } } })) === 0);
  check('its members, residents, shop sales and events are gone',
    (await prisma.courseMembership.count({ where: { courseId: c } })) === 0 && (await prisma.courseResident.count({ where: { courseId: c } })) === 0
    && (await prisma.shopSale.count({ where: { courseId: c } })) === 0 && (await prisma.courseEvent.count({ where: { courseId: c } })) === 0);
  const tt = await prisma.teeTime.findUnique({ where: { id: t.tt.id } });
  const bl = await prisma.teeTime.findUnique({ where: { id: t.blocked.id } });
  check('its booked tee time opens back up', tt?.playersBooked === 0 && tt?.status === 'available');
  check('a time it blocked stays blocked', bl?.status === 'blocked');
  const after = await prisma.course.findUniqueOrThrow({ where: { id: c }, select: { number: true } });
  const fresh = await prisma.booking.create({ data: { teeTimeId: t.tt.id, courseId: c, golferName: 'After reset', golferEmail: `${TAG}-after@test.local`, players: 1, greenFeeTotal: 0, cartFeeTotal: 0, accessFeeTotal: 0, totalAmount: 0, status: 'confirmed', paymentStatus: 'manual' }, select: { id: true, ref: true } });
  check('its booking numbers start again at 1, and it keeps its course number (BOOKING-REF)', fresh.ref === 1 && after.number != null, { ref: fresh.ref, number: after.number });
  await prisma.booking.delete({ where: { id: fresh.id } });
  const evt = await prisma.teeTime.findUnique({ where: { id: t.evTime.id } });
  check('a time its event held opens again, with no event left on it', evt?.status === 'available' && evt?.eventId === null, evt);
  check('its setup is kept: the course, its login, tiers and shop catalogue',
    !!(await prisma.course.findUnique({ where: { id: c } })) && !!(await prisma.membershipTier.findUnique({ where: { id: t.tier.id } })) && !!(await prisma.shopItem.findUnique({ where: { id: t.item.id } })));
  check('the other course is untouched',
    (await prisma.booking.count({ where: { courseId: r.course.id } })) === 1 && (await prisma.courseMembership.count({ where: { courseId: r.course.id } })) === 1 && (await prisma.shopSale.count({ where: { courseId: r.course.id } })) === 1);

  // The outreach pipeline the launch wipe keeps: a lead with a touch and a discovery call, an inquiry built into
  // the test course, and the course's own check-in call.
  // Made during outreach (from Nov 23): kept. Made before it: test data, deleted by the wipe even when built.
  const during = new Date('2026-11-24T15:00:00Z');
  const lead = await seedInquiry('lead', { status: 'lead', createdAt: during });
  await prisma.outreachTouch.create({ data: { inquiryId: lead.id, at: new Date(), channel: 'email', direction: 'out' } });
  const discovery = await prisma.call.create({ data: { kind: 'discovery', inquiryId: lead.id, scheduledAt: new Date('2030-01-01T15:00:00Z') } });
  const built = await seedInquiry('built', { status: 'live', builtCourseId: t.course.id, createdAt: during });
  const preBuilt = await seedInquiry('prebuilt', { status: 'live', builtCourseId: r.course.id, createdAt: new Date('2026-11-10T15:00:00Z') });
  await prisma.outreachTouch.create({ data: { inquiryId: preBuilt.id, at: new Date('2026-11-10T16:00:00Z'), channel: 'call', direction: 'out' } });
  const preLead = await seedInquiry('prelead', { status: 'lead', createdAt: new Date('2026-11-22T15:00:00Z') });
  // Inquiries data (#462): contacts are kept with their lead, and go with a lead made before outreach.
  await prisma.courseContact.createMany({ data: [
    { inquiryId: lead.id, name: 'Kept One', email: `${TAG}-kept1@test.local`, decisionMaker: true },
    { inquiryId: lead.id, name: 'Kept Two' },
    { inquiryId: preLead.id, name: 'Pre One', email: `${TAG}-pre1@test.local` },
  ] });
  const checkin = await prisma.call.create({ data: { kind: 'checkin', courseId: t.course.id, scheduledAt: new Date('2030-01-02T15:00:00Z') } });
  const bothCall = await prisma.call.create({ data: { kind: 'discovery', inquiryId: built.id, courseId: t.course.id, scheduledAt: new Date('2030-01-03T15:00:00Z') } });

  // The launch wipe itself, rolled back so the rest of the test run keeps its data.
  await prisma.adminGoal.create({ data: { metric: 'courses_live', target: 1, dueAt: new Date('2030-01-01T00:00:00Z'), createdBy: TAG } });
  const keptBefore = await prisma.adminGoal.count();
  const ROLLBACK = new Error('rollback');
  type Outreach = { contacts: number; preContacts: number; preLead: boolean; preBuilt: boolean; preTouches: number; lead: string | undefined; touches: number; discovery: boolean; checkin: boolean; both: string | null | undefined; built: { status: string; builtCourseId: string | null } | null; builtEvent: string | undefined; unlinked: number };
  let inside: { wipedLeft: number; keptLeft: number; ok: boolean; nextCourse: number; refSeqsLeft: number; outreach: Outreach } | null = null;
  try {
    await prisma.$transaction(async tx => {
      const w = await wipeAll(new Date('2026-10-30T00:00:00Z'), tx);
      const left = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT (${WIPED_TABLES.map(x => `(SELECT COUNT(*) FROM "${x}")`).join(' + ')})::bigint AS n`);
      const refSeqs = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM pg_class WHERE relkind = 'S' AND relname LIKE 'bookref\\_%'`);
      const keptLeft = await tx.adminGoal.count();
      const ev = await tx.inquiryStatusEvent.findFirst({ where: { inquiryId: built.id }, orderBy: { createdAt: 'desc' } });
      const outreach: Outreach = {
        contacts: await tx.courseContact.count({ where: { inquiryId: lead.id } }),
        preContacts: await tx.courseContact.count({ where: { inquiryId: preLead.id } }),
        preLead: !!(await tx.courseInquiry.findUnique({ where: { id: preLead.id } })),
        preBuilt: !!(await tx.courseInquiry.findUnique({ where: { id: preBuilt.id } })),
        preTouches: await tx.outreachTouch.count({ where: { inquiryId: preBuilt.id } }),
        lead: (await tx.courseInquiry.findUnique({ where: { id: lead.id } }))?.status,
        touches: await tx.outreachTouch.count({ where: { inquiryId: lead.id } }),
        discovery: !!(await tx.call.findUnique({ where: { id: discovery.id } })),
        checkin: !!(await tx.call.findUnique({ where: { id: checkin.id } })),
        both: (await tx.call.findUnique({ where: { id: bothCall.id } }))?.courseId,
        built: await tx.courseInquiry.findUnique({ where: { id: built.id }, select: { status: true, builtCourseId: true } }),
        builtEvent: ev ? `${ev.fromStatus}->${ev.toStatus}` : undefined,
        unlinked: w.ok ? w.inquiriesUnlinked : -1,
      };
      // The first course after the wipe (counted above, before it brings its own booking sequence).
      const op = await tx.courseOperator.create({ data: { name: 'After wipe', email: `${TAG}-afterwipe@test.local`, password: 'x' } });
      const first = await tx.course.create({ data: { name: 'After wipe', slug: `${TAG}-afterwipe`, operatorId: op.id, address: '1', city: 'T', state: 'CA', zipCode: '90210', holes: 18 }, select: { number: true } });
      const seq = [{ n: BigInt(first.number ?? -1) }];
      inside = { ok: w.ok, wipedLeft: Number(left[0].n), keptLeft, nextCourse: Number(seq[0].n), refSeqsLeft: Number(refSeqs[0].n), outreach };
      throw ROLLBACK;
    }, { timeout: 60_000 });
  } catch (e) { if (e !== ROLLBACK) throw e; }
  const got = inside as { wipedLeft: number; keptLeft: number; ok: boolean; nextCourse: number; refSeqsLeft: number; outreach: Outreach } | null;
  check('the launch wipe empties every wiped table', !!got && got.ok && got.wipedLeft === 0, got);
  check('…and keeps the company side', !!got && got.keptLeft === keptBefore, got);
  check('…and the next course is GR1 again (BOOKING-REF)', !!got && got.nextCourse === 1, got);
  check('…and every course\'s booking-number sequence went with it', !!got && got.refSeqsLeft === 0, got);
  const o = got?.outreach;
  check('…and keeps a lead, its touches and its discovery call', !!o && o.lead === 'lead' && o.touches === 1 && o.discovery, o);
  check('…and deletes an inquiry made before outreach, built or not, with its touches', !!o && !o.preBuilt && !o.preLead && o.preTouches === 0, o);
  check('…and keeps the lead\'s contacts (KEEP-OUTREACH, #462)', !!o && o.contacts === 2, o);
  check('…and a lead made before outreach takes its contacts with it', !!o && o.preContacts === 0, o);
  check('…and a course check-in call goes with its course', !!o && !o.checkin, o);
  check('…and an inquiry call that also named the course stays, with no course on it', !!o && o.both === null, o);
  check('…and an inquiry built into a wiped course stays, unlinked and archived with a status event', !!o && o.built?.status === 'archived' && o.built?.builtCourseId === null && o.builtEvent === 'live->archived' && o.unlinked >= 1, o);
  check('(rolled back here: the test courses are still there)', (await prisma.course.count({ where: { slug: { startsWith: TAG } } })) === 2);
  check('(…and the built inquiry is still linked)', (await prisma.courseInquiry.findUnique({ where: { id: built.id } }))?.builtCourseId === t.course.id);

  // Clearing the test inquiries once before outreach: dated far back so nothing else in this database is in range.
  const cutoff = new Date('2001-06-01T04:00:00Z');
  const oldTest = await seedInquiry('old', { createdAt: new Date('2001-01-01T12:00:00Z') });
  await prisma.outreachTouch.create({ data: { inquiryId: oldTest.id, at: new Date('2001-01-02T12:00:00Z'), channel: 'call', direction: 'out' } });
  const oldCall = await prisma.call.create({ data: { kind: 'discovery', inquiryId: oldTest.id, scheduledAt: new Date('2001-01-03T12:00:00Z') } });
  await prisma.courseContact.create({ data: { inquiryId: oldTest.id, name: 'Old contact' } });
  await prisma.inquiryStatusEvent.create({ data: { inquiryId: oldTest.id, fromStatus: 'pending', toStatus: 'in_review', trigger: 'admin' } });
  const oldBuilt = await seedInquiry('oldbuilt', { createdAt: new Date('2001-01-01T12:00:00Z'), status: 'live', builtCourseId: r.course.id });
  const fresh2 = await seedInquiry('new', { createdAt: new Date('2001-06-01T04:00:00Z') });
  const late2 = await clearTestInquiries(new Date(WIPE_ALL_UNTIL.getTime() + 1), cutoff);
  const tooLate = await clearTestInquiries(new Date('2026-11-20T12:00:00Z'), new Date(OUTREACH_START.getTime() + 1));
  check('the clear can never reach an inquiry made from Nov 23 on', !tooLate.ok);
  check('clearing test inquiries closes with the launch wipe', !late2.ok && !!(await prisma.courseInquiry.findUnique({ where: { id: oldTest.id } })));
  const pv = await previewClearTestInquiries(cutoff);
  check('the clear preview counts what it deletes and what it keeps', pv.inquiries === 1 && pv.calls === 1 && pv.touches === 1 && pv.contacts === 1 && pv.keptBuilt === 1, pv);
  const cl = await clearTestInquiries(new Date('2026-11-20T12:00:00Z'), cutoff);
  check('the clear deletes an inquiry added before the day', cl.ok && cl.cleared.inquiries === 1 && !(await prisma.courseInquiry.findUnique({ where: { id: oldTest.id } })), cl);
  check('…with its calls, touches, contacts and status events', !(await prisma.call.findUnique({ where: { id: oldCall.id } })) && (await prisma.courseContact.count({ where: { inquiryId: oldTest.id } })) === 0
    && (await prisma.outreachTouch.count({ where: { inquiryId: oldTest.id } })) === 0 && (await prisma.inquiryStatusEvent.count({ where: { inquiryId: oldTest.id } })) === 0);
  check('…and keeps one that became a course (the wipe takes it), and one added from the cut-off on',
    !!(await prisma.courseInquiry.findUnique({ where: { id: oldBuilt.id } })) && !!(await prisma.courseInquiry.findUnique({ where: { id: fresh2.id } })));
}

async function cleanup() {
  await prisma.courseInquiry.deleteMany({ where: { courseName: { startsWith: TAG } } });
  await prisma.call.deleteMany({ where: { course: { slug: { startsWith: TAG } } } });
  const courses = await prisma.course.findMany({ where: { slug: { startsWith: TAG } }, select: { id: true } });
  const ids = courses.map(x => x.id);
  await prisma.booking.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.teeTime.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.courseMembership.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.membershipTier.deleteMany({ where: { courseId: { in: ids } } });
  await prisma.course.deleteMany({ where: { id: { in: ids } } });
  await prisma.courseOperator.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.adminGoal.deleteMany({ where: { createdBy: TAG } });
}

cleanup().then(main).then(cleanup)
  .catch(async e => { console.error(e); failed++; await cleanup().catch(() => {}); })
  .finally(async () => { await prisma.$disconnect(); console.log(failed ? `\n${failed} FAILED` : '\nALL PASS'); process.exit(failed ? 1 : 0); });
