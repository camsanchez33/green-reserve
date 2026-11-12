// ADMIN-REDO (Cam 2026-11-11): the admin's Light/Dark choice. Light is the
// default. A per-browser cookie (a screen preference, not a login setting),
// read by app/admin/layout.tsx so the first paint is right. Client-safe.
export const ADMIN_THEME_COOKIE = 'gr_admin_theme';
export type AdminTheme = 'light' | 'dark';

export function readAdminTheme(v: string | undefined | null): AdminTheme {
  return v === 'dark' ? 'dark' : 'light';
}

/** Apply and remember the choice (browser only). One year; the admin path only. */
export function setAdminTheme(theme: AdminTheme): void {
  document.cookie = `${ADMIN_THEME_COOKIE}=${theme}; Path=/admin; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  document.querySelectorAll<HTMLElement>('[data-admin-shell]').forEach(el => { el.dataset.theme = theme; });
}

export function currentAdminTheme(): AdminTheme {
  return readAdminTheme(document.querySelector<HTMLElement>('[data-admin-shell]')?.dataset.theme);
}
