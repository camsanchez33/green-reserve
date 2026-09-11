// SD-10 (from the SD review). The operator dashboard's fetches were, almost
// without exception, `fetch(...).then(r => r.json())` or `if (r.ok) set...`
// with no else: a 403 became "no schedules yet", a 500 became a blank page
// when `{error}.map` threw, a dropped connection left a button on "Saving…"
// forever. One classifier, the dashboard's counterpart to lib/admin-fetch.
//
// Never throws. `error` is always a sentence a person at a counter can act on:
// the server's own message when it sent one, otherwise a fixed line per status.

export type DFetchResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; data: null; error: string };

export async function dfetch<T = unknown>(input: string, init?: RequestInit): Promise<DFetchResult<T>> {
  try {
    const res = await fetch(input, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as { error?: unknown }));
      const server = typeof body?.error === 'string' && body.error.trim() ? body.error.trim() : '';
      const error = server
        || (res.status === 401 ? 'Your session ended — sign in again.'
          : res.status === 403 ? 'You do not have access to do that.'
          : res.status === 404 ? 'That no longer exists — refresh the page.'
          : `Something went wrong (${res.status}). Nothing was changed — try again.`);
      return { ok: false, status: res.status, data: null, error };
    }
    // A 2xx with no JSON body is fine for mutations; callers that need data check for null.
    const data = await res.json().catch(() => null);
    return { ok: true, status: res.status, data: data as T };
  } catch {
    return { ok: false, status: 0, data: null, error: 'Network error — check your connection and try again.' };
  }
}
