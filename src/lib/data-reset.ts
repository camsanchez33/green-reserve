// TEST-1 (Cam 2026-10-22: "every course and everything right now [is test] — we
// need a way to make everything like new again so these problems stop here").
// Two owner-only tools:
//
//  1. The launch wipe — every table except the company side, in one statement.
//     Before launch only (WIPE_ALL_UNTIL); after that it refuses, for good.
//  2. Resetting one test course — its activity cleared, its setup kept, so it
//     can be tested again. Only a course marked isTest can be reset.
//
// Every table in prisma/schema.prisma is named in exactly one of WIPED_TABLES
// and KEPT_TABLES; scripts/data-reset-db-test.ts fails when a new model is in
// neither, so a table added later is never silently left behind or wiped.
// Stripe is not touched: money already charged stays in Stripe.
//
// KEEP-OUTREACH (Cam 2026-11-18, "Keep outreach data"): the outreach pipeline (inquiries and
// everything hung off them) survives the launch wipe, so a target list entered from Nov 23 is still
// there on Dec 1. An inquiry whose course is wiped is unlinked and archived, the way deletePair()
// does for one course. The test inquiries made before then go with clearTestInquiries().
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { PIPELINE_STATUSES } from './lifecycle';

type Db = Prisma.TransactionClient | typeof prisma;

/** The launch wipe refuses from this moment: midnight Dec 1, 2026, Eastern (EST, UTC−5).
 *  Cam 2026-10-30 moved it from Nov 1: "push the deadline back" — Dec 1. */
export const WIPE_ALL_UNTIL = new Date('2026-12-01T05:00:00Z');
/** KEEP-OUTREACH: outreach prep starts Nov 23, 2026 (midnight Eastern). An inquiry made before it is test data. */
export const OUTREACH_START = new Date('2026-11-23T05:00:00Z');
/** Typed exactly to confirm the launch wipe. */
export const WIPE_CONFIRM_WORDS = 'WIPE TEST DATA';

/** The company side — kept by the launch wipe. */
export const KEPT_TABLES = [
  'AdminUser', 'OwnerPasskey', 'OwnerSession', 'OwnerDevice',
  'AdminGoal', 'AdminMonthGoal', 'Expense', 'ExpenseBudget', 'AgreementVersion', 'AdminAuditLog', 'CronRunLog',
  'CompanyDocLabel', 'CompanyDocument', 'CompanyDocumentVersion',
  // KEEP-OUTREACH: the outreach pipeline. Every table that points at CourseInquiry belongs here
  // (scripts/data-reset-db-test.ts checks it). A course check-in call goes with its course (wipeAll).
  'CourseInquiry', 'Call', 'InquiryStatusEvent', 'OutreachTouch', 'ChangeRequest',
] as const;

/** Everything courses, golfers and the pipeline made — cleared by the launch wipe. */
export const WIPED_TABLES = [
  // courses and their setup
  'CourseOperator', 'Course', 'CourseNumberCounter', 'CourseGroup', 'CoursePhoto', 'TeeSet', 'Nine', 'CourseProduct', 'TeeSetNine',
  'CourseProductTeeSet', 'CourseStaff', 'StaffPermissionChange', 'CourseRole', 'TeamChange', 'MembershipTier', 'TeeTimeSchedule', 'Blackout',
  'AgreementAcceptance', 'ShopItem',
  // golfers and activity
  'GolferAccount', 'CourseResident', 'CourseMembership', 'TeeTime', 'Booking', 'TeeTimeAlert', 'PaymentEvent',
  'BookingEvent', 'BookingShopItem', 'SentMessage', 'SmsConsent', 'ShopSale', 'ShopSaleCounter', 'ShopSaleLine', 'ShopSaleRefund', 'RegisterClose', 'RegisterOpen', 'MoneyMove', 'ShopStockReceipt', 'PromoCode', 'RoundPack', 'DemandPrice', 'MemberCharge', 'MemberStatement', 'MonthlyReview',
  'GolferNote', 'GolferBlock', 'ShiftNote', 'CourseMonthGoal', 'CourseGoal',
  'CourseEvent', 'CourseEventTask', 'CourseEventPlayer', 'CourseEventPayment', 'CourseEventRefund', 'CourseEventListItem',
  // messages, announcements, problems
  'MessageThread', 'Message', 'SupportChat', 'CourseMessage', 'Announcement', 'AnnouncementDismissal', 'AdminAlert', 'AdminAlertEvent',
  // sign-in throttles
  'RateLimit',
  // SEC-3: sign-ins before launch are test traffic.
  'SecurityEvent',
] as const;

export type TableCounts = Record<string, number>;

