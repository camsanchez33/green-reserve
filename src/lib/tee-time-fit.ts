// Cam 2026-10-19: adding a time by hand warns when it sits within a few minutes
// of a time already on the sheet — groups that close stack up on the first tee.
// Pure; shared by the Add time form and scripts/walkin-fit-test.ts.

export const FIT_WINDOW_MIN = 5;

const toMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** The existing times (HH:MM) within `windowMin` of `time`, nearest first. An exact match is included. */
export function timesTooClose(time: string, existing: string[], windowMin = FIT_WINDOW_MIN): { time: string; gap: number }[] {
  if (!/^\d{2}:\d{2}/.test(time)) return [];
  const t = toMin(time);
  return existing
    .filter(e => /^\d{2}:\d{2}/.test(e))
    .map(e => ({ time: e.slice(0, 5), gap: Math.abs(toMin(e) - t) }))
    .filter(x => x.gap <= windowMin)
    .sort((a, b) => a.gap - b.gap);
}
