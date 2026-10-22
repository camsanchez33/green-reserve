// TEST-2 (Cam 2026-10-22: the test course is "just for test related things" —
// it must not "interfere with the actual live data and problems"). A course
// marked isTest (TEST-1) stays out of every platform-wide number, check and
// public list. ONE definition, spread next to the query's own filters:
//   prisma.course.count({ where: { active: true, ...REAL_COURSE } })
//   prisma.booking.count({ where: { ...LIVE, ...ON_REAL_COURSE } })
// A single course's own pages (its dashboard, its admin page) never use these:
// there the test course behaves like any other, so it can be tested.
// Kept platform-wide on purpose, because they answer to Stripe and Stripe has
// every charge: disputes, the month-by-month Stripe match, the transactions
// export and each course's payouts.
// scripts/real-courses-test.ts checks every platform query below uses them.

/** For a Course query. */
export const REAL_COURSE = { isTest: false } as const;

/** For any model with a `course` relation (Booking, TeeTime, …). */
export const ON_REAL_COURSE = { course: { isTest: false } } as const;

/** For a PaymentEvent (or anything reached through its booking). */
export const ON_REAL_BOOKING = { booking: { course: { isTest: false } } } as const;
