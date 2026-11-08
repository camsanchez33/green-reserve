// ACC-1 (Cam 2026-11-08, "make sure these completely link throughout the site so any booking or payment correlates"):
// ONE rule for "players booked of spots" — the tee sheet's day strip, Home, Home's week ahead, the Calendar view and
// Analytics' fill all use it, so the same day reads the same everywhere.
//   players  everyone booked on the time who hasn't cancelled (a split-off part counts its own players)
//   spots    the seats the time offers (playersAvailable — closed seats already left out, SEATS-1); a BLOCKED time
//            offers none, but a group already on it still holds its seats, so it counts as exactly its players.
//            A time is never more than full: spots is at least the players on it.
// Pure and client-safe.

export type FillTime = { status: string; playersAvailable: number };

/** Live (not cancelled) players on a time, from its bookings. */
export function livePlayers(bookings: { status: string; players: number }[] | undefined | null): number {
  return (bookings ?? []).reduce((n, b) => n + (b.status === 'cancelled' ? 0 : b.players), 0);
}

/** The spots a time counts for, given the players on it. */
export function timeSpots(t: FillTime, players: number): number {
  return t.status === 'blocked' ? players : Math.max(t.playersAvailable, players);
}

/** Players and spots over a set of times. */
export function fillOf(times: (FillTime & { players: number })[]): { players: number; spots: number; pct: number | null } {
  let players = 0, spots = 0;
  for (const t of times) { players += t.players; spots += timeSpots(t, t.players); }
  return { players, spots, pct: spots ? Math.round((players / spots) * 100) : null };
}
