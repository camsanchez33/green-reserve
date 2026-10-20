// W2-6 (Cam 2026-10-20: "a lot of courses will do an 18 and then have morning
// 9 times or have 9 twilight times, some have 3 nines or a nine and an 18 or
// maybe two 18s … making it into a schedule needs to be seamless").
//
// A course picks its SHAPE; the shape says which nines exist and which rounds
// golfers can book. Every round is a CourseProduct and gets its own tab on
// Schedule. Pure and browser-safe — the save is lib/course-shape-setup.ts.

export type ShapeKey = 'nine' | 'eighteen' | 'eighteen_plus_nine' | 'three_nines' | 'two_eighteens';

export type ShapeDef = {
  key: ShapeKey;
  label: string;
  example: string;
  holes: number;            // Course.holes
  /** What each name field is for, and its default. Nines are built from these. */
  nameFields: { label: string; placeholder: string; default: string }[];
  /** True when each name is a whole 18 (two 18s): it makes a front and a back nine. */
  namesAreCourses?: boolean;
};

export const SHAPES: ShapeDef[] = [
  { key: 'nine', label: '9 holes', example: 'A nine-hole course. Golfers can play it once or twice around.', holes: 9,
    nameFields: [{ label: 'Name of the nine', placeholder: 'The course', default: 'Course' }] },
  { key: 'eighteen', label: '18 holes', example: 'One 18. You can also sell 9-hole times, like early mornings or twilight, and back-nine starts.', holes: 18,
    nameFields: [{ label: 'Holes 1–9', placeholder: 'Front 9', default: 'Front 9' }, { label: 'Holes 10–18', placeholder: 'Back 9', default: 'Back 9' }] },
  { key: 'eighteen_plus_nine', label: '18 holes and a separate 9', example: 'An 18 plus its own nine-hole course, like an executive or par-3 nine.', holes: 27,
    nameFields: [{ label: 'Holes 1–9', placeholder: 'Front 9', default: 'Front 9' }, { label: 'Holes 10–18', placeholder: 'Back 9', default: 'Back 9' }, { label: 'The separate nine', placeholder: 'Executive 9', default: 'Executive 9' }] },
  { key: 'three_nines', label: 'Three nines (27 holes)', example: 'Three nines played in pairs, like North + South.', holes: 27,
    nameFields: [{ label: 'First nine', placeholder: 'North', default: 'North' }, { label: 'Second nine', placeholder: 'South', default: 'South' }, { label: 'Third nine', placeholder: 'West', default: 'West' }] },
  { key: 'two_eighteens', label: 'Two 18s (36 holes)', example: 'Two separate 18-hole courses.', holes: 36,
    nameFields: [{ label: 'First course', placeholder: 'Lakes', default: 'Lakes' }, { label: 'Second course', placeholder: 'Hills', default: 'Hills' }], namesAreCourses: true },
];
export const shapeDef = (k: string) => SHAPES.find(s => s.key === k) ?? null;

/** A nine the shape makes, and a round golfers can book (by nine positions). */
export type PlanNine = { name: string };
export type PlanRound = { key: string; label: string; holes: number; nines: number[]; on: boolean; hint: string };

const clean = (s: string, fallback: string) => (s ?? '').trim().slice(0, 40) || fallback;

/** The nines a shape makes from its names, in order. */
export function shapeNines(shape: ShapeDef, names: string[]): PlanNine[] {
  const n = shape.nameFields.map((f, i) => clean(names[i], f.default));
  if (shape.namesAreCourses) return n.flatMap(c => [{ name: `${c} front` }, { name: `${c} back` }]);
  return n.map(name => ({ name }));
}

/** The rounds a shape can sell, with sensible ones ticked. */
export function shapeRounds(shape: ShapeDef, names: string[]): PlanRound[] {
  const nines = shapeNines(shape, names);
  const nm = (i: number) => nines[i].name;
  switch (shape.key) {
    case 'nine':
      return [
        { key: 'single:0', label: '9 holes', holes: 9, nines: [0], on: true, hint: 'Once around.' },
        { key: 'twice:0', label: '18 holes', holes: 18, nines: [0], on: false, hint: 'Twice around the nine.' },
      ];
    case 'eighteen':
      return [
        { key: 'pair:0-1', label: '18 holes', holes: 18, nines: [0, 1], on: true, hint: 'Off the 1st tee.' },
        { key: 'single:0', label: '9 holes', holes: 9, nines: [0], on: false, hint: `${nm(0)} only — for early-morning or twilight 9s.` },
        { key: 'single:1', label: 'Back 9 start', holes: 9, nines: [1], on: false, hint: `Starts on the 10th — ${nm(1)} only.` },
      ];
    case 'eighteen_plus_nine':
      return [
        { key: 'pair:0-1', label: '18 holes', holes: 18, nines: [0, 1], on: true, hint: 'Off the 1st tee.' },
        { key: 'single:2', label: nm(2), holes: 9, nines: [2], on: true, hint: 'Your separate nine.' },
        { key: 'single:0', label: '9 holes', holes: 9, nines: [0], on: false, hint: `${nm(0)} only.` },
        { key: 'single:1', label: 'Back 9 start', holes: 9, nines: [1], on: false, hint: `Starts on the 10th — ${nm(1)} only.` },
      ];
    case 'three_nines': {
      const pairs: PlanRound[] = [[0, 1], [1, 2], [0, 2]].map(([a, b]) => ({ key: `pair:${a}-${b}`, label: `${nm(a)} + ${nm(b)}`, holes: 18, nines: [a, b], on: true, hint: '18 holes.' }));
      return [...pairs, ...[0, 1, 2].map(i => ({ key: `single:${i}`, label: `${nm(i)} 9`, holes: 9, nines: [i], on: false, hint: '9 holes.' }))];
    }
    case 'two_eighteens': {
      const c = shape.nameFields.map((f, i) => clean(names[i], f.default));
      return [
        { key: 'pair:0-1', label: c[0], holes: 18, nines: [0, 1], on: true, hint: '18 holes.' },
        { key: 'pair:2-3', label: c[1], holes: 18, nines: [2, 3], on: true, hint: '18 holes.' },
        { key: 'single:0', label: `${c[0]} 9`, holes: 9, nines: [0], on: false, hint: 'Front nine only.' },
        { key: 'single:2', label: `${c[1]} 9`, holes: 9, nines: [2], on: false, hint: 'Front nine only.' },
      ];
    }
  }
}

/** Best guess at a course's shape from what it already has (to prefill the setup). */
export function guessShape(holes: number | null, nineCount: number): ShapeKey {
  if (holes === 9 || nineCount === 1) return 'nine';
  if (holes === 36 || nineCount === 4) return 'two_eighteens';
  if (holes === 27 || nineCount === 3) return 'three_nines';
  return 'eighteen';
}
