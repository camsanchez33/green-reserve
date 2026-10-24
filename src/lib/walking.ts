// Settings rework (Cam 2026-10-19): the course's walking rule in the words
// golfers read — one source for the Settings preview and the booking page.
export function walkingWords(rule: string | null | undefined): string {
  switch (rule) {
    case 'never': return 'Carts only — no walking.';
    case 'some': return 'Walking on some tee times — each time says if a cart is required.';
    case 'weekdays': return 'Walking on weekdays only.';
    case 'after12': return 'Walking after 12pm only.';
    default: return 'Walking any time.';
  }
}

/**
 * CART-1 (Cam 2026-10-24): walking is set per price-table cell, weekday and
 * weekend, so the course's summary comes from its running schedule rows:
 * 'always' (every cell walkable), 'never' (carts only) or 'some'.
 */
export function walkingSummary(rows: { walkingAllowed: boolean; walkingWeekend?: boolean | null }[]): 'always' | 'never' | 'some' {
  const flags = rows.flatMap(r => [r.walkingAllowed !== false, (r.walkingWeekend ?? r.walkingAllowed) !== false]);
  if (!flags.length || flags.every(Boolean)) return 'always';
  return flags.some(Boolean) ? 'some' : 'never';
}
