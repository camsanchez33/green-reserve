import { Newsreader, Source_Sans_3 } from 'next/font/google';

// U-0 (UI_REVISE_SPEC §1b): the STAFF look. /dashboard and /admin set these
// two variables on their route layouts; `.staff-look` in globals.css then
// points Tailwind's --font-serif / --font-sans at them, so every existing
// `font-serif` / `font-sans` utility inside those trees renders Newsreader /
// Source Sans 3 without a single page edit. The public site (root layout)
// keeps Fraunces / Inter — these fonts are never loaded there.
export const newsreader = Newsreader({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['opsz'],
  variable: '--font-serif-staff',
  display: 'swap',
});

export const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans-staff',
  display: 'swap',
});

/** Class list for the staff wrapper: the look switch + both font variables. */
export const STAFF_LOOK_CLASS = `staff-look contents ${newsreader.variable} ${sourceSans.variable}`;
