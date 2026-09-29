// The prefilled Cal.com booking link — no server-only imports, so the
// /for-courses thanks page can build it in the browser (FB-1 review) as well as
// the server routes (via lib/calcom.ts).

/** The booker, prefilled. `token` (the inquiry's call invite) rides in
 *  metadata[invite] so the webhook finds the inquiry; without it the webhook
 *  falls back to the attendee's email (see api/calcom/webhook). */
export function calcomEmbedUrl(base: string, p: { token?: string; name: string; email: string; phone: string }): string {
  const u = new URL(base);
  u.searchParams.set('name', p.name);
  u.searchParams.set('email', p.email);
  // Cal.com validates the phone field as E.164 and skips a prefill that fails,
  // so a bare US number would silently not appear. Anything else is left out.
  const digits = p.phone.replace(/\D/g, '');
  const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : '';
  if (e164) u.searchParams.set('attendeePhoneNumber', e164);
  if (p.token) u.searchParams.set('metadata[invite]', p.token);
  u.searchParams.set('theme', 'light');
  return u.toString();
}
