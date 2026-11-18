-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "bookingAccent" TEXT NOT NULL DEFAULT 'green',
ADD COLUMN     "bookingLook" TEXT NOT NULL DEFAULT 'light';

-- CreateTable
CREATE TABLE "CourseSettingChange" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL DEFAULT '',
    "field" TEXT NOT NULL,
    "before" TEXT NOT NULL DEFAULT '',
    "after" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSettingChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseSettingChange_courseId_createdAt_idx" ON "CourseSettingChange"("courseId", "createdAt");

