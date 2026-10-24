-- FEE-AT-BOOKING (Cam 2026-10-24): GreenReserve's fee taken when the golfer books (additive; unused while FEE_AT_BOOKING_ON is false).
-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "feePaidCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "feePaymentIntentId" TEXT NOT NULL DEFAULT '';