async function countTables(tables: readonly string[], db: Db = prisma): Promise<TableCounts> {
  const out: TableCounts = {};
  for (const t of tables) {
    // Table names come only from the constant lists above, never from a request.
    const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM "${t}"`);
    out[t] = Number(rows[0]?.n ?? 0);
  }
  return out;
}

export function wipeAllOpen(now = new Date()): boolean {
  return now.getTime() < WIPE_ALL_UNTIL.getTime();
}

/** What the launch wipe would clear, table by table. Reads only. */
export async function previewWipeAll(): Promise<{ wiped: TableCounts; kept: TableCounts; testInquiries: number; inquiriesUnlinked: number; courseCalls: number }> {
  const [wiped, kept, testInquiries, inquiriesUnlinked, courseCalls] = await Promise.all([
    countTables(WIPED_TABLES), countTables(KEPT_TABLES),
    prisma.courseInquiry.count({ where: { createdAt: { lt: OUTREACH_START } } }),
    prisma.courseInquiry.count({ where: { createdAt: { gte: OUTREACH_START }, builtCourseId: { not: null } } }),
    prisma.call.count({ where: { courseId: { not: null } } }),
  ]);
  return { wiped, kept, testInquiries, inquiriesUnlinked, courseCalls };
}

export type WipeResult = { ok: true; cleared: TableCounts; inquiriesUnlinked: number; courseCalls: number } | { ok: false; error: string };

/**
 * The launch wipe. One TRUNCATE over every wiped table, so the rows go
 * together or not at all. RESTRICT: if a kept table ever points at a wiped
 * one, Postgres refuses the whole statement instead of reaching into it.
 *
 * KEEP-OUTREACH: the outreach pipeline is kept. First, in the same transaction:
 *  - Call and CourseInquiry are locked, so no call booked or course built while
 *    the wipe runs can slip between the copy below and the TRUNCATE.
 *  - Every inquiry made before OUTREACH_START is test data and is deleted, with
 *    its calls, touches, events and contacts (cascade) — built or not, since its
 *    course is wiped too. The launch wipe is the one exception to the deletion
 *    doctrine (TEST-1).
 *  - CourseInquiry.builtCourseId (a plain column, no foreign key) would point at
 *    a course that is gone. Each linked inquiry made from OUTREACH_START on is
 *    unlinked, and archived with a status event when it was on its way to a
 *    course (the statuses archivePair() archives).
 *  - Call.courseId is a foreign key to Course, so Postgres will not TRUNCATE
 *    Course while Call is kept. A course check-in call is course activity and
 *    goes; inquiry calls are copied aside, Call is truncated with the rest, and
 *    they are put back with no course on them.
 * Runs in its own transaction unless the caller passes one.
 */
export async function wipeAll(now = new Date(), db?: Prisma.TransactionClient): Promise<WipeResult> {
  if (!wipeAllOpen(now)) return { ok: false, error: 'The launch wipe closed on Dec 1 — real courses are on the site now. Reset a single test course instead.' };
  if (!db) return prisma.$transaction(tx => wipeAll(now, tx), { timeout: 120_000, maxWait: 10_000 });
  // First statement: nothing writes a call or an inquiry until the wipe commits or rolls back.
  await db.$executeRawUnsafe(`LOCK TABLE "Call", "CourseInquiry" IN ACCESS EXCLUSIVE MODE`);
  const cleared = await countTables(WIPED_TABLES, db);
  cleared['CourseInquiry (made before outreach)'] = (await db.courseInquiry.deleteMany({ where: { createdAt: { lt: OUTREACH_START } } })).count;
  const linked = await db.courseInquiry.findMany({ where: { builtCourseId: { not: null } }, select: { id: true, status: true } });
  const toArchive = linked.filter(i => PIPELINE_STATUSES.includes(i.status));
  if (toArchive.length) {
    await db.inquiryStatusEvent.createMany({ data: toArchive.map(i => ({
      inquiryId: i.id, fromStatus: i.status, toStatus: 'archived', trigger: 'system', actorName: 'Course removed by the launch wipe',
    })) });
    await db.courseInquiry.updateMany({ where: { id: { in: toArchive.map(i => i.id) } }, data: { status: 'archived' } });
  }
  await db.courseInquiry.updateMany({ where: { builtCourseId: { not: null } }, data: { builtCourseId: null } });
  const courseCalls = await db.call.count({ where: { courseId: { not: null } } });
  cleared['Call (course check-ins)'] = await db.call.count({ where: { courseId: { not: null }, inquiryId: null } });
  // A temp table lives only in this transaction; nothing else can see it.
  await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "_wipe_kept_call"`);
  await db.$executeRawUnsafe(`CREATE TEMP TABLE "_wipe_kept_call" ON COMMIT DROP AS SELECT * FROM "Call" WHERE "inquiryId" IS NOT NULL`);
  await db.$executeRawUnsafe(`UPDATE "_wipe_kept_call" SET "courseId" = NULL`);
  // BOOKING-REF (Cam 2026-11-12): the course-number counter is wiped with the courses, so the next
  // course is GR1 again.
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${[...WIPED_TABLES, 'Call'].map(t => `"${t}"`).join(', ')} RESTRICT`);
  await db.$executeRawUnsafe(`INSERT INTO "Call" SELECT * FROM "_wipe_kept_call"`);
  await db.$executeRawUnsafe(`DROP TABLE "_wipe_kept_call"`);
  // Each course's booking-number sequence ("bookref_<id>") goes with its course. TRUNCATE fires no
  // delete trigger, so drop them here, in the same transaction.
  await db.$executeRawUnsafe(`DO $$ DECLARE r RECORD; BEGIN
    FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relkind = 'S' AND n.nspname = current_schema() AND c.relname LIKE 'bookref\\_%' LOOP
      EXECUTE 'DROP SEQUENCE ' || quote_ident(r.relname);
    END LOOP; END $$`);
  return { ok: true, cleared, inquiriesUnlinked: linked.length, courseCalls };
}

/** Typed exactly to confirm clearing the test inquiries. */
export const CLEAR_INQUIRIES_CONFIRM_WORDS = 'CLEAR TEST INQUIRIES';

/** Inquiries the outreach clear would delete: made before `before` and never built into a course. */
function clearableInquiries(before: Date): Prisma.CourseInquiryWhereInput {
  return { createdAt: { lt: before }, builtCourseId: null };
}

export async function previewClearTestInquiries(before: Date = OUTREACH_START) {
  const where = clearableInquiries(before);
  const [inquiries, calls, touches, keptBuilt, keptAfter] = await Promise.all([
    prisma.courseInquiry.count({ where }),
    prisma.call.count({ where: { inquiry: where } }),
    prisma.outreachTouch.count({ where: { inquiry: where } }),
    prisma.courseInquiry.count({ where: { createdAt: { lt: before }, builtCourseId: { not: null } } }),
    prisma.courseInquiry.count({ where: { createdAt: { gte: before } } }),
  ]);
  return { inquiries, calls, touches, keptBuilt, keptAfter };
}

/**
 * KEEP-OUTREACH: the one-time clear of the test inquiries, so the board is clean when outreach prep
 * starts. Deletes every inquiry created before OUTREACH_START that never became a course; its calls,
 * touches, status events, change requests and contacts go with it (foreign-key cascade). An inquiry
 * that became a course stays linked to its test course until the launch wipe deletes both. It can
 * never reach an inquiry made from OUTREACH_START on (`before` is capped there; tests pass an
 * earlier one). Closes with the launch wipe.
 */
export async function clearTestInquiries(now = new Date(), before: Date = OUTREACH_START): Promise<{ ok: true; cleared: Awaited<ReturnType<typeof previewClearTestInquiries>> } | { ok: false; error: string }> {
  if (!wipeAllOpen(now)) return { ok: false, error: 'Clearing test inquiries closed on Dec 1 — every inquiry now is a real lead.' };
  if (before.getTime() > OUTREACH_START.getTime()) return { ok: false, error: 'Only inquiries made before outreach starts (Nov 23) can be cleared.' };
  const cleared = await previewClearTestInquiries(before);
  const r = await prisma.courseInquiry.deleteMany({ where: clearableInquiries(before) });
  return { ok: true, cleared: { ...cleared, inquiries: r.count } };
}

/** A test course's activity, by kind — what a reset clears. Setup is kept. */
async function courseActivity(courseId: string) {
  const [bookings, members, residents, shopSales, events, reviews, threads, courseMessages, alerts, sent, bookingEvents, teeTimeAlerts, heldTeeTimes, eventHeldTimes] = await Promise.all([
    prisma.booking.count({ where: { courseId } }),
    prisma.courseMembership.count({ where: { courseId } }),
    prisma.courseResident.count({ where: { courseId } }),
    prisma.shopSale.count({ where: { courseId } }),
    prisma.courseEvent.count({ where: { courseId } }),
    prisma.monthlyReview.count({ where: { courseId } }),
    prisma.messageThread.count({ where: { courseId } }),
    prisma.courseMessage.count({ where: { courseId } }),
    prisma.adminAlert.count({ where: { courseId } }),
    prisma.sentMessage.count({ where: { courseId } }),
    prisma.bookingEvent.count({ where: { courseId } }),
    prisma.teeTimeAlert.count({ where: { courseId } }),
    prisma.teeTime.count({ where: { courseId, status: { not: 'blocked' }, playersBooked: { gt: 0 } } }),
    prisma.teeTime.count({ where: { courseId, eventId: { not: null } } }),
  ]);
  return { bookings, members, residents, shopSales, events, reviews, threads, courseMessages, alerts, sent, bookingEvents, teeTimeAlerts, heldTeeTimes, eventHeldTimes };
}

export type CourseResetPreview = { courseId: string; name: string; isTest: boolean; activity: Awaited<ReturnType<typeof courseActivity>> };

export async function previewCourseReset(courseId: string): Promise<CourseResetPreview | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, name: true, isTest: true } });
  if (!course) return null;
  return { courseId: course.id, name: course.name, isTest: course.isTest, activity: await courseActivity(course.id) };
}

/**
 * Clears a TEST course's activity — bookings and their payment records, golfer
 * texts and emails sent, members and residents, shop sales, events, monthly
 * reviews, conversations and problems — and opens every booked tee time back
 * up. The course, its logins, schedule, prices, tee sets, shop catalogue,
 * staff, photos and signed agreement are kept. Golfer accounts are shared
 * between courses and are not touched.
 */
export async function resetTestCourse(courseId: string): Promise<{ ok: true; cleared: CourseResetPreview['activity'] } | { ok: false; status: number; error: string }> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, isTest: true } });
  if (!course) return { ok: false, status: 404, error: 'That course no longer exists — refresh the page.' };
  if (!course.isTest) return { ok: false, status: 400, error: 'Only a course marked as a test course can be reset. Mark it as a test course first.' };
  const cleared = await courseActivity(courseId);
  // As releaseHold() does: a time an event held opens again, unless the course closed that day.
  const closedDays = (await prisma.blackout.findMany({ where: { courseId }, select: { date: true } })).map(b => b.date);
  await prisma.$transaction([
    // BOOKING-REF: like new — its next booking is GR<n>-1 again (the course keeps its number). First,
    // so nothing booked during the reset is numbered from the old count. setval is not undone by a
    // rollback; a failed reset leaves the next number at 1 while old bookings remain — reset again.
    prisma.$queryRaw`SELECT setval("bookref_seq"(${courseId}), 1, false)`,
    prisma.teeTime.updateMany({ where: { courseId, eventId: { not: null }, status: 'blocked', date: { notIn: closedDays } }, data: { status: 'available', eventId: null } }),
    // Booking children (PaymentEvent, BookingShopItem) go with their booking (cascade).
    prisma.bookingEvent.deleteMany({ where: { courseId } }),
    prisma.sentMessage.deleteMany({ where: { courseId } }),
    prisma.teeTimeAlert.deleteMany({ where: { courseId } }),
    prisma.booking.deleteMany({ where: { courseId } }),
    prisma.courseMembership.deleteMany({ where: { courseId } }),
    // Memberships item 2: member numbers like new too (the members are gone, so nothing can clash).
    prisma.membershipTier.updateMany({ where: { courseId }, data: { numberLast: 0 } }),
    prisma.courseResident.deleteMany({ where: { courseId } }),
    prisma.shopSale.deleteMany({ where: { courseId } }),
    // PRO-SHOP sale numbers: like new — its next sale is #1 again. In the transaction, so a failed reset keeps the count.
    prisma.shopSaleCounter.deleteMany({ where: { courseId } }),
    prisma.registerClose.deleteMany({ where: { courseId } }),
    prisma.registerOpen.deleteMany({ where: { courseId } }),
    prisma.moneyMove.deleteMany({ where: { courseId } }),
    prisma.shopStockReceipt.deleteMany({ where: { courseId } }),
    // Promo codes are setup and stay; their use counts were activity.
    prisma.promoCode.updateMany({ where: { courseId }, data: { usesCount: 0 } }),
    // An event's tasks, players, payments and refunds cascade; its held times were opened above.
    prisma.courseEvent.deleteMany({ where: { courseId } }),
    prisma.monthlyReview.deleteMany({ where: { courseId } }),
    prisma.messageThread.deleteMany({ where: { courseId } }),
    prisma.courseMessage.deleteMany({ where: { courseId } }),
    prisma.adminAlert.deleteMany({ where: { courseId } }),
    // The golfer record's notes and online-booking blocks are activity too.
    prisma.golferNote.deleteMany({ where: { courseId } }),
    prisma.golferBlock.deleteMany({ where: { courseId } }),
    // Shift notes are the day's activity; month goals are setup and stay.
    prisma.shiftNote.deleteMany({ where: { courseId } }),
    // Every booked tee time opens back up; a time the course blocked by hand stays blocked.
    prisma.teeTime.updateMany({ where: { courseId, status: { not: 'blocked' } }, data: { playersBooked: 0, status: 'available' } }),
  ]);
  return { ok: true, cleared };
}
