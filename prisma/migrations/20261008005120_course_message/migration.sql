-- CreateTable
CREATE TABLE "CourseMessage" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "fromTime" TEXT,
    "toTime" TEXT,
    "body" TEXT NOT NULL,
    "sentEmail" INTEGER NOT NULL DEFAULT 0,
    "sentSms" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "sentBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseMessage_courseId_createdAt_idx" ON "CourseMessage"("courseId", "createdAt");

-- AddForeignKey
ALTER TABLE "CourseMessage" ADD CONSTRAINT "CourseMessage_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
