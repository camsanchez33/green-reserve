-- AlterEnum
ALTER TYPE "BookingEventType" ADD VALUE 'price_changed';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "residentPlayers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "residentRateCents" INTEGER;

-- CreateTable
CREATE TABLE "CourseResident" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "cardNumber" TEXT NOT NULL DEFAULT '',
    "expiresOn" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "addedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseResident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseResident_courseId_idx" ON "CourseResident"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseResident_courseId_email_key" ON "CourseResident"("courseId", "email");

-- AddForeignKey
ALTER TABLE "CourseResident" ADD CONSTRAINT "CourseResident_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
