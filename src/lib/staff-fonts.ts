// U-0 (UI_REVISE_SPEC §1b) used to give /dashboard and /admin their own STAFF
// look here: Newsreader + Source Sans 3, square corners and a second palette.
// FLOW-1 (Cam 2026-10-01: "the whole site flows together") retired it — staff
// pages now render in the same Archivo, palette and corners as the homepage,
// and these two font files are no longer downloaded at all.
//
// The wrapper stays (display: contents, no box) so the route layouts keep one
// obvious hook if staff pages ever need a scoped override again.
export const STAFF_LOOK_CLASS = 'staff-look contents';
