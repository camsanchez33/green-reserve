-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "conditionsDetail" JSONB,
ADD COLUMN     "conditionsDetailAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ShiftNote" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL DEFAULT '',
    "authorName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ShiftNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseMonthGoal" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "cents" INTEGER,
    "setBy" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseMonthGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftNote_courseId_createdAt_idx" ON "ShiftNote"("courseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseMonthGoal_courseId_month_key" ON "CourseMonthGoal"("courseId", "month");

