// Email and phone helpers shared by bookings, the register, events, Team and texting consent. The golfer
// sign-in code (GOLFER_SPEC G5) that this file was written for is retired (Cam 2026-11-18): sign-in is per course.

export type OtpIdentifierType = 'email' | 'phone';

// % and \ are refused (lib/like-exact: LIKE wildcards no deliverable address needs); _ is legal and stays allowed.
export const EMAIL_RE = /^[^\s@%\\]+@[^\s@%\\]+\.[^\s@%\\]+$/;

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return '+' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+1' + digits; // assume US/CA for a bare 10-digit number
}

/** Returns null if the input is neither a plausible email nor phone number. */
export function classifyIdentifier(raw: string): { identifier: string; type: OtpIdentifierType } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (EMAIL_RE.test(trimmed)) return { identifier: trimmed.toLowerCase(), type: 'email' };
  // An address refused above is refused, never read as a phone number from its digits.
  if (trimmed.includes('@')) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 15) return { identifier: normalizePhone(trimmed), type: 'phone' };
  return null;
}
