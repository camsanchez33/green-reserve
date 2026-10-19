// Settings rework (Cam 2026-10-19): the course's walking rule in the words
// golfers read — one source for the Settings preview and the booking page.
export function walkingWords(rule: string | null | undefined): string {
  switch (rule) {
    case 'never': return 'Carts only — no walking.';
    case 'weekdays': return 'Walking on weekdays only.';
    case 'after12': return 'Walking after 12pm only.';
    default: return 'Walking any time.';
  }
}
