// R-AUTH-003 / R-GOLF-003 (G13) — who may manage a booking from the golfer side.
//
// The booking's emailed token is the proof. Cam 2026-11-18: there are no GreenReserve-wide golfer accounts, so
// the "signed-in golfer owns the booking" branch is gone; every golfer-side manage/cancel route uses this one check.

export function canManageBooking(
  booking: { checkInToken: string | null },
  token: string | null | undefined,
): boolean {
  return !!token && !!booking.checkInToken && booking.checkInToken === token;
}
