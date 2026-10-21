// AW-1c: the client half of "Confirm it's you". A risky owner route answers
// 403 { code: 'step_up' } when the session's last confirmation is over five
// minutes old. stepUpFetch hands that to the dialog the admin layout mounts
// (StepUpDialog), waits for the owner to confirm, and sends the request again
// once. No dialog mounted, or the owner closes it: the 403 comes back as is.

type Handler = () => Promise<boolean>;
let handler: Handler | null = null;
let pending: Promise<boolean> | null = null;

export function registerStepUpHandler(h: Handler | null) { handler = h; }

async function needsStepUp(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = await res.clone().json().catch(() => null) as { code?: unknown } | null;
  return body?.code === 'step_up';
}

export async function stepUpFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (!handler || !(await needsStepUp(res))) return res;
  // Two requests refused at once share one dialog.
  pending ??= handler().finally(() => { pending = null; });
  if (!(await pending)) return res;
  return fetch(input, init);
}
