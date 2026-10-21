-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "staffLastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminGoal" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminGoal_dueAt_idx" ON "AdminGoal"("dueAt");
