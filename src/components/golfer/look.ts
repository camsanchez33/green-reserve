import type { CSSProperties } from 'react';
import { BOOKING_ACCENT_COLOURS, BOOKING_ACCENTS, type BookingLook, type BookingAccent } from '@/lib/booking-look';

// GOLFER-LOOK (Cam 2026-11-18, lanes/build.md "Booking page look"): a course's golfer pages wear Light or Dark
// plus ONE accent from four presets (Black, Green, Blue, Yellow, where Yellow is a deep gold so white text
// passes AA). No red: red means a problem. The preset colours live in lib/booking-look (Build's, one source);
// the page reads the course's booking_look {look, accent} from the public payload.
//
// brand_color is only the fallback for a payload without booking_look (an old cached preview): a colour
// that is a preset's Light accent reads as that preset, any other colour renders as it is, on Light.

export type { BookingLook, BookingAccent };
export type CourseLook = { look: BookingLook; accent: BookingAccent };

// UI style overhaul (Cam 2026-11-26, lanes/build.md "UI style overhaul — APPROVED"): Light is SOLID (white cards on a
// neutral grey page, R=G=B) and Dark is GLASS (a flat #141414 page, translucent panels with a blur, a faint white hairline,
// a soft top highlight and a soft shadow; no colour cast). Fields match their screen: white with a thin border on Light,
// a dark glass field with a faint light edge on Dark. `blur` and `shadow` are what a panel wears in each look.
const NEUTRAL: Record<BookingLook, Record<string, string>> = {
  light: {
    bg: '#F2F2F2', paper: '#F2F2F2', card: '#FFFFFF', ink: '#161616', soft: '#4A4A4A', muted: '#5C5C5C', line: '#E4E4E4',
    field: '#FFFFFF', 'field-edge': '#D4D4D4', bad: '#A3452F', 'bad-soft': '#FBEAE6',
    blur: 'none', shadow: '0 1px 2px rgb(20 20 20 / .06)',
  },
  dark: {
    bg: '#141414', paper: '#141414', card: 'rgb(38 38 38 / .62)', ink: '#EDEDED', soft: '#C6C6C6', muted: '#A8A8A8', line: 'rgb(255 255 255 / .10)',
    field: 'rgb(255 255 255 / .06)', 'field-edge': 'rgb(255 255 255 / .14)', bad: '#EE9480', 'bad-soft': '#3A2220',
    blur: 'blur(30px) saturate(1.8)', shadow: 'inset 0 1px 0 rgb(255 255 255 / .07), 0 1px 2px rgb(0 0 0 / .30), 0 10px 30px rgb(0 0 0 / .28)',
  },
};

/** Dark's panels as opaque colours, for the pages still drawn with the site's classes (lookSiteVars), which have no glass. */
const DARK_SOLID = { card: '#262626', line: '#333333', lineSoft: '#2A2A2A', lineStrong: '#4A4A4A' } as const;

/** The status colours on Dark (the site's dark values; red the look's own --g-bad). */
export const DARK_STATUS = { '--color-ok': '#7BD9A4', '--color-warn': '#F2C46B', '--color-bad': NEUTRAL.dark.bad } as const;

const HEX = /^#[0-9a-f]{6}$/i;

/** The preset a stored hex colour is, if it is one (matched on the Light accent, case-insensitive). */
export function presetOf(color: string | null | undefined): BookingAccent | null {
  if (!color) return null;
  const c = color.toUpperCase();
  return BOOKING_ACCENTS.find(a => BOOKING_ACCENT_COLOURS[a].light.acc.toUpperCase() === c) ?? null;
}

/** The look a page wears: the course's booking_look when it is a valid pair, else Light from brand_color. */
function lookOf(course: { booking_look?: Partial<CourseLook> | null; brand_color?: string | null }): { mode: BookingLook; accent: BookingAccent | null; hex: string } {
  const bl = course.booking_look;
  const hex = course.brand_color && HEX.test(course.brand_color) ? course.brand_color : '#173B2A';
  if (bl && (bl.look === 'light' || bl.look === 'dark') && bl.accent && (BOOKING_ACCENTS as readonly string[]).includes(bl.accent)) {
    return { mode: bl.look, accent: bl.accent, hex };
  }
  return { mode: 'light', accent: presetOf(hex), hex };
}

/** Light or Dark, for things drawn outside the page's CSS. */
/** The accent as one hex, for things drawn outside the look tokens (the Stripe card field): the preset's Light accent, or brand_color. */
export function lookAccentHex(course: { booking_look?: Partial<CourseLook> | null; brand_color?: string | null }): string {
  const { accent, hex } = lookOf(course);
  return accent ? BOOKING_ACCENT_COLOURS[accent].light.acc : hex;
}

export function lookMode(course: { booking_look?: Partial<CourseLook> | null; brand_color?: string | null }): BookingLook {
  return lookOf(course).mode;
}

