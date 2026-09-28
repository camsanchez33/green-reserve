// SD-8b — leaving a dashboard page with unsaved edits.
//
// `beforeunload` only fires on a real document unload: tab close, refresh,
// cross-origin navigation. The operator sidebar navigates with `router.push`,
// a client-side App Router transition, so no unload event fires and an
// in-progress edit is unmounted with no prompt — which is the most common way
// anyone actually leaves Settings.
//
// A page with unsaved work registers a guard here; the sidebar asks before it
// navigates. One guard at a time is deliberate: only one dashboard page is
// mounted at a time, and a stack would just hide a page that forgot to clear.

import { useEffect, useRef } from 'react';

type LeaveGuard = () => boolean;

let guard: LeaveGuard | null = null;

/**
 * Register the check to run before an in-app navigation. Return true to allow
 * the navigation, false to cancel it. Pass null to clear — ALWAYS clear on
 * unmount, or the next page inherits a guard that closes over dead state.
 */
export function setLeaveGuard(fn: LeaveGuard | null) {
  guard = fn;
}

/** True when it is safe to navigate away. Never throws: a broken guard on a
 *  page must not be able to trap someone on it. */
export function confirmLeave(): boolean {
  if (!guard) return true;
  try {
    return guard();
  } catch {
    return true;
  }
}

// SD-8d — browser Back. The App Router handles back/forward on `popstate`,
// which fires no beforeunload and cannot be cancelled: by the time anyone
// hears it the URL has already moved. So while a page is dirty, push one extra
// "trap" entry for the SAME url. Back then pops the trap instead of leaving —
// Next traverses to the same url and tree, so the page stays mounted with its
// edits — and that pop is where we ask. Stay: re-arm the trap. Leave: step
// back once more, past the real entry, to wherever Back was going.
//
// Next's patched pushState copies __NA and the router tree onto the entry, so
// its own popstate handler treats the trap as an ordinary app-router entry.
// The __grTrap flag survives Next's restore (preserveCustomHistoryState) and
// is only used to consume the trap once the page is clean again, so a later
// Back is not swallowed by a leftover duplicate entry.
const TRAP = '__grTrap';

function pushTrap() {
  window.history.pushState({ [TRAP]: true }, '', window.location.href);
}

/** Ask before browser Back leaves the page while `dirty`. Uses the guard
 *  registered with setLeaveGuard, so the prompt matches the sidebar's. */
export function useBackGuard(dirty: boolean) {
  const armed = useRef(false);

  // Arm on dirty, consume the trap on clean. Deliberately in the effect body,
  // never in cleanup: on unmount the url may already belong to the next page,
  // and a history.back() there would throw the user off it.
  useEffect(() => {
    if (dirty && !armed.current) {
      pushTrap();
      armed.current = true;
    } else if (!dirty && armed.current) {
      armed.current = false;
      if (window.history.state?.[TRAP]) window.history.back();
    }
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    let leaving = false;
    const onPop = () => {
      if (leaving || !armed.current) return;
      // The trap is gone; we are on the page's real entry.
      armed.current = false;
      if (confirmLeave()) {
        leaving = true;
        window.history.back();
      } else {
        pushTrap();
        armed.current = true;
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [dirty]);
}
