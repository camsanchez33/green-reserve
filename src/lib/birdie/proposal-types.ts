// BIRDIE_AI_SPEC B4b — the confirm-card shape, shared by the server (which
// builds cards in proposals.ts) and the widget (which shows them and makes the
// call). Kept free of server imports so the widget can use it.
export type ProposalCall = { method: 'PATCH' | 'POST' | 'DELETE'; path: '/api/operator/schedule' | '/api/operator/blackouts' | '/api/operator/bookings' | '/api/operator/tee-times'; body: Record<string, unknown> };
export type ProposalCard = {
  id: string;
  title: string;
  changes: { label: string; from: string; to: string }[];
  note: string;
  call: ProposalCall;
  /** ACT-2: a card that makes several calls (block 7:00–8:00 = one call per
   *  time). When present it replaces `call`; they run in order and stop at the
   *  first refusal. `call` is always `calls[0]`. */
  calls?: ProposalCall[];
};

/** The only routes a card may call, and how. The widget refuses anything else. */
export const PROPOSAL_ROUTES: Record<ProposalCall['path'], ProposalCall['method'][]> = {
  '/api/operator/schedule': ['PATCH'],
  '/api/operator/blackouts': ['POST', 'DELETE'],
  // ACT-2: the tee sheet. The bookings route also cancels, checks in and marks
  // paid — those actions are NOT Birdie's (BODY_RULES below keeps them off).
  '/api/operator/bookings': ['PATCH', 'POST'],
  '/api/operator/tee-times': ['PATCH'],
};

const sameKeys = (body: Record<string, unknown>, keys: string[]) => Object.keys(body).sort().join() === [...keys].sort().join();

/** What a card's body may ask of a route that does more than one thing. */
const BODY_RULES: Partial<Record<ProposalCall['path'], (method: string, body: Record<string, unknown>) => boolean>> = {
  // Move a group or send a pay link; never cancel, check in, mark paid or no-show.
  '/api/operator/bookings': (method, body) => method === 'POST'
    ? body.checkInNow !== true && (body.source === 'phone' || body.source === 'walk_in')
    : (body.action === 'move' && sameKeys(body, ['id', 'action', 'newTeeTimeId'])) || (body.action === 'send_pay_link' && sameKeys(body, ['id', 'action', 'via'])),
  // Block or open a time; nothing else.
  '/api/operator/tee-times': (_m, body) => body.status === 'blocked' || body.status === 'available',
};

function isAllowedCall(call: unknown): call is ProposalCall {
  if (!call || typeof call !== 'object') return false;
  const c = call as Record<string, unknown>;
  if (typeof c.path !== 'string' || typeof c.method !== 'string' || !c.body || typeof c.body !== 'object' || Array.isArray(c.body)) return false;
  const allowed = PROPOSAL_ROUTES[c.path as ProposalCall['path']];
  if (!allowed || !allowed.includes(c.method as ProposalCall['method'])) return false;
  const rule = BODY_RULES[c.path as ProposalCall['path']];
  return !rule || rule(c.method, c.body as Record<string, unknown>);
}

/** Every call a card makes, in order. */
export const cardCalls = (card: ProposalCard): ProposalCall[] => card.calls?.length ? card.calls : [card.call];

/** Shape-checks a card that arrived over the wire before the widget renders or calls it. */
export function isProposalCard(v: unknown): v is ProposalCard {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (typeof c.id !== 'string' || typeof c.title !== 'string' || typeof c.note !== 'string' || !Array.isArray(c.changes)) return false;
  if (!isAllowedCall(c.call)) return false;
  if (c.calls !== undefined && (!Array.isArray(c.calls) || c.calls.length === 0 || c.calls.length > 60 || !c.calls.every(isAllowedCall))) return false;
  return c.changes.every(x => x && typeof x === 'object' && ['label', 'from', 'to'].every(k => typeof (x as Record<string, unknown>)[k] === 'string'));
}
