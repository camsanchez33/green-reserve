-- Cam 2026-10-29: staff refunds of a round's course share appear on the booking's Timeline. Additive enum value.
ALTER TYPE "BookingEventType" ADD VALUE 'round_refunded';
