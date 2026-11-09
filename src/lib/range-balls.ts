// CART-3: range-ball buckets on a booking — pure, browser-safe (checkout's rows and lib/checkout-extras both read it).
export const BALL_SIZES = ['small', 'medium', 'large'] as const;
export type BallSize = typeof BALL_SIZES[number];
export type BallCounts = Record<BallSize, number>;
export const MAX_BUCKETS = 20;

/** Read the booking's buckets ("small:2,large:1"; a bare "medium" from an online booking is one bucket). */
export function ballCounts(sizeField: string | null | undefined, _totalCents = 0): BallCounts {
  const out: BallCounts = { small: 0, medium: 0, large: 0 };
  const s = (sizeField ?? '').trim().toLowerCase();
  if (!s) return out;
  if ((BALL_SIZES as readonly string[]).includes(s)) { out[s as BallSize] = 1; return out; }
  for (const part of s.split(',')) {
    const [k, v] = part.split(':');
    const n = Number(v);
    if ((BALL_SIZES as readonly string[]).includes(k) && Number.isInteger(n) && n > 0) out[k as BallSize] = Math.min(MAX_BUCKETS, n);
  }
  return out;
}
export const ballField = (c: BallCounts) => BALL_SIZES.filter(k => c[k] > 0).map(k => `${k}:${c[k]}`).join(',');
export const ballWords = (c: BallCounts) => BALL_SIZES.filter(k => c[k] > 0).map(k => `${c[k]} ${k}`).join(' · ');

