// RES-1 (Cam 2026-10-19): resident rates. A resident shows the pro shop their
// resident card once; staff add them in Members → Residents. From then on:
//   - a golfer signed in with that email books ONE player (themselves) at the
//     tee time's resident rate; the rest of the group pays the booked rate;
//   - staff can set how many of any unpaid group are residents at the counter.
// Pure rules only (no session, no database) — the signed-in golfer's card is
// looked up by golferResident() in member-session.ts.
// The resident rate is TeeTime.residentRateCents (from the schedule, weekday or
// weekend already resolved). A tee time without one has no resident price.
// A member-rate booking stays a member booking — residents never stack on it.

export const MAX_RESIDENT_NAME = 80;
export const MAX_CARD_NUMBER = 40;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** A card is good through its expiry date (inclusive); '' never expires. */
export function cardValidOn(expiresOn: string, dateYmd: string): boolean {
  return !expiresOn || expiresOn >= dateYmd;
}

/**
 * The green fee for a group where `residents` of `players` pay `residentRateCents`
 * and the rest pay `otherPerPlayerCents`. Residents are capped at the group size,
 * and never applied when the tee time has no resident rate.
 */
export function groupGreenFee(players: number, otherPerPlayerCents: number, residents: number, residentRateCents: number | null) {
  const r = residentRateCents == null ? 0 : Math.max(0, Math.min(players, Math.floor(residents)));
  return {
    residentPlayers: r,
    residentRateCents: r > 0 ? residentRateCents : null,
    greenFeeTotal: r * (residentRateCents ?? 0) + (players - r) * otherPerPlayerCents,
  };
}

/**
 * What a booking's non-resident players pay each, recovered from its stored
 * totals: (greenFeeTotal − residents × residentRate) / non-residents. Null when
 * every player is a resident (nothing to recover from).
 */
export function otherPerPlayerCents(b: { players: number; greenFeeTotal: number; residentPlayers: number; residentRateCents: number | null }): number | null {
  const others = b.players - b.residentPlayers;
  if (others <= 0) return null;
  return Math.round((b.greenFeeTotal - b.residentPlayers * (b.residentRateCents ?? 0)) / others);
}

/** Validate a resident row from the Members page. */
export function residentInput(body: Record<string, unknown>):
  { ok: true; value: { name: string; email: string | null; cardNumber: string; expiresOn: string; notes: string } } | { ok: false; error: string } {
  const name = String(body.name ?? '').trim().slice(0, MAX_RESIDENT_NAME);
  if (!name) return { ok: false, error: 'Add the resident’s name.' };
  const rawEmail = String(body.email ?? '').trim().toLowerCase();
  if (rawEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) return { ok: false, error: 'That email address doesn’t look right.' };
  const expiresOn = String(body.expiresOn ?? '').trim();
  if (expiresOn && !YMD.test(expiresOn)) return { ok: false, error: 'Pick the card’s expiry date, or leave it blank.' };
  return {
    ok: true,
    value: {
      name, email: rawEmail ? rawEmail.slice(0, 200) : null,
      cardNumber: String(body.cardNumber ?? '').trim().slice(0, MAX_CARD_NUMBER),
      expiresOn,
      notes: String(body.notes ?? '').trim().slice(0, 300),
    },
  };
}
