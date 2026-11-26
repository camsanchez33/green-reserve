// Audit 2026-11-24 M9: reset, setup and set-password links were stored as the token itself, so anyone
// who could read the database (a leaked backup, a logged row) could open the 7-day setup link and take
// the account. Now only a SHA-256 of the token is stored and links are looked up by that hash. The token
// is 32 random bytes (or a signed JWT), so a plain SHA-256 is enough: there is nothing to guess.
// No schema change: the same columns hold the hash. Links sent before this shipped stop working (a new
// one is a click away).
import { createHash, timingSafeEqual } from 'crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Does `token` hash to `storedHash`? Constant time; false for a missing value. */
export function tokenMatches(token: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !token) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && b.length === 32 && timingSafeEqual(a, b);
}
