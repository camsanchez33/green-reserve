import { prisma } from './prisma';

/**
 * The setup-sheet token gate, shared by every route a `detailsToken` opens.
 *
 * MP-1 #7 fixed this in api/inquiries/details and left api/inquiries/upload on
 * the old list, so an archived or expired token still held a working
 * authenticated Blob write endpoint. Two copies of a security gate is one copy
 * too many — it lives here now and both routes call it.
 *
 * (a) A closed inquiry cannot be reopened through its old sheet link. The
 *     routes used to block building/live/rejected but not 'archived', so an
 *     archived course's operator could resubmit and flip the lead back into the
 *     active funnel, past every guarded lifecycle transition.
 * (b) The token expires. There is no detailsTokenExpiry column and MP-1 was a
 *     no-migration run, so the issue time is DERIVED from the ledger that
 *     already records it: the most recent event whose toStatus is
 *     'details_requested'. A resend writes that event again and so legitimately
 *     restarts the clock, which is what a real expiry wants.
 */
export const CLOSED_TO_SHEET = ['building', 'live', 'rejected', 'archived'];
export const DETAILS_TOKEN_TTL_DAYS = 60;

export type SheetGate = { error: string; status: number } | null;

export async function gateSheetAccess(
  inquiry: { id: string; status: string; createdAt: Date },
): Promise<SheetGate> {
  if (CLOSED_TO_SHEET.includes(inquiry.status)) {
    return { error: 'This inquiry has already moved past the setup-sheet stage.', status: 409 };
  }

  const sentEvent = await prisma.inquiryStatusEvent.findFirst({
    where: { inquiryId: inquiry.id, toStatus: 'details_requested' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  // No event (a pre-ledger inquiry) falls back to the inquiry's own age rather
  // than failing open — an unbounded token is the bug being fixed.
  const issuedAt = sentEvent?.createdAt ?? inquiry.createdAt;
  const ageDays = (Date.now() - issuedAt.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays > DETAILS_TOKEN_TTL_DAYS) {
    return {
      error: 'This setup-sheet link has expired. Reply to your GreenReserve email and we will send you a fresh one.',
      status: 410,
    };
  }

  return null;
}
