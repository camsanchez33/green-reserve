// Prisma on Postgres runs `equals` and `contains` with `mode: 'insensitive'` (and plain `contains`, `startsWith`,
// `endsWith`) as LIKE / ILIKE with the value passed through unescaped, so % and _ in it act as wildcards: a guest
// booked as "%@gmail.com" matched every Gmail member at check-in (Admin lane, 2026-11-17). Every such filter on a
// value a person typed goes through here. Backslash is Postgres's default LIKE escape character.
// (`in` with mode 'insensitive' runs as LOWER(col) IN (LOWER($1)) and is already exact.)

/** The value with \ % _ escaped, for any Prisma string filter that becomes a LIKE / ILIKE. */
export function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, c => `\\${c}`);
}

/** Case-insensitive exact match: the whole value, letter for letter, ignoring case. */
export function ciEquals(value: string): { equals: string; mode: 'insensitive' } {
  return { equals: likeExact(value), mode: 'insensitive' };
}

/** Case-insensitive substring match, the typed text taken literally. */
export function ciContains(value: string): { contains: string; mode: 'insensitive' } {
  return { contains: likeExact(value), mode: 'insensitive' };
}

/** % and \ never appear in a real address we can deliver to; refused where a golfer types an email (sign-in, booking).
 *  _ is legal and common (john_smith@…), so it is allowed: the escaping above is what keeps it exact. */
export const LIKE_UNSAFE_EMAIL = /[%\\]/;
