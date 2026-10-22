-- AlterTable
ALTER TABLE "CourseEvent" ADD COLUMN     "finalHeadcount" INTEGER;

-- CreateTable
CREATE TABLE "CourseEventPayment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payToken" TEXT NOT NULL DEFAULT '',
    "paymentIntentId" TEXT NOT NULL DEFAULT '',
    "chargeStartedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "payerName" TEXT NOT NULL DEFAULT '',
    "payerEmail" TEXT NOT NULL DEFAULT '',
    "payerPhone" TEXT NOT NULL DEFAULT '',
    "headcount" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseEventPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseEventRefund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripeRefundId" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseEventRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseEventPayment_eventId_idx" ON "CourseEventPayment"("eventId");

-- CreateIndex
CREATE INDEX "CourseEventPayment_courseId_status_idx" ON "CourseEventPayment"("courseId", "status");

-- CreateIndex
CREATE INDEX "CourseEventRefund_paymentId_idx" ON "CourseEventRefund"("paymentId");

-- AddForeignKey
ALTER TABLE "CourseEventPayment" ADD CONSTRAINT "CourseEventPayment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CourseEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEventRefund" ADD CONSTRAINT "CourseEventRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "CourseEventPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