/**
 * The CSS custom properties a golfer page sets on its root element (`--g-*`). The page's stylesheet reads only
 * these, so one course look covers every element and both looks get every change.
 */
export function golferLookVars(course: { booking_look?: Partial<CourseLook> | null; brand_color?: string | null }): CSSProperties {
  const { mode, accent, hex } = lookOf(course);
  const n = NEUTRAL[mode];
  let acc: string, hover: string, soft: string, onAcc: string, band: string;
  if (accent) {
    const c = BOOKING_ACCENT_COLOURS[accent][mode];
    ({ acc, hover, soft, onAcc } = c);
    // The header band keeps the preset's own colour in both looks, with white on it; Black lifts to a neutral grey on Dark.
    band = mode === 'dark' && accent === 'black' ? '#2C2C2C' : BOOKING_ACCENT_COLOURS[accent].light.acc;
  } else {
    // A colour that is no preset (only without booking_look): as it is, on Light.
    acc = hex; hover = hex; soft = `color-mix(in srgb, ${hex} 10%, #FFFFFF)`; onAcc = '#FFFFFF'; band = hex;
  }
  const vars: Record<string, string> = Object.fromEntries(Object.entries(n).map(([k, v]) => [`--g-${k}`, v]));
  Object.assign(vars, { '--g-acc': acc, '--g-acc-h': hover, '--g-acc-soft': soft, '--g-on-acc': onAcc, '--g-band': band, '--g-on-band': '#FFFFFF', colorScheme: mode });
  // <StatusDot> draws from the site's --color-ok/warn/bad, which are light-page colours: on Dark they nearly vanish,
  // so the look lifts them (red is the look's own).
  if (mode === 'dark') Object.assign(vars, DARK_STATUS);
  return vars as CSSProperties;
}

/**
 * The page background a golfer page needs behind its own root on Dark (the html and body background, so overscroll and
 * the space past a short page aren't the site's light paper). Null on Light: the site's own background is already right.
 */
export function lookPageBg(course: { booking_look?: Partial<CourseLook> | null; brand_color?: string | null }): string | null {
  return lookOf(course).mode === 'dark' ? NEUTRAL.dark.bg : null;
}

/** Plain hex text colours for things drawn outside the page's CSS (the Stripe card field reads no variables). */
export function lookText(look: BookingLook | null | undefined): { ink: string; muted: string; bad: string } {
  const n = NEUTRAL[look === 'dark' ? 'dark' : 'light'];
  return { ink: n.ink, muted: n.muted, bad: n.bad };
}

/** The header band's colour as one hex (CourseHeaderBar takes a hex): the preset's band, or brand_color. */
export function lookBandHex(course: { booking_look?: Partial<CourseLook> | null; brand_color?: string | null }): string {
  return (golferLookVars(course) as Record<string, string>)['--g-band'];
}

/** The course has saved a look (a valid booking_look with a preset accent). Without one, a page is exactly as before. */
export function lookPicked(course: { booking_look?: Partial<CourseLook> | null }): boolean {
  const bl = course.booking_look;
  return !!bl && (bl.look === 'light' || bl.look === 'dark') && !!bl.accent && (BOOKING_ACCENTS as readonly string[]).includes(bl.accent);
}

/**
 * For the golfer pages still drawn with the site's classes (manage, the tee-time pay page, the receipt; BOOKING-LOOK-1):
 * the look's variables plus the site colour tokens those classes read, so the existing markup follows the look.
 * - A course that has picked a look: the accent replaces pine (buttons, links, rules), in both looks.
 * - Dark: the neutrals and the status colours swap to the dark values (as .op-look does for the operator pages).
 * - A course that hasn't picked a look (accent null): nothing changes; today's light page, its brand_color in the band.
 */
export function lookSiteVars(course: { booking_look?: Partial<CourseLook> | null; brand_color?: string | null }): CSSProperties {
  const vars = golferLookVars(course) as Record<string, string>;
  if (!lookPicked(course)) return vars as CSSProperties;
  Object.assign(vars, { '--color-pine': vars['--g-acc'], '--color-pine-hover': vars['--g-acc-h'], '--color-pine-soft': vars['--g-acc-soft'] });
  if (lookOf(course).mode === 'dark') {
    const n = NEUTRAL.dark;
    Object.assign(vars, {
      '--color-paper': n.bg, '--color-card': DARK_SOLID.card, '--color-ink': n.ink, '--color-ink-soft': n.soft,
      '--color-ink-muted': n.muted, '--color-ink-faint': n.muted, '--color-line': DARK_SOLID.line, '--color-line-soft': DARK_SOLID.lineSoft,
      '--color-line-strong': DARK_SOLID.lineStrong,
    });
  }
  return vars as CSSProperties;
}

