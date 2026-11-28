// MP-9: the staff input class (CLAUDE.md "Input class"). Fifteen admin files
// each typed their own copy; they are these two now. Two sizes because the
// sites genuinely use two heights (py-2.5 forms, py-2 in dense panels) —
// unifying them is a visual change for Cam to make here, in one place.
// Width stays at the site (`${INPUT} w-full`).
// UI-KIT-4 (Cam 2026-11-26, v4 fields): 44px, a soft fill instead of a ruled box, a green border on focus. On the course
// dashboard and the admin the same look comes from ui-kit-v4.css (tokens), so a bare input there matches too.
export const INPUT = 'min-h-[44px] bg-line-soft border border-transparent rounded-lg px-3 py-2.5 text-sm text-ink placeholder-ink-faint outline-none focus:border-ok focus:bg-card transition-colors';
export const INPUT_COMPACT = 'min-h-[40px] bg-line-soft border border-transparent rounded-lg px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none focus:border-ok focus:bg-card transition-colors';
