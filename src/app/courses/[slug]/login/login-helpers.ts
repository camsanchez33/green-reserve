// Log in (item 2): the line under the heading, and where Log in goes back to. Plain functions, so tests can load them.

/** "For <Course> members." / "… members and residents." / a comma list ending in "and" (item 2). */
export function loginLine(courseName: string, groups: readonly string[] | undefined): string {
  const words = (groups && groups.length ? groups : ['members']).map(x => x);
  const list = words.length === 1 ? words[0] : words.length === 2 ? `${words[0]} and ${words[1]}` : `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`;
  return `For ${courseName} ${list}.`;
}

/** Where Log in returns to: a path on this site under the course or /book, else the course's tee times. */
export function safeBack(back: string, slug: string): string {
  const home = `/courses/${slug}`;
  if (!back || !back.startsWith('/') || back.startsWith('//') || back.includes('\\') || /(^|\/)\.\.?(\/|\?|$)/.test(back.split('?')[0]) || /%2e|%2f|%5c/i.test(back.split('?')[0])) return home;
  if (back === home || back.startsWith(`${home}?`) || back.startsWith(`${home}/`) || back.startsWith('/book?')) return back;
  return home;
}
