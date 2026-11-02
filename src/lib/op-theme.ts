// DASH-D (Cam 2026-11-01: "they should be able to set dark or light mode"): the
// dashboard's Light/Dark choice. Light is the default. It is a per-browser
// cookie, not a login setting, on purpose: it is a screen preference (a bright
// pro shop vs a dark office), it must be known before the first paint, and it
// needs no permission — every login, staff included, can flip it. Client-safe.
export const OP_THEME_COOKIE = 'gr_op_theme';
export type OpTheme = 'light' | 'dark';

export function readOpTheme(v: string | undefined | null): OpTheme {
  return v === 'dark' ? 'dark' : 'light';
}

/** Apply and remember the choice (browser only). One year; the dashboard path only. */
export function setOpTheme(theme: OpTheme): void {
  // Secure only over https, so a phone testing against a plain-http dev address keeps the choice too.
  document.cookie = `${OP_THEME_COOKIE}=${theme}; Path=/dashboard; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  document.querySelectorAll<HTMLElement>('.op-look').forEach(el => { el.dataset.theme = theme; });
}

/** The look now on screen (browser only). */
export function currentOpTheme(): OpTheme {
  return readOpTheme(document.querySelector<HTMLElement>('.op-look')?.dataset.theme);
}
