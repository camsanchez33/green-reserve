import { prisma } from './prisma';
import type { Prisma } from '@prisma/client';

export class TeeTimeClaimError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'BLOCKED' | 'FULL' | 'SPOTS' | 'CONFLICT',
    public readonly spotsLeft?: number
  ) {
    super(code);
  }
}

/**
 * Atomically creates a booking and updates tee-time capacity.
 * Runs in a SERIALIZABLE transaction — concurrent requests that would exceed
 * capacity trigger a PostgreSQL serialization failure (P2034), which is caught
 * and re-thrown as TeeTimeClaimError('CONFLICT').
 *
 * All booking fields must be pre-computed by the caller. The teeTimeId and
 * players fields in `data` drive the capacity check.
 */
export async function claimTeeTime(
  data: Prisma.BookingUncheckedCreateInput
): Promise<{ id: string; checkInToken: string | null }> {
  const teeTimeId = String(data.teeTimeId);
  const players = Number(data.players);

  try {
    return await prisma.$transaction(
      async (tx) => {
        const teeTime = await tx.teeTime.findUnique({
          where: { id: teeTimeId },
          select: { id: true, playersBooked: true, playersAvailable: true, status: true },
        });

        if (!teeTime) throw new TeeTimeClaimError('NOT_FOUND');
        if (teeTime.status === 'blocked') throw new TeeTimeClaimError('BLOCKED');

        const spotsLeft = teeTime.playersAvailable - teeTime.playersBooked;
        if (players > spotsLeft) {
          throw new TeeTimeClaimError(spotsLeft <= 0 ? 'FULL' : 'SPOTS', spotsLeft);
        }

        const booking = await tx.booking.create({ data });

        const newBooked = teeTime.playersBooked + players;
        await tx.teeTime.update({
          where: { id: teeTimeId },
          data: {
            playersBooked: newBooked,
            status: newBooked >= teeTime.playersAvailable ? 'full' : 'available',
          },
        });

        return { id: booking.id, checkInToken: booking.checkInToken };
      },
      { isolationLevel: 'Serializable' }
    );
  } catch (err) {
    if (err instanceof TeeTimeClaimError) throw err;
    // PostgreSQL serialization failure: two concurrent transactions conflicted
    if ((err as { code?: string }).code === 'P2034') {
      throw new TeeTimeClaimError('CONFLICT');
    }
    throw err;
  }
}
