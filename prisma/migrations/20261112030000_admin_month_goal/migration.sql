-- CreateTable
CREATE TABLE "AdminMonthGoal" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "cents" INTEGER,
    "setById" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminMonthGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminMonthGoal_month_key" ON "AdminMonthGoal"("month");

