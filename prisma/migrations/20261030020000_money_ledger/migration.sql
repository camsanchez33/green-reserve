-- CreateTable
CREATE TABLE "MoneyMove" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "what" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "platformFeeCents" INTEGER NOT NULL DEFAULT 0,
    "stripeId" TEXT,
    "bookingId" TEXT,
    "saleId" TEXT,
    "membershipId" TEXT,
    "eventPaymentId" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MoneyMove_stripeId_key" ON "MoneyMove"("stripeId");

-- CreateIndex
CREATE INDEX "MoneyMove_courseId_at_idx" ON "MoneyMove"("courseId", "at");

-- CreateIndex
CREATE INDEX "MoneyMove_bookingId_idx" ON "MoneyMove"("bookingId");

-- CreateIndex
CREATE INDEX "MoneyMove_membershipId_idx" ON "MoneyMove"("membershipId");

-- AddForeignKey
ALTER TABLE "MoneyMove" ADD CONSTRAINT "MoneyMove_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

