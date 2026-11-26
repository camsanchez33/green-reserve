// Audit 2026-11-24 M4: the change-password forms compared the current password with no limit, so a
// stolen session cookie could guess it forever (and on the course side, a hit minted a fresh cookie
// with no second factor). Every try is now counted per account BEFORE the compare, in one atomic
// upsert (rate-limit.ts), so a burst can't slip past it. Right or wrong, five tries per 15 minutes.
import { rateLimit } from './rate-limit';

export const CHANGE_PASSWORD_TRIES = 5;
export const CHANGE_PASSWORD_WINDOW_S = 15 * 60;
export const CHANGE_PASSWORD_LIMITED = 'Too many tries at your current password. Wait 15 minutes, then try again.';

export function changePasswordTryAllowed(kind: 'operator' | 'admin', accountId: string): Promise<boolean> {
  return rateLimit(`change-pw:${kind}:${accountId}`, CHANGE_PASSWORD_TRIES, CHANGE_PASSWORD_WINDOW_S);
}
