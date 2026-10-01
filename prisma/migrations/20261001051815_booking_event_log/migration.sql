-- CreateEnum
CREATE TYPE "BookingEventType" AS ENUM ('booking_created', 'booking_cancelled', 'checked_in', 'no_show_marked', 'no_show_cleared', 'fee_charged', 'fee_refunded');

-- CreateEnum
CREATE TYPE "EventActorType" AS ENUM ('golfer', 'staff', 'admin', 'cron', 'system');

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "BookingEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "EventActorType" NOT NULL,
    "actorId" TEXT,
    "amountCents" INTEGER,
    "playerCount" INTEGER,
    "teeTimeAt" TIMESTAMP(3),
    "stripeId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingEvent_stripeId_key" ON "BookingEvent"("stripeId");

-- CreateIndex
CREATE INDEX "BookingEvent_courseId_occurredAt_idx" ON "BookingEvent"("courseId", "occurredAt");

-- CreateIndex
CREATE INDEX "BookingEvent_bookingId_occurredAt_idx" ON "BookingEvent"("bookingId", "occurredAt");

-- CreateIndex
CREATE INDEX "BookingEvent_type_occurredAt_idx" ON "BookingEvent"("type", "occurredAt");
