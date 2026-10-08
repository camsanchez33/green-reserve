-- CreateTable
CREATE TABLE "MonthlyReview" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "isBaseline" BOOLEAN NOT NULL DEFAULT false,
    "metrics" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "body" TEXT,
    "model" TEXT,
    "error" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyReview_courseId_idx" ON "MonthlyReview"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReview_courseId_month_key" ON "MonthlyReview"("courseId", "month");

-- AddForeignKey
ALTER TABLE "MonthlyReview" ADD CONSTRAINT "MonthlyReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
