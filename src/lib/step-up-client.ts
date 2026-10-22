// AW-1c: the client half of "Confirm it's you". A risky owner route answers
// 403 { code: 'step_up' } when the session's last confirmation is over five
// minutes old. stepUpFetch hands that to the dialog the admin layout mounts
// (StepUpDialog), waits for the owner to confirm, and sends the request again
// once. No dialog mounted, or the owner closes it: the 403 comes back as is.
//
// BRAIN-1a: the same for "say why". A money, access or delete action answers
// 400 { code: 'reason_required', label } without a reason; stepUpFetch asks
// through ReasonDialog (also mounted by the layout) and sends the request again
// with the reason — in the JSON body, or as ?reason= when there is no body.
// Closing the box returns the 400 as is (the caller shows "Say why…").

type Handler = () => Promise<boolean>;
type ReasonHandler = (label: string) => Promise<string | null>;
let handler: Handler | null = null;
let reasonHandler: ReasonHandler | null = null;
let pending: Promise<boolean> | null = null;
let reasonPending: Promise<string | null> | null = null;

export function registerStepUpHandler(h: Handler | null) { handler = h; }
export function registerReasonHandler(h: ReasonHandler | null) { reasonHandler = h; }

/** Ask once up front (a bulk action asks one reason for all its requests). null = closed, or no box mounted. */
export function askReason(label: string): Promise<string | null> {
  return reasonHandler ? reasonHandler(label) : Promise.resolve(null);
}

async function needsStepUp(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = await res.clone().json().catch(() => null) as { code?: unknown } | null;
  return body?.code === 'step_up';
}

async function reasonAsk(res: Response): Promise<string | null> {
  if (res.status !== 400) return null;
  const body = await res.clone().json().catch(() => null) as { code?: unknown; label?: unknown } | null;
  return body?.code === 'reason_required' ? String(body.label ?? '') : null;
}

/** The same request, carrying `reason`. */
export function withReason(input: string, init: RequestInit | undefined, reason: string): [string, RequestInit | undefined] {
  if (typeof init?.body === 'string') {
    try {
      const parsed = JSON.parse(init.body);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return [input, { ...init, body: JSON.stringify({ ...parsed, reason }) }];
    } catch { /* not JSON: fall through to the query string */ }
  }
  const url = new URL(input, 'http://x');
  url.searchParams.set('reason', reason);
  return [input.startsWith('http') ? url.toString() : url.pathname + url.search, init];
}

export async function stepUpFetch(input: string, init?: RequestInit): Promise<Response> {
  let res = await fetch(input, init);
  if (handler && (await needsStepUp(res))) {
    // Two requests refused at once share one dialog.
    pending ??= handler().finally(() => { pending = null; });
    if (!(await pending)) return res;
    res = await fetch(input, init);
  }
  const label = reasonHandler ? await reasonAsk(res) : null;
  if (label === null || !reasonHandler) return res;
  // Two requests asking at once share one box (as with step-up).
  reasonPending ??= reasonHandler(label).finally(() => { reasonPending = null; });
  const reason = await reasonPending;
  if (!reason) return res;
  const [i2, init2] = withReason(input, init, reason);
  return fetch(i2, init2);
}
