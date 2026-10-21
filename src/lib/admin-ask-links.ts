// AW-3b: the only links an Ask answer may carry — admin pages on this site.
// Shared by the palette (renders them) and its test. Client-safe: no imports.

/** Markdown links whose target starts with /admin; anything else stays text. */
export const ADMIN_LINK = /\[([^\]]+)\]\((\/admin(?:\/[^\s)]*)?(?:\?[^\s)]*)?)\)/g;

/** The path to open for a link, or null. Resolves `..` and `%2e%2e` first, so a link can't climb out of /admin. */
export function safeAdminPath(href: string, origin: string): string | null {
  let u: URL;
  try { u = new URL(href, origin); } catch { return null; }
  if (u.origin !== new URL(origin).origin) return null;
  if (u.pathname !== '/admin' && !u.pathname.startsWith('/admin/')) return null;
  return u.pathname + u.search;
}
