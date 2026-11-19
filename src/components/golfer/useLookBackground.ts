'use client';
import { useEffect } from 'react';
import { lookPageBg, type CourseLook } from './look';

// LOOK-BG (Golfer lane): on Dark, a golfer look page's own root is dark but html and body keep the site's light paper,
// so overscroll, the space under a short page and the bounce on a phone flash light. While a golfer look page is
// mounted on Dark, this sets the html and body background to the look's, and takes it away on unmount (or when the
// look changes). Light pages are left alone.
//
// It adds one <style> element rather than writing inline styles: removing it restores exactly what was there, and it
// is screen-only, so a Dark receipt still prints on white. Only golfer pages call it; it also refuses to run under the
// dashboard, admin and owner surfaces, so a stray call can never repaint them.

type LookCourse = { booking_look?: Partial<CourseLook> | null; brand_color?: string | null };

/** The surfaces this hook never touches, whatever calls it. */
export const LOOK_BG_NEVER = /^\/(dashboard|admin|cam)(\/|$)/;

/** The CSS the hook adds for a background hex (exported for the test). */
export function lookBgCss(bg: string): string {
  return `@media screen { html { background-color: ${bg}; } html > body { background-color: ${bg}; } }`;
}

export function useLookBackground(course: LookCourse | null | undefined): void {
  const bg = course ? lookPageBg(course) : null;
  useEffect(() => {
    if (!bg || typeof document === 'undefined') return;
    if (LOOK_BG_NEVER.test(window.location.pathname)) return;
    const el = document.createElement('style');
    el.setAttribute('data-golfer-look-bg', '');
    el.textContent = lookBgCss(bg);
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [bg]);
}

/** The hook as a component, for a page whose look is known only below an early return (renders nothing). */
export function LookBackground({ course }: { course: LookCourse | null | undefined }): null {
  useLookBackground(course);
  return null;
}
