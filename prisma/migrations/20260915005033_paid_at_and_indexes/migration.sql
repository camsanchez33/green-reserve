-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Booking_courseId_checkedInAt_idx" ON "Booking"("courseId", "checkedInAt");

-- CreateIndex
CREATE INDEX "Booking_courseId_paidAt_idx" ON "Booking"("courseId", "paidAt");

-- CreateIndex
CREATE INDEX "CourseMembership_courseId_lastPaidAt_idx" ON "CourseMembership"("courseId", "lastPaidAt");


-- Backfill: rounds already paid get their check-in time as the payment time (the old approximation), else the booking time.
UPDATE "Booking" SET "paidAt" = COALESCE("checkedInAt", "createdAt") WHERE "paymentStatus" = 'paid' AND "paidAt" IS NULL;
