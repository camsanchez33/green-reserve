// ADMIN-REDO (Cam 2026-11-12, ADMIN_REDO_SPEC.md "Theme changes"): the admin has NO light mode — green glass dark
// only. There is no switch; a gr_admin_theme cookie saved before this (including "light") is ignored, so anyone who
// once picked light now sees dark. The light token values in admin-glass.module.css remain only as the base the
// dark block overrides.
export const ADMIN_THEME = 'dark' as const;
