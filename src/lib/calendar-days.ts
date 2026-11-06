// CAL-2 (Cam 2026-11-06: "no tee times … should say something like not bookable to players yet, or if it is
// actually closed, why"): what a day on the tee sheet's Calendar says when golfers can't book it. Client-safe, pure.
export type CalendarInfo = {
  /** The course's today (YYYY-MM-DD). */
  today: string;
  /** How many days ahead the public can book (Course.publicAdvanceDays). */
  publicDays: number;
  /** Weekdays (0 = Sunday) an active schedule runs on. */
  openWeekdays: number[];
  /** Days that have tee times, every one of them blocked. */
  blockedDates: string[];
};

const addDays = (date: string, n: number) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const short = (date: string) => new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The first day golfers can book `date` online, or null when they already can (or it has gone). */
export function bookableFrom(date: string, info: CalendarInfo): string | null {
  if (date < info.today) return null;
  const opens = addDays(date, -info.publicDays);
  return opens > info.today ? opens : null;
}

/** "Not bookable till Nov 16" for a day with times golfers can't book yet; '' when they can. */
export function notYetWords(date: string, info: CalendarInfo): string {
  const from = bookableFrom(date, info);
  return from ? `Not bookable till ${short(from)}` : '';
}

/** Why a day has no open tee times. */
export function emptyDayWords(date: string, info: CalendarInfo): string {
  if (info.blockedDates.includes(date)) return 'All times blocked';
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  if (!info.openWeekdays.includes(weekday)) return 'Closed · no schedule';
  return notYetWords(date, info) || 'No tee times';
}
