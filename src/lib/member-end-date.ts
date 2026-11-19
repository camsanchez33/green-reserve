// "Runs until" on the member card (Build 2026-11-19): what the card sends when staff save the details form. Pure, so the
// browser and the tests share it. `shownWhenOpened` is the day the form showed when it opened (held in the form, never
// re-read from a refreshed row: a payment made from the same card while the form is open moves the stored day, and the
// form must not write the old one back). Nothing is sent unless staff changed the date; the API then refuses (409) when
// the stored day no longer matches the one they saw (lib/membership-autorenew setEndDateByStaff).
export const shownDay = (expiresAt: string | null | undefined) => (expiresAt ? expiresAt.slice(0, 10) : '');

export function endDateToSend(shownWhenOpened: string, typed: string): { expiresAt: string | null; expiresAtWas: string } | Record<string, never> {
  return typed !== shownWhenOpened ? { expiresAt: typed || null, expiresAtWas: shownWhenOpened } : {};
}
