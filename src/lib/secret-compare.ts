import { createHash, timingSafeEqual } from 'crypto';

/**
 * Whether a presented secret (a header, a key) equals the expected one, in constant time
 * (security audit 2026-11-24 L10). Both sides are hashed first, so the compare takes the same
 * time whatever the lengths. An empty or missing expected secret never matches: an unset env
 * var is a closed door, never an open one.
 */
export function secretEquals(presented: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || typeof presented !== 'string') return false;
  const a = createHash('sha256').update(presented, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
