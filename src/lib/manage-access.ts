// R-AUTH-003 / R-GOLF-003 (G13) — who may manage a booking from the golfer side.
//
// Either proof is enough: the signed-in golfer owns the booking, OR the request
// carries the booking's emailed token. These used to be either/or — a gr_golfer
// cookie meant the token was never checked — so a golfer signed in on their phone
// who booked as a guest elsewhere got "Invalid or expired link" from their own
// confirmation email. Every golfer-side manage/cancel route uses this one check.

export function canManageBooking(
  booking: { golferAccountId: string | null; checkInToken: string | null },
  golferId: string | null | undefined,
  token: string | null | undefined,
): boolean {
  if (golferId && booking.golferAccountId === golferId) return true;
  return !!token && !!booking.checkInToken && booking.checkInToken === token;
}
