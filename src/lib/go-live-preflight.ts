import { prisma } from '@/lib/prisma';

export interface StripeGoLiveCheck {
  // Stripe is only a hard requirement when there's a fee it needs to
  // enforce — a no-card, no-fee course has nothing for Stripe to do at
  // check-in (RUN_QUEUE "go-live override... " item 1).
  required: boolean;
  ok: boolean; // required ? stripeAccountActive : true
  lateCancellationFee: number;
  stripeAccountActive: boolean;
}

// ONE function, used by BOTH the preflight-check GET (modal display) and
// the mark_live POST (server enforcement) — no split brains. If the modal
// says override is available, the server evaluates the exact same
// `required`/`ok` pair and will honor it.
export async function computeStripeGoLiveCheck(courseId: string): Promise<StripeGoLiveCheck | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { lateCancellationFee: true, stripeAccountActive: true },
  });
  if (!course) return null;

  const required = course.lateCancellationFee > 0;
  return {
    required,
    ok: !required || course.stripeAccountActive,
    lateCancellationFee: course.lateCancellationFee,
    stripeAccountActive: course.stripeAccountActive,
  };
}
