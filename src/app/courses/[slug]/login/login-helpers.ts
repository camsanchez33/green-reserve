// Log in (item 2): the line under the heading, and where Log in goes back to. Plain functions, so tests can load them.

/** "For <Course> members." / "… members and residents." / a comma list ending in "and" (item 2). */
export function loginLine(courseName: string, groups: readonly string[] | undefined): string {
  const words = (groups && groups.length ? groups : ['members']).map(x => x);
  const list = words.length === 1 ? words[0] : words.length === 2 ? `${words[0]} and ${words[1]}` : `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`;
  return `For ${courseName} ${list}.`;
}

/**
 * Where Log in returns to: this course's pages or /book, on this site, else the course's tee times. The browser drops
 * tabs and newlines and resolves dot segments before it navigates, so the path is resolved the same way here and the
 * RESOLVED path is what is checked and returned (review 2026-11-18).
 */
export function safeBack(back: string, slug: string): string {
  const home = `/courses/${slug}`;
  // Control characters, spaces, a fragment or a backslash anywhere: refused outright.
  if (!back || !back.startsWith('/') || back.startsWith('//') || /[\u0000-\u0020\u007f#\\]/.test(back)) return home;
  let url: URL;
  try { url = new URL(back, 'http://same.invalid'); } catch { return home; }
  if (url.origin !== 'http://same.invalid') return home;
  // Encoded dots or slashes in the path could still resolve elsewhere on a later decode: refused.
  if (/%2e|%2f|%5c/i.test(url.pathname)) return home;
  const p = url.pathname;
  if (p === home || p.startsWith(`${home}/`)) return p + url.search;
  if (p === '/book' && url.search) return p + url.search;
  return home;
}

/**
 * Whether the course offers Log in (Build 2026-11-18): its switch is on AND it has a group to log in to (members or
 * residents). A course with neither shows no Log in. A payload without the fields (#495) counts as off.
 */
export function loginOffered(course: { member_login_on?: boolean; login_groups?: readonly string[] }): boolean {
  return course.member_login_on === true && (course.login_groups?.length ?? 0) > 0;
}
