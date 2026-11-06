// ROUNDS-1 (Cam 2026-11-06: "make it easy to know which tee times are 9 holes, which are twilight"): what a
// tee time sells, in words, for the tee sheet — its price period (the schedule's name, e.g. Twilight) and
// its round (the product's label, e.g. Back nine, or "9 holes"). The sheet names the round a tee runs most
// once in that tee's header, then labels every time that differs and marks where a new run starts.
// Client-safe, pure.
export type RoundSlot = { time: string; holes?: number; tierName?: string | null; product?: { label: string } | null };

const holesWord = (h?: number) => `${h ?? 18} holes`;

/** "Back nine", or "9 holes" when the time has no named round. */
export function roundOf(s: RoundSlot): string {
  const label = s.product?.label?.trim();
  return label || holesWord(s.holes);
}

/** The price period, or '' for none: "standard" (a time added by hand) and "All day" (the course plan's
 *  name for a day with no price change) both mean the day's one price. */
const NO_PERIOD = new Set(['standard', 'all day']);
export function periodOf(s: RoundSlot): string {
  const t = (s.tierName ?? '').trim();
  return t && !NO_PERIOD.has(t.toLowerCase()) ? t : '';
}

/** What a time sells, in one line: "Twilight · Front nine", "18 holes". */
export function roundName(s: RoundSlot): string {
  return [periodOf(s), roundOf(s)].filter(Boolean).join(' · ');
}

/** The round most of these times sell (the earliest wins a tie) — named once, in the header. */
export function usualRound(slots: RoundSlot[]): string {
  const n = new Map<string, number>();
  for (const s of [...slots].sort((a, b) => a.time.localeCompare(b.time))) n.set(roundName(s), (n.get(roundName(s)) ?? 0) + 1);
  let best = '', most = 0;
  for (const [k, c] of n) if (c > most) { best = k; most = c; }
  return best;
}

/** The round the header names: only the holes or label, without a period ("18 holes", "Back nine"). */
export function usualRoundOnly(slots: RoundSlot[]): string {
  const n = new Map<string, number>();
  for (const s of slots) n.set(roundOf(s), (n.get(roundOf(s)) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** The time's own label on the sheet — '' when it sells the usual round. A time with no period that sells
 *  the usual round's holes (one staff added by hand on a Morning day) is the usual round, not a new one. */
export function rowTag(s: RoundSlot, usual: string): string {
  if (roundName(s) === usual) return '';
  if (!periodOf(s) && usual.split(' · ').pop() === roundOf(s)) return '';
  return roundName(s);
}

/** Every time on one tee, in order, with the run it sits in and when that run began. A time with its own
 *  period starts or continues that run; a time with no period (added by hand) stays in the run around it
 *  — a 2:05 PM time on an Afternoon stretch is Afternoon, not the day's usual Morning (review 2026-11-06). */
export function runsOf<T extends RoundSlot>(laneTimes: T[], usual: string): Map<T, { run: string; from: string }> {
  const out = new Map<T, { run: string; from: string }>();
  let run = '', from = '';
  for (const s of [...laneTimes].sort((a, b) => a.time.localeCompare(b.time))) {
    const own = rowTag(s, usual) || (periodOf(s) ? usual : '');
    const next = own || run || usual;
    if (next !== run) { run = next; from = s.time; }
    out.set(s, { run, from });
  }
  return out;
}
