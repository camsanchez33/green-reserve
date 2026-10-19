// Settings rework (Cam 2026-10-19): "what golfers can book" is built from the
// course's named nines rather than typed — every pair of nines is an 18-hole
// round, and each nine alone is a 9. The course ticks the ones it sells.

type NineRef = { id: string; name: string };
export type CandidateRound = { label: string; holes: number; nineIds: string[] };

/** Every pair of nines as an 18-hole round, then each nine on its own as a 9. */
export function candidateRounds(nines: NineRef[]): CandidateRound[] {
  const out: CandidateRound[] = [];
  for (let i = 0; i < nines.length; i++)
    for (let j = i + 1; j < nines.length; j++)
      out.push({ label: `${nines[i].name} + ${nines[j].name}`, holes: 18, nineIds: [nines[i].id, nines[j].id] });
  for (const n of nines) out.push({ label: `${n.name} only`, holes: 9, nineIds: [n.id] });
  return out;
}

/** Same nines, in any order. */
export const sameNines = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));
