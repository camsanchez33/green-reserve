-- CreateTable
CREATE TABLE "ExpenseBudget" (
    "id" TEXT NOT NULL DEFAULT 'monthly',
    "cents" INTEGER,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setBy" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ExpenseBudget_pkey" PRIMARY KEY ("id")
);

