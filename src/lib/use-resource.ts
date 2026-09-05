'use client';
// MP-11b (ADMIN_V4 V4-7 item 4). The GET-loader shape that every admin page
// had hand-rolled, in one place: data, loading, an error the page can show,
// 401/403 classified by adminFetch, and abort-on-supersede/unmount so a slow
// response for the previous date cannot land on top of the current one.
//
// The pattern it replaces is `if (r.ok) setData(await r.json())` with no else,
// which rendered a 403 or a 500 as "no tee times" / "no messages" — emptiness
// and failure looking identical, the thing the no-silent-failures rule forbids.

import { useState, useRef, useCallback, useEffect } from 'react';
import { adminFetch, type AdminFetchFailure } from './admin-fetch';

export interface ResourceError { msg: string; kind: AdminFetchFailure }

export function useResource<T>(subject: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ResourceError | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async (url: string, opts: { clear?: boolean } = {}) => {
    ctrl.current?.abort();
    const ac = new AbortController();
    ctrl.current = ac;
    setLoading(true); setError(null);
    if (opts.clear) setData(null);
    const res = await adminFetch<T>(url, { subject, signal: ac.signal });
    // Superseded by a newer load, or the component is gone — say nothing.
    if (ac.signal.aborted) return;
    if (res.ok) setData(res.data);
    else setError({ msg: res.message, kind: res.kind });
    setLoading(false);
  }, [subject]);

  useEffect(() => () => { ctrl.current?.abort(); }, []);

  return { data, loading, error, load, setData };
}
