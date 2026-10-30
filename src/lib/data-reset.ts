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
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

type Db = Prisma.TransactionClient | typeof prisma;

/** The launch wipe refuses from this moment: midnight Nov 1, 2026, Eastern. */
export const WIPE_ALL_UNTIL = new Date('2026-11-01T04:00:00Z');
/** Typed exactly to confirm the launch wipe. */
export const WIPE_CONFIRM_WORDS = 'WIPE TEST DATA';

/** The company side — kept by the launch wipe. */
export const KEPT_TABLES = [
  'AdminUser', 'OwnerPasskey', 'OwnerSession', 'OwnerDevice',
  'AdminGoal', 'Expense', 'AgreementVersion', 'AdminAuditLog', 'CronRunLog',
] as const;

/** Everything courses, golfers and the pipeline made — cleared by the launch wipe. */
export const WIPED_TABLES = [
  // courses and their setup
  'CourseOperator', 'Course', 'CourseGroup', 'CoursePhoto', 'TeeSet', 'Nine', 'CourseProduct', 'TeeSetNine',
  'CourseProductTeeSet', 'CourseStaff', 'StaffPermissionChange', 'MembershipTier', 'TeeTimeSchedule', 'Blackout',
  'AgreementAcceptance', 'ShopItem',
  // golfers and activity
  'GolferAccount', 'CourseResident', 'CourseMembership', 'TeeTime', 'Booking', 'TeeTimeAlert', 'PaymentEvent',
  'BookingEvent', 'BookingShopItem', 'SentMessage', 'ShopSale', 'ShopSaleLine', 'ShopSaleRefund', 'RegisterClose', 'MoneyMove', 'MonthlyReview',
  'GolferNote', 'GolferBlock',
  'CourseEvent', 'CourseEventTask', 'CourseEventPlayer', 'CourseEventPayment', 'CourseEventRefund',
  // the pipeline
  'CourseInquiry', 'Call', 'InquiryStatusEvent', 'ChangeRequest',
  // messages, announcements, problems
  'MessageThread', 'Message', 'CourseMessage', 'Announcement', 'AnnouncementDismissal', 'AdminAlert', 'AdminAlertEvent',
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
export async function previewWipeAll(): Promise<{ wiped: TableCounts; kept: TableCounts }> {
  const [wiped, kept] = await Promise.all([countTables(WIPED_TABLES), countTables(KEPT_TABLES)]);
  return { wiped, kept };
}

/**
 * The launch wipe. One TRUNCATE over every wiped table, so the rows go
 * together or not at all. RESTRICT: if a kept table ever points at a wiped
 * one, Postgres refuses the whole statement instead of reaching into it.
 */
export async function wipeAll(now = new Date(), db: Db = prisma): Promise<{ ok: true; cleared: TableCounts } | { ok: false; error: string }> {
  if (!wipeAllOpen(now)) return { ok: false, error: 'The launch wipe closed on Nov 1 — real courses are on the site now. Reset a single test course instead.' };
  const cleared = await countTables(WIPED_TABLES, db);
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${WIPED_TABLES.map(t => `"${t}"`).join(', ')} RESTRICT`);
  return { ok: true, cleared };
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
    prisma.teeTime.updateMany({ where: { courseId, eventId: { not: null }, status: 'blocked', date: { notIn: closedDays } }, data: { status: 'available', eventId: null } }),
    // Booking children (PaymentEvent, BookingShopItem) go with their booking (cascade).
    prisma.bookingEvent.deleteMany({ where: { courseId } }),
    prisma.sentMessage.deleteMany({ where: { courseId } }),
    prisma.teeTimeAlert.deleteMany({ where: { courseId } }),
    prisma.booking.deleteMany({ where: { courseId } }),
    prisma.courseMembership.deleteMany({ where: { courseId } }),
    prisma.courseResident.deleteMany({ where: { courseId } }),
    prisma.shopSale.deleteMany({ where: { courseId } }),
    prisma.registerClose.deleteMany({ where: { courseId } }),
    prisma.moneyMove.deleteMany({ where: { courseId } }),
    // An event's tasks, players, payments and refunds cascade; its held times were opened above.
    prisma.courseEvent.deleteMany({ where: { courseId } }),
    prisma.monthlyReview.deleteMany({ where: { courseId } }),
    prisma.messageThread.deleteMany({ where: { courseId } }),
    prisma.courseMessage.deleteMany({ where: { courseId } }),
    prisma.adminAlert.deleteMany({ where: { courseId } }),
    // The golfer record's notes and online-booking blocks are activity too.
    prisma.golferNote.deleteMany({ where: { courseId } }),
    prisma.golferBlock.deleteMany({ where: { courseId } }),
    // Every booked tee time opens back up; a time the course blocked by hand stays blocked.
    prisma.teeTime.updateMany({ where: { courseId, status: { not: 'blocked' } }, data: { playersBooked: 0, status: 'available' } }),
  ]);
  return { ok: true, cleared };
}
