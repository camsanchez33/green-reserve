// ONCOURSE-1 (Cam 2026-11-06: "definitely should have rounds on the course now"): who is out playing right
// now — groups checked in whose round hasn't had time to finish. A round is counted from its tee time for
// ROUND_MINUTES (about 4½ hours for 18 holes, 2¼ for 9). Only today has anyone on the course. Pure.
export const ROUND_MINUTES = { 18: 270, 9: 135 } as const;

type Slot = { date: string; time: string; holes?: number; bookings?: { status: string; players: number; checkedInPlayers?: number | null }[] };

const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Groups and players on the course at the course clock `nowHM` on `today`; zero on any other day. */
export function onCourse(slots: Slot[], today: string, nowHM: string): { groups: number; players: number } {
  let groups = 0, players = 0;
  const now = mins(nowHM);
  for (const s of slots) {
    if (s.date !== today) continue;
    const start = mins(s.time), length = s.holes === 9 ? ROUND_MINUTES[9] : ROUND_MINUTES[18];
    if (start > now || start + length <= now) continue;
    for (const b of s.bookings ?? []) {
      if (b.status !== 'completed') continue;
      groups++; players += b.checkedInPlayers ?? b.players;
    }
  }
  return { groups, players };
}
