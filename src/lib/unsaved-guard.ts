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
