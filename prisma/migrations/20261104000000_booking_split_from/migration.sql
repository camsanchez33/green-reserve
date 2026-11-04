-- PARTIAL-1 (2026-11-04): additive — a nullable link from a split-off booking to its original.
ALTER TABLE "Booking" ADD COLUMN "splitFromId" TEXT;
CREATE INDEX "Booking_splitFromId_idx" ON "Booking"("splitFromId");
