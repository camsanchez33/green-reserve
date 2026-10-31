// Launch walk (Cam 2026-10-31): what an admin page says when an action went through but its
// awaited email to the course didn't (setup sheet, go-live). Client-safe.
export function emailFailedNotice(d: { emailError?: unknown; detailsLink?: unknown }, contactEmail: string): string {
  const why = d.emailError ? `: ${String(d.emailError)}` : '';
  return d.detailsLink
    ? `Done, but the email didn’t send${why}. Send them the sheet link yourself: ${String(d.detailsLink)}`
    : `Done, but the email didn’t send${why}. Email ${contactEmail || 'the contact'} yourself.`;
}
