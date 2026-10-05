// BIRDIE_AI_SPEC B4b — the confirm-card shape, shared by the server (which
// builds cards in proposals.ts) and the widget (which shows them and makes the
// call). Kept free of server imports so the widget can use it.
export type ProposalCall = { method: 'PATCH' | 'POST' | 'DELETE'; path: '/api/operator/schedule' | '/api/operator/blackouts'; body: Record<string, unknown> };
export type ProposalCard = {
  id: string;
  title: string;
  changes: { label: string; from: string; to: string }[];
  note: string;
  call: ProposalCall;
};

/** The only routes a card may call, and how. The widget refuses anything else. */
export const PROPOSAL_ROUTES: Record<ProposalCall['path'], ProposalCall['method'][]> = {
  '/api/operator/schedule': ['PATCH'],
  '/api/operator/blackouts': ['POST', 'DELETE'],
};

/** Shape-checks a card that arrived over the wire before the widget renders or calls it. */
export function isProposalCard(v: unknown): v is ProposalCard {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  const call = c.call as Record<string, unknown> | undefined;
  if (typeof c.id !== 'string' || typeof c.title !== 'string' || typeof c.note !== 'string' || !Array.isArray(c.changes)) return false;
  if (!call || typeof call.path !== 'string' || typeof call.method !== 'string' || !call.body || typeof call.body !== 'object') return false;
  const allowed = PROPOSAL_ROUTES[call.path as ProposalCall['path']];
  return !!allowed && allowed.includes(call.method as ProposalCall['method'])
    && c.changes.every(x => x && typeof x === 'object' && ['label', 'from', 'to'].every(k => typeof (x as Record<string, unknown>)[k] === 'string'));
}
