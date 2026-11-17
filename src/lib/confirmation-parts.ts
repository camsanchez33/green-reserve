// Settings data (Cam 2026-11-17, Settings → Booking → Confirmation email): the
// parts of the booking confirmation the course writes in its own words —
// arrival, dress code, parking, a note and a contact line. The cancellation and
// payment wording is NEVER one of them: it comes from describePolicy(), so it
// always matches what the course charges. Client-safe (no server imports).

export type ConfirmationParts = { arrival: string; dressCode: string; parking: string; note: string; contact: string };

/** The Course columns the parts come from (dress code is the course's existing list). */
export const CONFIRMATION_PART_SELECT = {
  confirmationArrival: true, confirmationParking: true, confirmationContact: true, confirmationNote: true, dresscode: true,
} as const;

/** What a golfer reads when the course hasn't written an arrival line (and no note replaces it, as before). */
export const DEFAULT_ARRIVAL = 'Arrive 15 minutes early and check in at the pro shop.';

/** Longest each part may be, enforced by the settings API. */
export const CONFIRMATION_PART_MAX = { confirmationArrival: 300, confirmationParking: 300, confirmationContact: 300 } as const;

type PartColumns = { confirmationArrival?: string | null; confirmationParking?: string | null; confirmationContact?: string | null; confirmationNote?: string | null; dresscode?: string[] | null };

export function confirmationPartsOf(c: PartColumns): ConfirmationParts {
  return {
    arrival: (c.confirmationArrival ?? '').trim(),
    dressCode: (c.dresscode ?? []).map(s => s.trim()).filter(Boolean).join(', '),
    parking: (c.confirmationParking ?? '').trim(),
    note: (c.confirmationNote ?? '').trim(),
    contact: (c.confirmationContact ?? '').trim(),
  };
}

/**
 * The lines the email shows, in order, each with its label ('' = none).
 * A course that only ever wrote a note keeps today's email exactly: the note
 * stands in place of the default arrival line.
 */
export function confirmationLines(p: ConfirmationParts): { label: string; text: string }[] {
  const arrival = p.arrival || (p.note ? '' : DEFAULT_ARRIVAL);
  return [
    { label: 'Arrival', text: arrival },
    { label: 'Dress code', text: p.dressCode },
    { label: 'Parking', text: p.parking },
    { label: '', text: p.note },
    { label: '', text: p.contact },
  ].filter(l => l.text);
}
