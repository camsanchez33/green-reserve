/**
 * One place that decides what an admin fetch failure MEANS.
 *
 * MP-2c, and the reason it exists: MP-2 added role gates and a per-request
 * `active` check, which made 401 and 403 routine rather than theoretical. Every
 * admin page then invented its own handling — or didn't, and parsed the error
 * body as data. Three consecutive reviews found the same defect wearing
 * different clothes: "Forbidden" rendering as "No admin accounts yet", "No
 * messages yet", `No results for "x"`, and an empty pipeline.
 *
 * MP-2b tried to fix that surface by surface and made it worse: two of the
 * fixes were unreachable, one erased its own error a frame later, and the new
 * gates created three fresh instances. Fourteen implementations cannot all be
 * correct. This is the one implementation.
 *
 * Usage:
 *   const res = await adminFetch<Course[]>('/api/admin/courses');
 *   if (!res.ok) { setError(res.message); setCourses([]); return; }
 *   setCourses(res.data);
 *
 * A 401 means the session ended — deactivated mid-shift, or 12h expiry. Pages
 * should send the user to LOGIN_SESSION_ENDED so the login screen can explain
 * itself instead of answering "Invalid credentials" to correct credentials.
 */

export const LOGIN_SESSION_ENDED = '/admin/login?reason=session_ended';

export type AdminFetchFailure =
  | 'unauthorized'   // 401 — session gone
  | 'forbidden'      // 403 — real session, wrong role
  | 'notfound'       // 404
  | 'rejected'       // 400/409/422/429 — the server explained why; show it
  | 'server'         // 5xx or an unclassified non-2xx
  | 'network';       // fetch threw / offline / body was not JSON

/**
 * What the caller was doing. MP-2e: every message said "load", so a failed
 * SEND read "Could not load this message" — which tells the operator nothing
 * about whether it went out, the only thing they actually need to know.
 */
export type AdminFetchAction = 'load' | 'send' | 'save';

export type AdminFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: AdminFetchFailure; status: number | null; message: string };

/**
 * `subject` names the thing being loaded, lower case, for the message:
 *   "inquiries" -> "Inquiries require support access."
 * Omit it for a generic phrasing.
 */
export function adminErrorMessage(
  kind: AdminFetchFailure,
  subject?: string,
  serverMessage?: string,
  action: AdminFetchAction = 'load',
): string {
  const verb = action === 'send' ? 'send' : action === 'save' ? 'save' : 'load';
  const verbing = action === 'send' ? 'sending' : action === 'save' ? 'saving' : 'loading';
  switch (kind) {
    case 'unauthorized':
      return 'Your session ended. Sign in again to continue.';
    case 'forbidden':
      // A gate that wrote real copy can explain itself better than we can guess.
      // Phrased around the reader, not the subject — "Employee accounts requires
      // a higher access level" does not agree, and every subject would need its
      // own verb form to fix that way.
      return usefulServerMessage(serverMessage)
        ?? `You do not have access to ${subject ?? 'this'}. Ask an owner if you need it.`;
    case 'notfound':
      return subject ? `Could not find ${subject}.` : 'Not found.';
    case 'rejected':
      // The server rejected the request for a stated reason (validation, a
      // conflict, a rate limit). That copy is the whole value of the response.
      return usefulServerMessage(serverMessage) ?? `Could not ${verb} ${subject ?? 'that'}. Try again.`;
    case 'network':
      return action === 'load'
        ? `Network error${subject ? ` loading ${subject}` : ''}. Check your connection and try again.`
        : `Network error — ${subject ?? 'it'} may not have been ${action === 'send' ? 'sent' : 'saved'}. Check before trying again.`;
    case 'server':
    default:
      // MP-2d: 5xx bodies are NOT shown. Several routes answer with
      // `{ error: e.message }`, and a Prisma exception embeds the failing query,
      // the model and often a field value — rendered verbatim into a banner for
      // whatever role reached the route. Server copy is honoured only for 403,
      // where ownerGateError is the whole point.
      return action === 'load'
        ? `Could not load ${subject ?? 'that'}. Try again.`
        : `Could not ${verb} ${subject ?? 'that'} — it may not have gone through. Check before trying again.`;
  }
}

// Routes commonly answer with a bare `{ error: 'Forbidden' }`. That is a status
// restated, not an explanation, and it is worse than the subject-aware copy
// below — so it does not count as a server message. Substantive copy (e.g.
// ownerGateError, which names the owner door and how to get through it) does.
const USELESS_SERVER_ERRORS = new Set(['forbidden', 'unauthorized', 'error', 'not found', 'bad request', 'internal server error']);

function usefulServerMessage(msg?: string): string | undefined {
  if (!msg) return undefined;
  return USELESS_SERVER_ERRORS.has(msg.trim().toLowerCase()) ? undefined : msg;
}

function classify(status: number): AdminFetchFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notfound';
  // MP-2e: these carry a reason the user needs ("Email already exists", "Too
  // many attempts"). Lumping them into 'server' discarded it.
  if (status === 400 || status === 409 || status === 422 || status === 429) return 'rejected';
  return 'server';
}

export async function adminFetch<T = unknown>(
  input: string,
  init?: RequestInit & { subject?: string; action?: AdminFetchAction },
): Promise<AdminFetchResult<T>> {
  const subject = init?.subject;
  const action = init?.action ?? 'load';
  try {
    const res = await fetch(input, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });

    if (!res.ok) {
      const kind = classify(res.status);
      // The body is best-effort: a gate may have written actionable copy, or
      // the response may not be JSON at all.
      const body = await res.json().catch(() => ({} as { error?: string }));
      return {
        ok: false,
        kind,
        status: res.status,
        message: adminErrorMessage(kind, subject, typeof body?.error === 'string' ? body.error : undefined, action),
      };
    }

    // A 2xx that isn't JSON is a bug, not an empty result — do not hand back
    // `undefined` for a caller to render as emptiness.
    const data = await res.json().catch(() => null);
    if (data === null) {
      return { ok: false, kind: 'server', status: res.status, message: adminErrorMessage('server', subject, undefined, action) };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, kind: 'network', status: null, message: adminErrorMessage('network', subject, undefined, action) };
  }
}
