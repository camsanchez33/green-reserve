// Cam 2026-10-27: "you shouldn't be able to add a new player after like 20 minutes
// after the check in time … after like 20 minutes the tee time should be sent down".
// Client-safe (no imports): claimTeeTime() refuses a new booking past this, and the
// tee sheet moves today's times this far gone into "Past tee times".
export const LATE_ADD_MINUTES = 20;
export const LATE_ADD_MESSAGE = `That tee time went off more than ${LATE_ADD_MINUTES} minutes ago — book a later time.`;

/** "HH:MM" (or "HH:MM:SS") tee time is more than LATE_ADD_MINUTES before the course clock "HH:MM". */
export function lateForAdding(time: string, clock: string): boolean {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(time) + LATE_ADD_MINUTES < m(clock);
}
