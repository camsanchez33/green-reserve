-- SEATS-1 (Cam 2026-11-08): open seats staff closed on a time. Additive only.
ALTER TABLE "TeeTime" ADD COLUMN "seatsClosed" INTEGER NOT NULL DEFAULT 0;
-- RECEIPT-2 review: the receipt finds a round's register sale by booking.
CREATE INDEX "ShopSaleLine_bookingId_idx" ON "ShopSaleLine"("bookingId");
