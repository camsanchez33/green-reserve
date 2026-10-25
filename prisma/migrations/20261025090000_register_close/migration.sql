-- CreateTable
CREATE TABLE "RegisterClose" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "openingFloatCents" INTEGER NOT NULL,
    "cashSalesCents" INTEGER NOT NULL,
    "counterRoundsCents" INTEGER NOT NULL,
    "cashRefundsCents" INTEGER NOT NULL,
    "expectedCashCents" INTEGER NOT NULL,
    "countedCashCents" INTEGER NOT NULL,
    "differenceCents" INTEGER NOT NULL,
    "cardCents" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "closedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegisterClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegisterClose_courseId_day_idx" ON "RegisterClose"("courseId", "day");

-- AddForeignKey
ALTER TABLE "RegisterClose" ADD CONSTRAINT "RegisterClose_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
