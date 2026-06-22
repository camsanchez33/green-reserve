// Shared password strength rule — used on registration, reset, and in-dashboard
// change-password, both server-side (enforcement) and client-side (live hint).
// No special-character requirement: that tends to push people toward
// "Password1!" rather than something actually stronger, for little real benefit.
export function validatePasswordStrength(password: string): string {
  if (!password || password.length < 10) return 'Password must be at least 10 characters.';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter.';
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must include a number.';
  return '';
}

export const PASSWORD_REQUIREMENTS_HINT = 'At least 10 characters, with an uppercase letter, a lowercase letter, and a number.';
