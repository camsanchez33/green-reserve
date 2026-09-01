import { prisma } from '@/lib/prisma';
import { centsToDollarsOr0 } from '@/lib/money';

export interface StripeGoLiveCheck {
  // STRIPE RULE FINAL (RUN_QUEUE): Stripe connected + card_payments active
  // is REQUIRED for every course to go live — no override, no fee-based
  // exception. `required` is always true now; kept in the shape so callers
  // that already branch on it don't need to change, but it's no longer a
  // real question. Exploring the dashboard pre-live is still fully
  // Stripe-free (that's a separate, unenforced-here concern).
  required: boolean;
  ok: boolean; // === stripeAccountActive
  lateCancellationFee: number;
  stripeAccountActive: boolean;
}

// ONE function, used by BOTH the preflight-check GET (modal display) and
// the mark_live POST (server enforcement) — no split brains. If the modal
// says something is missing, the server evaluates the exact same check.
export async function computeStripeGoLiveCheck(courseId: string): Promise<StripeGoLiveCheck | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { lateCancellationFeeCents: true, stripeAccountActive: true },
  });
  if (!course) return null;

  return {
    required: true,
    ok: course.stripeAccountActive,
    // MP-3 B2b: cents at rest; this contract stays dollars (consumers render it).
    lateCancellationFee: centsToDollarsOr0(course.lateCancellationFeeCents),
    stripeAccountActive: course.stripeAccountActive,
  };
}
