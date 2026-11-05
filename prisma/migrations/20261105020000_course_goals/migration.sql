-- HOME-2 (Cam 2026-11-05): goals on metrics the course picks. Additive: a new table only.
-- CreateTable
CREATE TABLE "CourseGoal" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "target" INTEGER,
    "setBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseGoal_courseId_month_metric_key" ON "CourseGoal"("courseId", "month", "metric");
