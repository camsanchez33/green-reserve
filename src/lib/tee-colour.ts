// Settings rework (Cam 2026-10-19: tee sets have a colour). Courses name their
// tees after the marker colour ("Blue", "Black tips", "Gold"), so the swatch is
// read off the name rather than stored. A name with no colour word gets none.
const COLOURS: [RegExp, string][] = [
  [/\bblack\b/i, '#1A1A1A'],
  [/\bblue\b/i, '#1F4FA3'],
  [/\bwhite\b/i, '#FFFFFF'],
  [/\b(gold|yellow)\b/i, '#C9A227'],
  [/\bred\b/i, '#B3261E'],
  [/\bgreen\b/i, '#2E7D32'],
  [/\b(silver|grey|gray)\b/i, '#A8A9AD'],
  [/\borange\b/i, '#E07B24'],
  [/\b(copper|bronze)\b/i, '#B06A3B'],
  [/\bpurple\b/i, '#6A3FA0'],
];

/** The marker colour a tee's name implies, or null. */
export function teeColour(name: string): string | null {
  for (const [re, hex] of COLOURS) if (re.test(name)) return hex;
  return null;
}
